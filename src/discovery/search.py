"""
Discovery via OpenAI web search. Runs once, offline of the demo path, and the
result is committed as data/corpus.json.

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

PROMPTS = pathlib.Path(__file__).resolve().parent / "prompts"

# Minimum total across the five sub-scores. The prompt states this too; it is
# re-checked here because a scored-but-rejected candidate is diagnostic
# information and a prompt cannot be relied on to enforce its own threshold.
MIN_TOTAL = 38

# One hunt per category, so a barren category is visible instead of being
# averaged away across a single undifferentiated sweep.
SEARCH_LINES = [
    ("DENIED IDENTITY",
     "Real cases where a person was not recognised as who they are by people who "
     "should have known them — returning after being declared dead, an impostor "
     "accepted by a family, an identity dispute settled in court."),
    ("SECRET STATUS",
     "Real cases where someone held wealth, rank or knowledge that the people "
     "around them had no idea about, and were dismissed or mistreated as a result."),
    ("REVENGE",
     "Real cases where a specific wrong was done and the wronged party returned "
     "years later, by design, to collect."),
    ("THE LONG DECEPTION",
     "Real cases of a lie maintained daily by many people at growing cost — "
     "fabricated institutions, staged events, fake offices, invented companies, "
     "counterfeit tournaments."),
    ("FAMILY BETRAYAL",
     "Real cases of inheritance, a contested will, property taken from a sibling, "
     "or a marriage arranged for money that turned."),
    ("THE BARGAIN COMES DUE",
     "Real cases where a debt, promise or desperate deal came back years later to "
     "be paid, and the paying is the story."),
    ("SUPERNATURAL INTRUSION",
     "Real cases of a place, object or disappearance with an unexplained history — "
     "cursed properties, folk belief colliding with a documented record."),
    ("THE DOUBLE LIFE",
     "Real cases of two families, two names or two identities held simultaneously "
     "for years, and the day the two sides met."),
]

_CAST = {
    "type": "object",
    "additionalProperties": False,
    "required": ["name_or_role", "motive", "spinoff_potential"],
    "properties": {
        "name_or_role": {"type": "string"},
        "motive": {"type": "string"},
        "spinoff_potential": {"enum": ["high", "med", "low"]},
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
        "category": {"type": "string"},
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
                "status": {"enum": ["greenlight", "fictionalize_first", "blocked"]},
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
    "required": ["candidates"],
    "properties": {"candidates": {"type": "array", "items": _CANDIDATE}},
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


def ground_candidates(candidates: Iterable[Dict[str, Any]],
                      consulted: Set[str]) -> List[Dict[str, Any]]:
    """
    Keep only URLs the model actually opened, and drop any candidate left with
    none. A fabricated citation is worse than a missing candidate: everything
    downstream treats a corpus item as sourced fact.
    """
    kept = []
    for c in candidates:
        grounded = [u for u in c.get("sources", []) if u in consulted]
        if not grounded:
            log(f"dropped ungrounded candidate: {c.get('title', '?')}", "warn")
            continue
        c = dict(c, sources=grounded)
        kept.append(c)
    return kept


def _model() -> str:
    return (os.environ.get("OPENAI_MODEL_SCOUT")
            or os.environ.get("OPENAI_MODEL_SCORER")
            or "gpt-5.6-luna")


def _consulted_urls(response: Any) -> Set[str]:
    """
    Every URL the search tool actually opened. `include` asks for the full
    source list, which is a superset of the inline citations; annotations are
    read as well so a response carrying only citations still grounds.
    """
    urls: Set[str] = set()
    for item in getattr(response, "output", []) or []:
        data = item.model_dump() if hasattr(item, "model_dump") else dict(item)

        action = data.get("action") or {}
        for src in action.get("sources") or []:
            url = src.get("url") if isinstance(src, dict) else src
            if url:
                urls.add(url)

        for block in data.get("content") or []:
            if not isinstance(block, dict):
                continue
            for ann in block.get("annotations") or []:
                if isinstance(ann, dict) and ann.get("url"):
                    urls.add(ann["url"])
    return urls


def _parsed_candidates(response: Any) -> List[Dict[str, Any]]:
    text = getattr(response, "output_text", "") or ""
    if not text.strip():
        raise RuntimeError("scout returned no text output")
    return json.loads(text).get("candidates", [])


def hunt(category: str, brief: str, client: Any = None) -> List[Dict[str, Any]]:
    """One search pass for one category. Network call — freeze time only."""
    if client is None:
        from openai import OpenAI
        client = OpenAI()

    response = client.responses.create(
        model=_model(),
        input=[
            {"role": "system", "content": load_prompt()},
            {"role": "user", "content":
                f"Category to hunt: {category}\n\n{brief}\n\n"
                f"Search several times with different vocabulary before answering. "
                f"Return every candidate scoring {MIN_TOTAL}+ in total."},
        ],
        tools=[{"type": "web_search", "search_context_size": "high"}],
        include=["web_search_call.action.sources"],
        text={"format": {"type": "json_schema", "name": "hunt",
                         "schema": HUNT_SCHEMA, "strict": True}},
    )

    if getattr(response, "status", None) == "incomplete":
        raise RuntimeError(
            f"{category}: response truncated ({response.incomplete_details}). "
            "Truncation looks like a prompt problem and will be misdiagnosed as one."
        )

    raw = _parsed_candidates(response)
    grounded = ground_candidates(raw, _consulted_urls(response))

    kept = []
    for c in grounded:
        total = c.get("scores", {}).get("total", 0)
        if total < MIN_TOTAL:
            log(f"below threshold ({total}): {c.get('title', '?')}", "debug")
            continue
        c["domain"] = domain_of(c["sources"][0])
        c["hunt_category"] = category
        kept.append(c)

    log(f"{category}: {len(raw)} returned, {len(kept)} kept")
    return kept


def hunt_all(client: Any = None) -> List[Dict[str, Any]]:
    """All eight categories. A barren category is logged, never fatal."""
    out: List[Dict[str, Any]] = []
    for category, brief in SEARCH_LINES:
        try:
            out.extend(hunt(category, brief, client=client))
        except Exception as exc:
            log(f"{category} failed: {exc}", "error")
    return out
