"""
The spinoff writer — one episode of a side character's own serial.

    python tasks.py spinoff --story story1_denied_identity --char ratnamma --anchor b033

This is the one live call in the demo. Everything it is allowed to know arrives in
the brief; everything it is forbidden to know arrives in the same brief, spelled
out. What comes back is sealed in Python before it is written anywhere, because a
prompt is an instruction and canon needs a guarantee.
"""

import sys
import json
import pathlib
import argparse
import datetime as dt
from typing import Any, Dict, List, Optional

from src.canon import store, views
from src.generation.client import call_structured, model_for
from src.generation.schemas import obj
from src.generation import brief as brief_mod
from src.generation import promote as promote_mod
from src.util import SPINOFFS, load_env, load_prompt, log, write_json

PROMPTS = pathlib.Path(__file__).resolve().parent / "prompts"

MAX_OUTPUT_TOKENS = 16000

_BEAT_FIELDS = {
    "beat_id": {"type": "string"},
    "ep": {"type": "integer"},
    "seq": {"type": "integer"},
    "world_time": {"type": "string"},
    "location": {"type": "string"},
    "present": {"type": "array", "items": {"type": "string"}},
    "witnessed_by": {"type": "array", "items": {"type": "string"}},
    "hidden_from": {"type": "array", "items": {"type": "string"}},
    "what_happened": {"type": "string"},
    "state_changes": {"type": "array", "items": obj({
        "entity": {"type": "string"},
        "fact": {"type": "string"},
        "valence": {"type": "integer"},
    })},
    "source_ref": {"type": "string"},
    "crossing_of": {"type": ["string", "null"]},
}

SPINOFF_SCHEMA = obj({
    "title": {"type": "string"},
    "logline": {"type": "string"},
    "script": {"type": "string"},
    "beats": {"type": "array", "items": obj(_BEAT_FIELDS)},
    "crossings": {"type": "array", "items": obj({
        "mainline_beat_id": {"type": "string"},
        "rendered_as": {"type": "string"},
        "objective_facts_kept": {"type": "string"},
    })},
    "cites": {"type": "array", "items": {"type": "string"}},
    "flags": {"type": "array", "items": {"type": "string"}},
})


def spinoff_path(story_id: str, char_id: str, anchor: str,
                 constrained: bool = True) -> pathlib.Path:
    suffix = "" if constrained else "__leak"
    return SPINOFFS / f"{story_id}__{char_id}__{anchor}{suffix}.json"


def default_anchor(story: Dict[str, Any], char_id: str) -> str:
    """
    The top anchor the character actually witnessed.

    Offscreen anchors are offered and fully supported, but they are not the default:
    the episode-beside-the-beat mode is the more interesting one and the more
    fragile one, and an unattended run should take the safe road.
    """
    found = views.anchors(story, char_id)
    witnessed = [a for a in found if a["kind"] == "witnessed"]
    if not (witnessed or found):
        raise RuntimeError(
            f"{char_id} is not the subject of any state change in "
            f"{story['story_id']} — nothing happens to them, so there is no episode "
            "to anchor. Pick a character from `tasks.py cast`."
        )
    return (witnessed or found)[0]["beat_id"]


def write_spinoff(story: Dict[str, Any], char_id: str,
                  anchor_beat_id: Optional[str] = None,
                  bible: Optional[Dict[str, Any]] = None,
                  constrained: bool = True,
                  client: Any = None) -> Dict[str, Any]:
    """
    Generate one episode.

    `constrained=False` removes the prohibition block from the brief and changes
    nothing else. That single boolean is what makes the leak proof a controlled
    experiment instead of two code paths that differ in ways nobody tracked.
    """
    anchor_beat_id = anchor_beat_id or default_anchor(story, char_id)
    built = brief_mod.build_brief(story, char_id, anchor_beat_id,
                                  bible=bible, constrained=constrained)

    # The control arm swaps the prompt too, not just the brief. Keeping the POV lock
    # and the prohibition rules while removing only the list is not a control: a
    # model told to respect a character's limits does so without being handed them,
    # and a real run built that way came back cleaner than the constrained one.
    prompt = "spinoff.md" if constrained else "spinoff_naive.md"
    system = load_prompt(PROMPTS / prompt, brief=built["text"])
    user = (f"Write the episode built on beat {anchor_beat_id} "
            f"({built['anchor']['kind']}) for {built['view']['name']}.")

    if not constrained:
        log("control run: whole season, no prohibition list, no knowledge rules",
            "warn")

    result = call_structured(
        stage=("spinoff" if constrained else "spinoff_naive")
              + f"_{story['story_id']}_{char_id}_{anchor_beat_id}",
        system=system, user=user,
        schema=SPINOFF_SCHEMA, schema_name="spinoff",
        role="WRITER", client=client, max_output_tokens=MAX_OUTPUT_TOKENS,
    )

    return {
        "story_id": story["story_id"], "char_id": char_id,
        "anchor_beat_id": anchor_beat_id, "anchor": built["anchor"],
        "constrained": constrained,
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "model": model_for("WRITER"),
        # Persisted with the artifact so the validator checks the list the writer
        # was actually handed, not one recomputed later from a different call.
        "forbidden": built["forbidden"],
        "crossing_candidates": built["crossings"],
        "bible": bible,
        "episode": {"title": result["title"], "logline": result["logline"],
                    "script": result["script"]},
        "beats": seal_branch_beats(story, char_id, result.get("beats", []),
                                   anchor_beat_id),
        "crossings": result.get("crossings", []),
        "cites": result.get("cites", []),
        "flags": result.get("flags", []),
    }


def seal_branch_beats(story: Dict[str, Any], char_id: str,
                      beats: List[Dict[str, Any]],
                      anchor_beat_id: str = "") -> List[Dict[str, Any]]:
    """
    Stamp the four fields a prompt must not be trusted with.

    `tier` and `pov` enforce hard rule 2 — a spinoff never mutates core canon. The
    id is reassigned because a model asked to suggest one will happily return "b013",
    which already exists in the mainline and would overwrite real canon on any
    future merge. `hidden_from` defaults to the entire mainline cast so branches
    cannot leak into each other: nothing in Ratnamma's serial is knowable inside
    Savithri's unless someone deliberately puts them there.

    The id carries the anchor because a character gets more than one episode.
    numbering each from 001 off `char_id` alone meant Ratnamma's b014 and b033
    episodes both produced `x_ratnamma_001..004` — four ids, four different beats,
    and whichever loaded second silently took the first one's place. Namespacing by
    anchor is what makes the id mean one beat.
    """
    mainline = [c["char_id"] for c in story["cast"]]
    scope = f"{char_id}_{anchor_beat_id}" if anchor_beat_id else char_id
    sealed = []
    for i, beat in enumerate(beats, start=1):
        placed = set(beat.get("present", [])) | set(beat.get("witnessed_by", []))
        out = dict(beat)
        out["note"] = f"model suggested beat_id {beat.get('beat_id', '?')}"
        out["beat_id"] = f"x_{scope}_{i:03d}"
        out["tier"] = "branch_canon"
        out["pov"] = char_id
        out["hidden_from"] = sorted(set(beat.get("hidden_from", []))
                                    | {c for c in mainline if c not in placed})
        # A branch beat cites the mainline beat it crosses, or nothing. It can never
        # claim a dossier timeline entry it did not come from.
        out["source_ref"] = "fictionalized"
        sealed.append(out)
    return sealed


def main() -> int:
    load_env()
    parser = argparse.ArgumentParser(prog="spinoff")
    parser.add_argument("--story", default=store.DEFAULT_STORY)
    parser.add_argument("--char", default=store.DEFAULT_CHAR)
    parser.add_argument("--anchor", default=None)
    parser.add_argument("--unconstrained", action="store_true",
                        help="omit the prohibition block; used by the leak proof")
    args = parser.parse_args()

    try:
        story = store.load_story(args.story)
        bible = promote_mod.load_bible(args.story, args.char)
        if bible is None:
            log(f"no bible for {args.char} — run `tasks.py promote` first for a "
                "fuller character. Writing from the views alone.", "warn")
        record = write_spinoff(story, args.char, args.anchor, bible=bible,
                               constrained=not args.unconstrained)
    except (RuntimeError, ValueError, KeyError, json.JSONDecodeError) as exc:
        log(str(exc), "error")
        return 1

    path = spinoff_path(args.story, args.char, record["anchor_beat_id"],
                        record["constrained"])
    write_json(path, record)

    ep = record["episode"]
    words = len(ep["script"].split())
    print(f"\n{ep['title']}")
    print(f"  {ep['logline']}")
    print(f"  {words} words · {len(record['beats'])} beats · "
          f"{len(record['cites'])} citations · anchor {record['anchor_beat_id']} "
          f"({record['anchor']['kind']})")
    for flag in record["flags"]:
        log(f"flag: {flag}", "warn")
    print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
