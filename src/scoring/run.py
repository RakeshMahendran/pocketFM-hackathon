"""
Expand the scout's winner into a season.

    python tasks.py score

One call on one event. The scout already picked and cleared it; this stage turns
a pitch into a spine a writer can shoot from — {{n_episodes}} episodes, each with
its turn, its hook and the protagonist's public standing.

Note on the schema: `dossier.schema.json` types `fictionalization_map` as an
object with arbitrary keys, which strict structured outputs cannot express. The
model returns it as a list of pairs and it is folded back into a map before the
dossier is written, so the file on disk still validates against P1's schema.
"""

import os
import sys
import json
import pathlib
import argparse
import datetime as dt
from typing import Any, Dict, List, Optional, Sequence

from src.util import (CORPUS_PATH, DOSSIERS_PATH, ensure_dirs, load_env, log,
                      offline, read_json, write_json)
from src.discovery.cache import save_raw
from src.scoring.validate import load_beats, validate_output

PROMPTS = pathlib.Path(__file__).resolve().parent / "prompts"

# Season length for the POC. Deliberately not the scout's `episode_estimate` —
# that number answers "could this run 150 episodes", which is a judgement about
# longevity, not an instruction about how much to generate now.
DEFAULT_EPISODES = 14

# expand.md says "search once or twice". An unbounded search phase on a call that
# must also emit a full season is the likeliest source of truncation here.
MAX_TOOL_CALLS = 4
MAX_OUTPUT_TOKENS = 32000

HOOK_TYPES = ["REVEAL", "THREAT", "ARRIVAL", "BETRAYAL", "RECOGNITION",
              "DEADLINE", "REVERSAL", "ULTIMATUM", "ACCUSATION", "DISCOVERY"]


def _obj(required: Dict[str, Any]) -> Dict[str, Any]:
    return {"type": "object", "additionalProperties": False,
            "required": list(required), "properties": required}


DOSSIER_SCHEMA = _obj({
    "event_id": {"type": "string"},
    "title": {"type": "string"},
    "one_line_summary": {"type": "string"},
    # Recorded with the story, not read from the environment at conversion time.
    # A story is written in one register and voiced in it; if this lived in a
    # shell variable the same dossier would convert differently depending on who
    # ran it.
    "language": {"type": "string", "enum": ["en", "hi-en"]},
    "fantasy": {"type": "string",
                "description": "which promise this season sells, in four words"},
    # The two casting decisions the whole season rests on. Every test run
    # produced these unprompted; strict mode rejects them unless declared.
    "protagonist": _obj({
        "char_id": {"type": "string"},
        "who": {"type": "string"},
        "wants": {"type": "string"},
        "ashamed_of": {"type": "string"},
        "does_not_know_at_start": {"type": "string"},
    }),
    "antagonist": _obj({
        "char_id": {"type": "string"},
        "who": {"type": "string"},
        "wants_incompatibly": {"type": "string"},
    }),
    "sources": {"type": "array", "items": {"type": "string"},
                "description": "every URL actually opened"},
    "timeline": {"type": "array", "items": _obj({
        "id": {"type": "string"},
        "date": {"type": "string"},
        "what_happened": {"type": "string"},
        "confidence": {"type": "string", "enum": ["verified", "reported", "alleged", "disputed"]},
        "source": {"type": "string"},
    })},
    # The record. Real individuals only, for clearance.
    "people": {"type": "array", "items": _obj({
        "name": {"type": "string"},
        "role": {"type": "string"},
        "motive": {"type": "string"},
        "public_or_private": {"type": "string", "enum": ["public", "private"]},
        "living": {"type": "boolean"},
    })},
    # The show. Invented characters, keyed by the id every downstream stage uses.
    "cast": {"type": "array", "items": _obj({
        "char_id": {"type": "string"},
        "name": {"type": "string"},
        "role": {"type": "string"},
        "want": {"type": "string"},
        # Voice casting scores on gender and age before anything else, and it
        # locks once — a character cast wrong keeps that voice for the whole
        # series. Without these the resolver matched on persona prose alone and
        # gave a 22-year-old woman a male voice, scored 1.0.
        "gender": {"type": "string", "enum": ["female", "male", "neutral"]},
        "age_range": {"type": "string", "enum": ["child", "teens", "20s", "30s",
                                                 "40s", "50s", "60s+"]},
        "maps_to": {"type": "string"},
        "composite": {"type": "boolean"},
    })},
    "adaptability": _obj({
        "conflict": {"type": "integer"},
        "characters": {"type": "integer"},
        "stakes": {"type": "integer"},
        "serializability": {"type": "integer"},
        "resonance": {"type": "integer"},
        "total": {"type": "integer"},
    }),
    "clearance": _obj({
        "status": {"type": "string", "enum": ["greenlight", "fictionalize_first", "blocked"]},
        "reasons": {"type": "array", "items": {"type": "string"}},
    }),
    "novelty": _obj({
        "prior_adaptations": {"type": "array", "items": {"type": "string"}},
        "score": {"type": "integer"},
    }),
    "engine": {"type": "string"},
    "why_this_works": {"type": "string"},
    # Pairs, not a map: strict mode has no way to express arbitrary keys.
    "fictionalization_map": {"type": "array", "items": _obj({
        "real": {"type": "string"},
        "fictional": {"type": "string"},
    })},
    "season": {"type": "array", "items": _obj({
        "ep": {"type": "integer"},
        "turn": {"type": "string"},
        "hook_type": {"type": "string", "enum": HOOK_TYPES},
        "ends_on": {"type": "string"},
        "pays_off": {"type": ["string", "null"]},
        "status": {"type": "integer"},
    })},
})


def episodes() -> int:
    raw = os.environ.get("CANONFORGE_EPISODES", DEFAULT_EPISODES)
    try:
        n = int(raw)
    except (TypeError, ValueError):
        raise RuntimeError(f"CANONFORGE_EPISODES={raw!r} is not a number")
    if n < 1:
        raise RuntimeError(f"CANONFORGE_EPISODES={n} must be at least 1")
    return n


def load_prompt(n_episodes: int) -> str:
    text = (PROMPTS / "expand.md").read_text(encoding="utf-8")
    return text.replace("{{n_episodes}}", str(n_episodes))


def _refuse_if_blocked(item: Dict[str, Any]) -> Dict[str, Any]:
    """
    Clearance is the one verdict a human may not override. Taste is advisory;
    legal is binding.
    """
    if item.get("clearance", {}).get("status") == "blocked":
        raise RuntimeError(
            f"'{item['title']}' is cleared `blocked` and must not be expanded"
        )
    return item


def select(path=CORPUS_PATH, ref: str = None) -> Dict[str, Any]:
    """
    Pick the candidate to expand.

    `ref` is a corpus item `id` or a case-insensitive fragment of its title.
    Without one, the scout's own pick stands.

    The scout ranks and the editor commissions — those are different decisions
    and only the first belongs to the model. Expanding the winner unconditionally
    left an editor who disliked it with nothing to do but rerun the hunt, which
    costs a call, is non-deterministic, and discards candidates already scored
    and grounded.
    """
    if not path.exists():
        raise RuntimeError(f"no corpus at {path} — run `python tasks.py corpus` first")

    items = read_json(path).get("items", [])
    if not items:
        raise RuntimeError("corpus is empty — the hunt did not complete")

    if ref:
        needle = ref.strip().lower()
        matches = [i for i in items
                   if i.get("id") == ref
                   or needle in (i.get("title") or "").lower()]
        if not matches:
            available = "\n".join(
                f"    {i.get('id', '?')}  {i.get('title', '?')}" for i in items
            )
            raise RuntimeError(f"no candidate matching {ref!r}. Corpus holds:\n{available}")
        if len(matches) > 1:
            titles = ", ".join(repr(m.get("title")) for m in matches)
            raise RuntimeError(f"{ref!r} matches {len(matches)} candidates: {titles}")
        chosen = matches[0]
        if not chosen.get("winner"):
            log(f"expanding '{chosen['title']}' over the scout's pick", "info")
        return _refuse_if_blocked(chosen)

    for item in items:
        if item.get("winner"):
            return _refuse_if_blocked(item)
    raise RuntimeError("corpus has no winner — the hunt did not complete")


# Kept so existing callers and docs referring to the old name still work.
winner_from = select


def _model() -> str:
    return (os.environ.get("OPENAI_MODEL_SCORER")
            or os.environ.get("OPENAI_MODEL_WRITER")
            or "gpt-5.6-luna")


def expand(candidate: Dict[str, Any], n_episodes: int,
           client: Any = None) -> Dict[str, Any]:
    if client is None:
        from openai import OpenAI
        client = OpenAI()

    brief = (
        "Build the season from this event.\n\n"
        + json.dumps(candidate, ensure_ascii=False, indent=2)
    )

    response = client.responses.create(
        model=_model(),
        input=[
            {"role": "system", "content": load_prompt(n_episodes)},
            {"role": "user", "content": brief},
        ],
        tools=[{"type": "web_search", "search_context_size": "high"}],
        max_output_tokens=MAX_OUTPUT_TOKENS,
        max_tool_calls=MAX_TOOL_CALLS,
        text={"format": {"type": "json_schema", "name": "dossier",
                         "schema": DOSSIER_SCHEMA, "strict": True}},
    )

    save_raw("expand", load_prompt(n_episodes) + brief, response)

    if getattr(response, "status", None) == "incomplete":
        raise RuntimeError(
            f"response truncated ({response.incomplete_details}). A short season "
            "here is truncation, not a weak event — do not tune the prompt for it."
        )

    refusal = _refusal(response)
    if refusal:
        raise RuntimeError(
            f"the model refused: {refusal}. The source material is fraud and "
            "organised crime, so this is a foreseeable outcome, not a bug."
        )

    text = getattr(response, "output_text", "") or ""
    if not text.strip():
        # Never default to {}. An empty dossier writes a well-formed file, exits
        # 0, and every stage downstream believes the season exists.
        raise RuntimeError(
            f"expander returned no text output (status={getattr(response, 'status', '?')})"
        )

    dossier = json.loads(text)
    dossier["fictionalization_map"] = _fold_map(dossier.get("fictionalization_map", []))

    # Derived rather than asked for. Every test run invented this field and the
    # strict schema forbids it, so the guard for hard rule 3 would vanish the
    # moment the pipeline ran for real. It is a projection of the timeline.
    dossier["never_narrate_as_fact"] = [
        f"{t['id']}: {t['what_happened']} ({t['confidence']})"
        for t in dossier.get("timeline", [])
        if t.get("confidence") in ("alleged", "disputed")
    ]

    # The winner's category and hunt scores have no home in the dossier schema
    # and would be dropped at the stage boundary.
    for field in ("category", "hunt_category"):
        if candidate.get(field):
            dossier["category"] = candidate[field]
            break
    if candidate.get("scores"):
        dossier["hunt_scores"] = candidate["scores"]

    return dossier


def _refusal(response: Any) -> str:
    for item in getattr(response, "output", []) or []:
        data = item.model_dump() if hasattr(item, "model_dump") else dict(item)
        for block in data.get("content") or []:
            if isinstance(block, dict) and block.get("type") == "refusal":
                return str(block.get("refusal", "no reason given"))
    return ""


def _fold_map(pairs: List[Dict[str, str]]) -> Dict[str, str]:
    """Pairs to dict, loudly — a duplicate `real` key silently loses a person."""
    out: Dict[str, str] = {}
    for p in pairs:
        real, fictional = p.get("real", ""), p.get("fictional", "")
        if real in out and out[real] != fictional:
            log(f"fictionalization_map: '{real}' mapped twice "
                f"('{out[real]}' then '{fictional}') — one mapping is lost", "warn")
        out[real] = fictional
    return out


def check(dossier: Dict[str, Any], n_episodes: int) -> List[str]:
    """
    Failures that are invisible in a JSON blob but fatal downstream: a short or
    flat season, back-to-back hooks, and — the one that matters legally — a real
    name with no fictional counterpart.

    Warnings, not errors, with one exception: `unmapped_names()` is a hard rule
    and is raised by the caller.
    """
    season = dossier.get("season", [])
    problems = []

    if len(season) < n_episodes:
        problems.append(f"season is {len(season)} episodes, asked for {n_episodes}")

    statuses = [e.get("status", 0) for e in season]
    if statuses:
        if statuses[0] > 2:
            problems.append(f"episode 1 opens at status {statuses[0]} — no humiliation")
        if max(statuses) - min(statuses) < 4:
            problems.append("status curve is flat — nobody visibly climbs")

    repeats = [e["ep"] for a, e in zip(season, season[1:])
               if a.get("hook_type") == e.get("hook_type")]
    if repeats:
        problems.append(f"repeated hook type at episodes {repeats}")

    # Unbroken high tension exhausts a listener; roughly one episode in six
    # should settle something before the next wound opens. Integer division here
    # made the threshold 1 at fourteen episodes, which passed what it was written
    # to fail.
    payoffs = sum(1 for e in season if e.get("pays_off"))
    if season and payoffs < round(len(season) / 6):
        problems.append(
            f"only {payoffs} episodes pay anything off, expected about "
            f"{round(len(season) / 6)} — all wound, no reward"
        )

    eps = [e.get("ep") for e in season]
    if season and sorted(eps) != list(range(1, len(season) + 1)):
        # The episode writer indexes by `ep`; a duplicate or a gap silently
        # writes the wrong episode or none at all.
        problems.append(f"episode numbers are not 1..{len(season)} exactly: {eps}")

    ids = {c.get("char_id") for c in dossier.get("cast", [])}
    if not ids:
        problems.append("no cast — downstream stages have no character ids to use")

    if season and not season[-1].get("pays_off"):
        problems.append("the last episode settles nothing — the story does not resolve")

    return problems


def unmapped_names(dossier: Dict[str, Any]) -> List[str]:
    """
    Real names with no fictional counterpart.

    Hard rule 4 says real names never reach generated fiction, and the
    fictionalization map is the only thing that enforces it. Three of four test
    runs produced maps keyed by role description rather than by name, so the map
    covered nobody and one of them leaked a real surname into a script. This is
    the check that would have caught it.
    """
    fmap = dossier.get("fictionalization_map", {})
    return [p["name"] for p in dossier.get("people", []) if p.get("name") not in fmap]


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        prog="tasks.py score",
        description="Expand one cleared candidate into a season.",
    )
    parser.add_argument(
        "--event", default=None, metavar="ID_OR_TITLE",
        help="corpus item id, or a fragment of its title. Defaults to the "
             "scout's pick — the editor commissions, the scout only ranks.",
    )
    parser.add_argument(
        "--by", default=None, metavar="EDITOR",
        help="who commissioned this. Stamped onto the dossier so a season "
             "carries the name of the person who chose it, not just the "
             "model that ranked it.",
    )
    parser.add_argument(
        "--beats", default=None, metavar="PATH",
        help="an existing beat sheet to re-grade against the dossier this run "
             "produces. Used when a season is regenerated from a corrected "
             "dossier; fatal problems block the write the way an unmapped name "
             "does. Omit on a first expansion, when no beats exist yet.",
    )
    args = parser.parse_args(argv)

    load_env()
    if offline():
        log("OFFLINE is set — expansion is a live call", "error")
        return 1

    try:
        n = episodes()
        candidate = select(ref=args.event)
        ensure_dirs()
        log(f"expanding '{candidate['title']}' into {n} episodes")
        dossier = expand(candidate, n)
    except (RuntimeError, ValueError, json.JSONDecodeError) as exc:
        # The messages above are written to be read. A traceback buries them, and
        # JSONDecodeError is not a RuntimeError.
        log(str(exc), "error")
        return 1

    for problem in check(dossier, n):
        log(problem, "warn")

    unmapped = unmapped_names(dossier)
    if unmapped:
        log(f"real names with no fictional counterpart: {unmapped}", "error")
        log("hard rule 4 cannot be enforced downstream — not writing this dossier",
            "error")
        return 1

    if args.beats:
        try:
            beats = load_beats(pathlib.Path(args.beats))
        except (RuntimeError, ValueError, json.JSONDecodeError) as exc:
            log(str(exc), "error")
            return 1
        fatal, advisory = validate_output(dossier, beats)
        for problem in advisory:
            log(problem, "warn")
        for problem in fatal:
            log(problem, "error")
        if fatal:
            # A dossier the existing canon no longer traces back to is worse
            # than no dossier: every stage downstream reads the two as a pair.
            log(f"{args.beats} does not hold against this dossier — "
                "not writing it", "error")
            return 1

    # Provenance of the decision, not of the material. The scout's ranking is
    # already on the candidate; this records who overrode or accepted it, which
    # is the half nothing captured before.
    dossier["commissioned"] = {
        "by": args.by or "unattributed",
        "at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "over_scout_pick": not candidate.get("winner", False),
    }

    write_json(DOSSIERS_PATH, [dossier])
    who = dossier["commissioned"]["by"]
    log(f"{dossier.get('title', '?')}: {len(dossier.get('season', []))} episodes, "
        f"commissioned by {who}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
