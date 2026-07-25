"""
Discovery via OpenAI web search. Runs once, offline of the demo path, and the
result is committed as data/corpus.json.

One call per category, eight calls, merged here. The first version swept all
eight in a single call and the cached run shows what that bought: six web
searches for eight categories, seven categories represented, and one query that
read `site:britannica.com impostor inheritance claimant historical case fake
heiress` — an encyclopedia asked for its most famous impostors. A model given
eight categories and no floor on searching spends its budget on the first two
and generalises the rest. Splitting the call is the only lever that raises the
floor: eight calls cannot cover six categories, and a category that comes back
empty comes back empty *by name* instead of vanishing from a merged list.

Selection moved with it. No single call sees the whole field any more, so the
winner is chosen here, from the derived totals — which is what the thresholds
already read, because `total` as typed by the model is not trusted anywhere in
this module.

The scout prompt does the judging (see prompts/hunter.md). This module does the
four things a prompt cannot be trusted with: it forces the output into a strict
schema, it narrows that schema so a call for one category cannot answer with
another, it recomputes the scores the schema cannot bound, and it discards any
candidate citing a page the model never opened.
"""

import os
import copy
import json
import pathlib
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Dict, Iterable, List, Optional, Sequence, Set, Tuple
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
# reject most of a screen and still have a shortlist left. Per category the ask
# is small; across eight calls it compounds to a queue of ~24.
MIN_ALSO_CONSIDERED = 8
MIN_PER_CATEGORY = 2

# The number the cached single-sweep run failed on: six searches, eight
# categories. Stated as a floor in the brief and as a ceiling in the request, so
# a category that decides to search forever cannot spend the whole budget.
MIN_SEARCHES_PER_CATEGORY = 4
MAX_TOOL_CALLS = 12

# The web_search tool defaults to `country: "US"` when nothing is passed, and the
# cached run inherited it — every candidate it returned was American or European.
# The audience is Indian; the search should originate where the audience is.
SEARCH_REGION = "IN"

# Truncation is detected downstream, but detection after a paid multi-minute
# search is worse than a bounded call.
MAX_OUTPUT_TOKENS = 32000

# Eight sequential multi-minute searches is a twenty-five minute command. Modest
# rather than eight-wide: this is a paid search API, and a rate-limit rejection
# costs the whole category.
MAX_PARALLEL_HUNTS = 4

# Tertiary sources, for the drift diagnostic below. Not a grading axis — the
# `tier` field that graded candidates by where they came from was retired
# deliberately, and this does not bring it back. It counts, warns, and drops
# nothing.
TERTIARY_HOSTS = ("wikipedia.org", "britannica.com", "history.com",
                  "smithsonianmag.com", "listverse.com", "ranker.com",
                  "allthatsinteresting.com")

CATEGORIES = ["DENIED IDENTITY", "SECRET STATUS", "REVENGE", "THE LONG DECEPTION",
              "FAMILY BETRAYAL", "THE BARGAIN COMES DUE", "SUPERNATURAL INTRUSION",
              "THE DOUBLE LIFE"]

BRIEF = (
    "Hunt ONE category on this call: **{category}**. Seven other calls are "
    "hunting the other seven, so anything you find outside this category is "
    "somebody else's find — do not return it.\n\n"
    "Run AT LEAST {min_searches} separate web searches before you judge "
    "anything, and make them different dialects of the same idea: news "
    "language, court and police language, and plain description of the "
    "mechanism. If a search returns cases you already knew before you ran it, "
    "you have found the layer that is already adapted — change vocabulary, "
    "change country, change decade, and search again.\n\n"
    "Then return one winner for this category and AT LEAST {min_others} other "
    "candidates in `also_considered`. Every candidate you return must score "
    "{min_total}+ in total. If fewer than {min_others} clear that, hunt again "
    "with different vocabulary rather than returning a short list — an editor "
    "reads the merged result as a queue and needs enough of it to reject most "
    "of it.\n\n"
    "A candidate you had to refuse on legal or rights grounds still comes back, "
    "with `clearance.status` `blocked` and the reason. Only the hard content "
    "exclusions are dropped entirely.\n\n"
    "If this category genuinely has nothing above the floor, say so by returning "
    "your best find and an empty `also_considered`. A thin category reported is "
    "useful; a thin category padded with the famous cases is not."
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
                 "prior_adaptations", "sources", "facts", "why_this_sells",
                 "why_not"],
    "properties": {
        "title": {"type": "string"},
        # An enum is the only place "one of the eight, exact name" can actually
        # hold — the prompt can ask, the schema enforces. `_schema_for()` narrows
        # it to the single category a given call is hunting.
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
        # What the pages said, so the expander builds its timeline from grounded
        # facts rather than searching again to recover them. Winner only.
        "facts": {"type": "array", "items": {
            "type": "object",
            "additionalProperties": False,
            "required": ["what_happened", "source", "confidence"],
            "properties": {
                "what_happened": {"type": "string"},
                "source": {"type": "string"},
                "confidence": {"type": "string",
                               "enum": ["verified", "reported", "alleged", "disputed"]},
            }}},
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
    """
    Scout routing, with the scorer as the fallback.

    The cached failure was partly a model one — `gpt-5.6-luna` chose six searches
    for eight categories with no cap forcing its hand. The fix taken here is
    structural rather than a tier upgrade: eight calls with a stated search floor
    each raise the budget without multiplying the price per token. If a rerun
    still drifts famous, set `OPENAI_MODEL_SCOUT` to the writer tier — that is
    what the override exists for, and it needs no code change.
    """
    return (os.environ.get("OPENAI_MODEL_SCOUT")
            or os.environ.get("OPENAI_MODEL_SCORER")
            or "gpt-5.6-luna")


def _slug(category: str) -> str:
    return category.lower().replace(" ", "_")


def _schema_for(category: str) -> Dict[str, Any]:
    """
    HUNT_SCHEMA with `category` narrowed to the one category this call hunts.

    A brief asking for one category is advice; a one-value enum is enforcement.
    The single-sweep run filed George Psalmanazar — a man who spent decades
    maintaining an invented country — under SECRET STATUS, which is how a merged
    list ends up claiming coverage it does not have. Narrowing the enum makes
    "which category did this call actually cover" a fact about the response
    rather than a claim inside it.
    """
    schema = copy.deepcopy(HUNT_SCHEMA)
    for slot in (schema["properties"]["winner"],
                 schema["properties"]["also_considered"]["items"]):
        slot["properties"]["category"]["enum"] = [category]
    return schema


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


def _rank(c: Dict[str, Any]) -> Tuple[int, int]:
    """Derived total first, engine longevity as the tie-break — the axis
    hunter.md calls disqualifying is the one that should break a tie."""
    scores = c.get("scores", {})
    return scores.get("total", 0), scores.get("engine_longevity", 0)


def _eligible(c: Dict[str, Any]) -> bool:
    return (c.get("scores", {}).get("engine_longevity", 0) >= MIN_ENGINE_LONGEVITY
            and c.get("clearance", {}).get("status") != "blocked")


def _pick_winner(picks: List[Dict[str, Any]],
                 others: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Choose the one candidate the season gets built on, across eight calls.

    hunter.md tells the scout not to pick mechanically, and within a category it
    still does not — each call names its own winner, and those are `picks`. What
    cannot happen with eight independent calls is a model comparing all eight,
    so the cross-category choice lands here. A ninth call to re-rank would pay
    for a second opinion over numbers this module already refuses to believe:
    `total` is recomputed from the sub-scores, so a max over the derived totals
    is better evidence than a model re-reading the claimed ones.

    Category winners are preferred over also-rans of the same score, because a
    call that named a candidate its best is a judgement and a sort is not.
    """
    for pool in (picks, others):
        qualified = [c for c in pool if _eligible(c)]
        if qualified:
            return max(qualified, key=_rank)

    # Nothing qualified anywhere. Return the strongest thing found and let
    # _check_winner name the floor it failed: "no candidate qualified" tells an
    # editor nothing about whether to retune the rubric or rerun the hunt.
    return max(picks or others, key=_rank)


def _report_famous_drift(candidates: Sequence[Dict[str, Any]]) -> int:
    """
    Count candidates whose every grounded source is an encyclopedia.

    This is the regression that produced Tichborne, Piltdown and Poyais, and it
    is visible in the sources long before anyone reads the titles: an event
    sourced only to Wikipedia and Britannica has been picked over for a century
    and is exactly the material hunter.md forbids. Reported, never dropped —
    grading a candidate by where it came from is the retired `tier` field, and
    a genuinely obscure case can still have one encyclopedia stub.
    """
    drifted = [c for c in candidates
               if c.get("sources")
               and all(any(domain_of(u).endswith(h) for h in TERTIARY_HOSTS)
                       for u in c["sources"])]
    if drifted:
        log(f"{len(drifted)} of {len(candidates)} candidates are sourced only to "
            f"encyclopedias ({', '.join(c.get('title', '?') for c in drifted)}) — "
            f"the hunt drifted toward famous cases", "warn")
    return len(drifted)


def _hunt_category(client: Any, category: str
                   ) -> Tuple[Optional[Dict[str, Any]], List[Dict[str, Any]]]:
    """One paid search call for one category. Returns (its pick, its also-rans)."""
    prompt = load_prompt()
    brief = BRIEF.format(category=category, min_total=MIN_TOTAL,
                         min_others=MIN_PER_CATEGORY,
                         min_searches=MIN_SEARCHES_PER_CATEGORY)
    response = client.responses.create(
        model=_model(),
        input=[
            {"role": "system", "content": prompt},
            {"role": "user", "content": brief},
        ],
        tools=[{"type": "web_search",
                "search_context_size": "high",
                "user_location": {"type": "approximate", "country": SEARCH_REGION}}],
        include=["web_search_call.action.sources"],
        max_output_tokens=MAX_OUTPUT_TOKENS,
        max_tool_calls=MAX_TOOL_CALLS,
        text={"format": {"type": "json_schema", "name": "hunt",
                         "schema": _schema_for(category), "strict": True}},
    )

    # Before any parsing. Everything below can fail, and re-running a category to
    # recover from a post-processing bug costs a full paid search.
    save_raw(f"hunt_{_slug(category)}", prompt + brief, response)

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

    pick = (ground_candidates([parsed["winner"]], consulted) or [None])[0]
    if pick is None:
        log(f"{category}: the category's pick cited no page the scout actually "
            f"opened — its also-rans still stand", "warn")
    else:
        _stamp(_normalise_scores(pick), category)

    others = []
    for c in ground_candidates(parsed.get("also_considered", []), consulted):
        total = _normalise_scores(c)["scores"]["total"]
        if total < MIN_TOTAL:
            log(f"below threshold ({total}): {c.get('title', '?')}", "debug")
            continue
        others.append(_stamp(c, category))

    log(f"{category}: {len(others) + (1 if pick else 0)} candidates cleared")
    return pick, others


def _stamp(c: Dict[str, Any], category: str) -> Dict[str, Any]:
    """
    Record which call found this, rather than which category the model typed.

    The enum makes the two the same in production. They differ under a fake, and
    they would differ under any future relaxation of the schema — and the
    coverage line printed at the end of a hunt is only worth reading if it
    reports where a candidate was found.
    """
    claimed = c.get("category")
    if claimed and claimed != category:
        log(f"'{c.get('title', '?')}' came back as {claimed} from the {category} "
            f"hunt — filed under {category}", "warn")
    c["category"] = category
    return c


def hunt(client: Any = None,
         categories: Optional[Sequence[str]] = None) -> Dict[str, Any]:
    """
    One search pass per category. Network calls — freeze time only.

    Returns {"winner": candidate, "also_considered": [candidate]} — the same
    shape the single-sweep hunt returned, so `run.py`, `corpus.json` and the
    queue screen are untouched by the split.

    `categories` narrows the sweep. It exists because a category that came back
    thin should be re-huntable on its own rather than by paying for the other
    seven again, and because a test can then drive one call instead of stubbing
    eight.
    """
    if client is None:
        from openai import OpenAI
        client = OpenAI()

    wanted = list(categories) if categories else list(CATEGORIES)

    results: Dict[str, Tuple[Optional[Dict[str, Any]], List[Dict[str, Any]]]] = {}
    failures: List[Tuple[str, Exception]] = []

    def run(category: str) -> None:
        try:
            results[category] = _hunt_category(client, category)
        except Exception as exc:  # noqa: BLE001 — one category must not cost seven
            failures.append((category, exc))
            log(f"{category}: hunt failed ({exc})", "error")

    # Threads, not sequence: eight multi-minute searches back to back is a
    # twenty-five minute command, and the output is re-ordered below so the
    # corpus stays byte-identical regardless of which call returned first.
    with ThreadPoolExecutor(max_workers=min(MAX_PARALLEL_HUNTS, len(wanted))) as pool:
        list(pool.map(run, wanted))

    failed = {c for c, _ in failures}
    picks, others, empty = [], [], []
    for category in wanted:
        pick, rest = results.get(category, (None, []))
        if pick:
            picks.append(pick)
        others.extend(rest)
        if not pick and not rest and category not in failed:
            empty.append(category)

    if not picks and not others:
        if failures:
            # Re-raise the first real failure rather than a summary of it. The
            # specific message — truncation, empty body, grounding unavailable —
            # is the whole diagnostic value.
            raise failures[0][1]
        raise RuntimeError(
            "no category returned a usable candidate — every pick was either "
            "ungrounded or below the floor. The raw responses are cached; rerun "
            "the hunt rather than lowering the threshold."
        )

    winner = _pick_winner(picks, others)
    _check_winner(winner)
    _decorate(winner, is_winner=True)

    rest = [_decorate(c, is_winner=False)
            for c in picks + others if c is not winner]

    if empty:
        log(f"no candidate cleared the floor in: {', '.join(empty)} — rerun those "
            f"categories alone rather than the whole sweep", "warn")
    if len(rest) < MIN_ALSO_CONSIDERED:
        log(f"only {len(rest)} also-rans cleared the floor, the queue asks for "
            f"{MIN_ALSO_CONSIDERED} — thin hunt", "warn")
    _report_famous_drift([winner] + rest)

    log(f"winner: {winner['title']} "
        f"({winner['scores']['total']}, {winner.get('category', '?')}) "
        f"— {len(rest)} also considered across "
        f"{len(wanted) - len(failures)}/{len(wanted)} categories")
    return {"winner": winner, "also_considered": rest}
