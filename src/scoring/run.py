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
from typing import Any, Dict, List

from src.util import (CORPUS_PATH, DOSSIERS_PATH, ensure_dirs, load_env, log,
                      offline, read_json, write_json)

PROMPTS = pathlib.Path(__file__).resolve().parent / "prompts"

# Season length for the POC. Deliberately not the scout's `episode_estimate` —
# that number answers "could this run 150 episodes", which is a judgement about
# longevity, not an instruction about how much to generate now.
DEFAULT_EPISODES = 28

HOOK_TYPES = ["REVEAL", "THREAT", "ARRIVAL", "BETRAYAL", "RECOGNITION",
              "DEADLINE", "REVERSAL", "ULTIMATUM", "ACCUSATION", "DISCOVERY"]


def _obj(required: Dict[str, Any]) -> Dict[str, Any]:
    return {"type": "object", "additionalProperties": False,
            "required": list(required), "properties": required}


DOSSIER_SCHEMA = _obj({
    "event_id": {"type": "string"},
    "title": {"type": "string"},
    "one_line_summary": {"type": "string"},
    "fantasy": {"type": "string",
                "description": "which promise this season sells, in four words"},
    "timeline": {"type": "array", "items": _obj({
        "id": {"type": "string"},
        "date": {"type": "string"},
        "what_happened": {"type": "string"},
        "confidence": {"enum": ["verified", "reported", "alleged", "disputed"]},
        "source": {"type": "string"},
    })},
    # The record. Real individuals only, for clearance.
    "people": {"type": "array", "items": _obj({
        "name": {"type": "string"},
        "role": {"type": "string"},
        "motive": {"type": "string"},
        "public_or_private": {"enum": ["public", "private"]},
        "living": {"type": "boolean"},
    })},
    # The show. Invented characters, keyed by the id every downstream stage uses.
    "cast": {"type": "array", "items": _obj({
        "char_id": {"type": "string"},
        "name": {"type": "string"},
        "role": {"type": "string"},
        "want": {"type": "string"},
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
        "status": {"enum": ["greenlight", "fictionalize_first", "blocked"]},
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
        "hook_type": {"enum": HOOK_TYPES},
        "ends_on": {"type": "string"},
        "pays_off": {"type": ["string", "null"]},
        "status": {"type": "integer"},
    })},
})


def episodes() -> int:
    return int(os.environ.get("CANONFORGE_EPISODES", DEFAULT_EPISODES))


def load_prompt(n_episodes: int) -> str:
    text = (PROMPTS / "expand.md").read_text(encoding="utf-8")
    return text.replace("{{n_episodes}}", str(n_episodes))


def winner_from(path=CORPUS_PATH) -> Dict[str, Any]:
    if not path.exists():
        raise RuntimeError(f"no corpus at {path} — run `python tasks.py corpus` first")
    items = read_json(path).get("items", [])
    for item in items:
        if not item.get("winner"):
            continue
        if item.get("clearance", {}).get("status") == "blocked":
            raise RuntimeError(
                f"'{item['title']}' is cleared `blocked` and must not be expanded"
            )
        return item
    raise RuntimeError("corpus has no winner — the hunt did not complete")


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
        text={"format": {"type": "json_schema", "name": "dossier",
                         "schema": DOSSIER_SCHEMA, "strict": True}},
    )

    if getattr(response, "status", None) == "incomplete":
        raise RuntimeError(
            f"response truncated ({response.incomplete_details}). A short season "
            "here is truncation, not a weak event — do not tune the prompt for it."
        )

    dossier = json.loads(getattr(response, "output_text", "") or "{}")
    dossier["fictionalization_map"] = {
        p["real"]: p["fictional"] for p in dossier.get("fictionalization_map", [])
    }
    return dossier


def check(dossier: Dict[str, Any], n_episodes: int) -> List[str]:
    """
    The three failures that are invisible in a JSON blob but fatal on stage: a
    short season, a flat status curve, and back-to-back hooks. Warnings, not
    errors — a thin season is still worth looking at before it is regenerated.
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
    # should settle something before the next wound opens.
    payoffs = sum(1 for e in season if e.get("pays_off"))
    if season and payoffs < len(season) // 8:
        problems.append(f"only {payoffs} episodes pay anything off — all wound, no reward")

    ids = {c.get("char_id") for c in dossier.get("cast", [])}
    if not ids:
        problems.append("no cast — downstream stages have no character ids to use")

    return problems


def main() -> int:
    load_env()
    if offline():
        log("OFFLINE is set — expansion is a live call", "error")
        return 1

    n = episodes()
    try:
        candidate = winner_from()
    except RuntimeError as exc:
        log(str(exc), "error")
        return 1

    ensure_dirs()
    log(f"expanding '{candidate['title']}' into {n} episodes")
    dossier = expand(candidate, n)

    for problem in check(dossier, n):
        log(problem, "warn")

    write_json(DOSSIERS_PATH, [dossier])
    log(f"{dossier.get('title', '?')}: {len(dossier.get('season', []))} episodes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
