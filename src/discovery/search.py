"""
Discovery via OpenAI web search. Runs once, offline of the demo path, and the
result is committed as data/corpus.json.

One call. The scout sweeps all eight categories and returns the single event it
would stake the series on, plus the candidates it rejected. Selection is part of
the hunt rather than a stage after it — a second pass re-ranking candidates the
same model just scored would cost money to re-derive a decision already made.

The scout prompt does the judging (see prompts/hunter.md). This module does the
three things a prompt cannot be trusted with: it forces the output into a strict
schema, it recomputes the scores the schema cannot bound, and it discards any
candidate citing a page the model never opened.
"""

import os
import json
import pathlib
from typing import Any, Dict, Iterable, List, Set
from urllib.parse import urlparse

from src.util import log
from src.discovery.cache import save_raw

PROMPTS = pathlib.Path(__file__).resolve().parent / "prompts"

# Stated in the prompt as well. Re-checked here because a prompt cannot be relied
# on to enforce its own threshold, and a scored-but-rejected candidate is
# diagnostic information worth logging.
MIN_TOTAL = 38

# hunter.md's disqualifying rule: a high total built on a mechanism that stops
# after episode twenty is a film with good marks.
MIN_ENGINE_LONGEVITY = 7

# The five rubric axes, in the order hunter.md states them. `total` is not one of
# them: it is derived from these here rather than believed.
SCORE_FIELDS = ("engine_longevity", "hook_density", "emotional_immediacy",
                "conflict", "cast_depth")
SCORE_MAX = 10

# Asked for in the BRIEF, because a strict schema cannot express `minItems`. One
# winner and two also-rans is not a sourcing queue — the editor has to be able to
# reject most of a screen and still have a shortlist left.
MIN_ALSO_CONSIDERED = 8

# Truncation is detected downstream, but detection after a paid multi-minute
# search is worse than a bounded call.
MAX_OUTPUT_TOKENS = 32000

CATEGORIES = ["DENIED IDENTITY", "SECRET STATUS", "REVENGE", "THE LONG DECEPTION",
              "FAMILY BETRAYAL", "THE BARGAIN COMES DUE", "SUPERNATURAL INTRUSION",
              "THE DOUBLE LIFE"]

BRIEF = (
    "Hunt all eight categories. Search several times per category and vary your "
    "vocabulary between news language, court language and plain description "
    "before you settle on anything.\n\n"
    "Then return one winner and AT LEAST {min_others} other candidates in "
    "`also_considered`. Every candidate you return must score {min_total}+ in "
    "total. If fewer than {min_others} clear that, go back to the categories you "
    "covered least and hunt again rather than returning a short list — an editor "
    "reads this as a queue and needs enough of it to reject most of it.\n\n"
    "A candidate you had to refuse on legal or rights grounds still comes back, "
    "with `clearance.status` `blocked` and the reason. Only the hard content "
    "exclusions are dropped entirely."
)

_CAST = {
    "type": "object",
    "additionalProperties": False,
    "required": ["name_or_role", "motive", "spinoff_potential"],
    "properties": {
        "name_or_role": {"type": "string"},
        "motive": {"type": "string"},
        "spinoff_potential": {"type": "string", "enum": ["high", "med", "low"]},
    },
}

# Strict mode drops `minimum`/`maximum`, so the 0-10 band the rubric states is
# unenforceable here and `total` is only ever whatever the model typed. Both are
# fixed after parsing, in _normalise_scores.
_SCORES = {
    "type": "object",
    "additionalProperties": False,
    "required": ["engine_longevity", "hook_density", "emotional_immediacy",
                 "conflict", "cast_depth", "total"],
    "properties": {
        "engine_longevity": {"type": "integer"},
        "hook_density": {"type": "integer"},
        "emotional_immediacy": {"type": "integer"},
        "conflict": {"type": "integer"},
        "cast_depth": {"type": "integer"},
        "total": {"type": "integer"},
    },
}

_CANDIDATE = {
    "type": "object",
    "additionalProperties": False,
    "required": ["title", "category", "one_line", "year", "where", "mechanism",
                 "engine", "episode_estimate", "cast", "scores", "clearance",
                 "prior_adaptations", "sources", "why_this_sells", "why_not"],
    "properties": {
        "title": {"type": "string"},
        # An enum is the only place "one of the eight, exact name" can actually
        # hold — the prompt can ask, the schema enforces.
        "category": {"type": "string", "enum": CATEGORIES},
        "one_line": {"type": "string"},
        "year": {"type": "string"},
        "where": {"type": "string"},
        "mechanism": {"type": "string"},
        "engine": {"type": "string"},
        "episode_estimate": {"type": "integer"},
        "cast": {"type": "array", "items": _CAST},
        "scores": _SCORES,
        "clearance": {
            "type": "object",
            "additionalProperties": False,
            "required": ["status", "reasons"],
            "properties": {
                "status": {"type": "string", "enum": ["greenlight", "fictionalize_first", "blocked"]},
                "reasons": {"type": "array", "items": {"type": "string"}},
            },
        },
        "prior_adaptations": {"type": "array", "items": {"type": "string"}},
        "sources": {"type": "array", "items": {"type": "string"}},
        "why_this_sells": {"type": "string"},
        # The queue screen's second-most-read line after the title: an also-ran
        # without a stated reason for losing is a row an editor cannot act on.
        # Strict mode requires every property, so the winner answers it too — as
        # the strongest case against itself.
        "why_not": {"type": "string"},
    },
}

HUNT_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["winner", "also_considered"],
    "properties": {
        "winner": _CANDIDATE,
        "also_considered": {"type": "array", "items": _CANDIDATE},
    },
}


def load_prompt(name: str = "hunter.md") -> str:
    """Prompts live on disk and are loaded at runtime — never inlined here."""
    return (PROMPTS / name).read_text(encoding="utf-8")


def domain_of(url: str) -> str:
    """Bare host, for showing where a candidate came from. No grading."""
    try:
        host = urlparse(url).netloc.lower().split(":")[0]
    except ValueError:
        return ""
    return host[4:] if host.startswith("www.") else host


_TRACKING = ("utm_", "ref=", "fbclid=", "gclid=")


def normalise_url(url: str) -> str:
    """
    Compare-safe form of a URL.

    Grounding matches what the model cited against what the tool opened, and the
    two arrive in different shapes: inline citations carry a `utm_source`
    tracking parameter that the raw source list does not, and trailing slashes
    and `www.` differ freely between them. Matching raw strings would report
    every candidate as fabricated.
    """
    try:
        p = urlparse(url.strip())
    except ValueError:
        return url.strip().lower()
    host = p.netloc.lower().split(":")[0]
    if host.startswith("www."):
        host = host[4:]
    query = "&".join(kv for kv in p.query.split("&")
                     if kv and not kv.startswith(_TRACKING))
    path = p.path.rstrip("/")
    return f"{host}{path}" + (f"?{query}" if query else "")


def ground_candidates(candidates: Iterable[Dict[str, Any]],
                      consulted: Set[str]) -> List[Dict[str, Any]]:
    """
    Keep only URLs the model actually opened, and drop any candidate left with
    none. A fabricated citation is worse than a missing candidate: the demo puts
    source links on screen and everything downstream treats a corpus item as
    sourced.
    """
    index = {normalise_url(u) for u in consulted}
    kept = []
    for c in candidates:
        grounded = [u for u in c.get("sources", []) if normalise_url(u) in index]
        if not grounded:
            log(f"dropped ungrounded candidate: {c.get('title', '?')}", "warn")
            continue
        kept.append(dict(c, sources=grounded))
    return kept


def _model() -> str:
    return (os.environ.get("OPENAI_MODEL_SCOUT")
            or os.environ.get("OPENAI_MODEL_SCORER")
            or "gpt-5.6-luna")


def _consulted_urls(response: Any) -> Set[str]:
    """
    Every URL the search tool actually opened. `include` asks for the full source
    list, which is a superset of the inline citations; annotations are read as
    well so a response carrying only citations still grounds.
    """
    urls: Set[str] = set()
    for item in getattr(response, "output", []) or []:
        data = item.model_dump() if hasattr(item, "model_dump") else dict(item)

        action = data.get("action") or {}
        for src in action.get("sources") or []:
            url = src.get("url") if isinstance(src, dict) else src
            if url:
                urls.add(url)
        # open_page / find_in_page put the page on the action itself, not in
        # `sources` — the literal act of opening a page is the shape a
        # sources-only read misses.
        if action.get("url"):
            urls.add(action["url"])

        for block in data.get("content") or []:
            if not isinstance(block, dict):
                continue
            for ann in block.get("annotations") or []:
                if isinstance(ann, dict) and ann.get("url"):
                    urls.add(ann["url"])
    return urls


def _decorate(candidate: Dict[str, Any], is_winner: bool) -> Dict[str, Any]:
    candidate["domain"] = domain_of(candidate["sources"][0])
    candidate["winner"] = is_winner
    return candidate


def _normalise_scores(c: Dict[str, Any]) -> Dict[str, Any]:
    """
    Take the sub-scores as the only evidence and derive `total` from them.

    `MIN_TOTAL` gates on `total`, and `total` arrives as a number the model typed
    next to five other numbers it typed. Sub-scores summing to 30 under a claimed
    45 clears a floor it should have failed, and no schema catches it: strict mode
    has no `minimum`/`maximum` either, so a 47 on one axis is equally legal. Both
    corrections are logged — a model that keeps mis-adding is a prompt problem,
    and silently fixing it hides the signal.
    """
    scores = c.get("scores") or {}
    title = c.get("title", "?")

    for field in SCORE_FIELDS:
        raw = scores.get(field, 0)
        clamped = max(0, min(SCORE_MAX, raw))
        if clamped != raw:
            log(f"'{title}': {field} came back {raw}, outside 0-{SCORE_MAX} — "
                f"clamped to {clamped}", "warn")
        scores[field] = clamped

    computed = sum(scores[f] for f in SCORE_FIELDS)
    claimed = scores.get("total")
    if claimed != computed:
        log(f"'{title}': model reported total {claimed}, sub-scores sum to "
            f"{computed} — using {computed}", "warn")
    scores["total"] = computed

    c["scores"] = scores
    return c


def _check_winner(c: Dict[str, Any]) -> None:
    """
    Re-check the rules hunter.md states, because a prompt cannot enforce its own.

    The floors are not equally hard, and the difference is deliberate. A weak
    total is kept and shouted about: it is a taste judgement, the hunt is a
    multi-minute paid call, and an editor staring at a mediocre winner learns more
    than one staring at a failed command and an empty corpus. Engine longevity and
    clearance do refuse — the first because hunter.md calls it disqualifying
    whatever the total, the second because legal is binding where taste is
    advisory.
    """
    scores = c.get("scores", {})
    total, engine = scores.get("total", 0), scores.get("engine_longevity", 0)
    title = c.get("title", "?")

    if total < MIN_TOTAL:
        log(f"winner '{title}' scores {total}, below the {MIN_TOTAL} floor — kept "
            f"so an editor sees what the hunt actually found, but this is a thin "
            f"hunt and the corpus should be rebuilt", "warn")
    if engine < MIN_ENGINE_LONGEVITY:
        raise RuntimeError(
            f"winner '{title}' scores {engine} on engine longevity, below the "
            f"{MIN_ENGINE_LONGEVITY} floor — a mechanism that stops early is a film"
        )
    if c.get("clearance", {}).get("status") == "blocked":
        raise RuntimeError(f"winner '{title}' is cleared `blocked` and cannot be adapted")


def hunt(client: Any = None) -> Dict[str, Any]:
    """
    One search pass over all eight categories. Network call — freeze time only.

    Returns {"winner": candidate|None, "also_considered": [candidate]}.
    """
    if client is None:
        from openai import OpenAI
        client = OpenAI()

    brief = BRIEF.format(min_total=MIN_TOTAL, min_others=MIN_ALSO_CONSIDERED)
    response = client.responses.create(
        model=_model(),
        input=[
            {"role": "system", "content": load_prompt()},
            {"role": "user", "content": brief},
        ],
        tools=[{"type": "web_search", "search_context_size": "high"}],
        include=["web_search_call.action.sources"],
        max_output_tokens=MAX_OUTPUT_TOKENS,
        text={"format": {"type": "json_schema", "name": "hunt",
                         "schema": HUNT_SCHEMA, "strict": True}},
    )

    # Before any parsing. Everything below can fail, and re-running the hunt to
    # recover from a post-processing bug costs a full paid search.
    save_raw("hunt", load_prompt() + brief, response)

    if getattr(response, "status", None) == "incomplete":
        raise RuntimeError(
            f"response truncated ({response.incomplete_details}). Truncation "
            "looks like a prompt-quality problem and will be misdiagnosed as one."
        )

    text = getattr(response, "output_text", "") or ""
    if not text.strip():
        raise RuntimeError(f"scout returned no text output (status={getattr(response, 'status', '?')})")
    parsed = json.loads(text)

    consulted = _consulted_urls(response)
    if not consulted:
        # Distinguish "the harness told us nothing" from "the model fabricated
        # its citations". Grounding cannot run, and dropping every candidate
        # would look identical to mass fabrication.
        raise RuntimeError(
            "no consulted URLs came back — `include` returned nothing, so "
            "citation grounding cannot run. The raw response is cached; do not "
            "treat this as the scout inventing sources."
        )

    winner = (ground_candidates([parsed["winner"]], consulted) or [None])[0]
    if winner is None:
        raise RuntimeError(
            "the winner cited no page the scout actually opened — rerun the hunt"
        )
    _check_winner(_normalise_scores(winner))
    _decorate(winner, is_winner=True)

    others = []
    for c in ground_candidates(parsed.get("also_considered", []), consulted):
        total = _normalise_scores(c)["scores"]["total"]
        if total < MIN_TOTAL:
            log(f"below threshold ({total}): {c.get('title', '?')}", "debug")
            continue
        others.append(_decorate(c, is_winner=False))

    if len(others) < MIN_ALSO_CONSIDERED:
        log(f"only {len(others)} also-rans cleared the floor, the queue asks for "
            f"{MIN_ALSO_CONSIDERED} — thin hunt", "warn")

    log(f"winner: {winner['title']} "
        f"({winner['scores']['total']}, {winner.get('category', '?')}) "
        f"— {len(others)} also considered")
    return {"winner": winner, "also_considered": others}
