"""
Discovery via OpenAI web search. Runs once, offline of the demo path, and the
result is committed as data/corpus.json.

One call. The scout sweeps all eight categories and returns the single event it
would stake the series on, plus the candidates it rejected. Selection is part of
the hunt rather than a stage after it — a second pass re-ranking candidates the
same model just scored would cost money to re-derive a decision already made.

The scout prompt does the judging (see prompts/hunter.md). This module does the
two things a prompt cannot be trusted with: it forces the output into a strict
schema, and it discards any candidate citing a page the model never opened.
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
    "Then return one winner and the candidates you seriously considered. Every "
    "candidate you return must score {min_total}+ in total."
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
                 "prior_adaptations", "sources", "why_this_sells"],
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


def _check_winner(c: Dict[str, Any]) -> None:
    """
    The winner is the one candidate the thresholds were never applied to — it is
    taken on the model's say-so and then expanded into a whole season. Re-check
    the two rules hunter.md states, because the prompt cannot enforce its own.
    """
    scores = c.get("scores", {})
    total, engine = scores.get("total", 0), scores.get("engine_longevity", 0)
    title = c.get("title", "?")

    if total < MIN_TOTAL:
        raise RuntimeError(f"winner '{title}' scores {total}, below the {MIN_TOTAL} floor")
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

    brief = BRIEF.format(min_total=MIN_TOTAL)
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
    _check_winner(winner)
    _decorate(winner, is_winner=True)

    others = []
    for c in ground_candidates(parsed.get("also_considered", []), consulted):
        total = c.get("scores", {}).get("total", 0)
        if total < MIN_TOTAL:
            log(f"below threshold ({total}): {c.get('title', '?')}", "debug")
            continue
        others.append(_decorate(c, is_winner=False))

    log(f"winner: {winner['title']} "
        f"({winner['scores']['total']}, {winner.get('category', '?')}) "
        f"— {len(others)} also considered")
    return {"winner": winner, "also_considered": others}
