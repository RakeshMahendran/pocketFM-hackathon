"""
Promotion — the one expensive call that turns a cast entry into a protagonist.

    python tasks.py promote --story story1_denied_identity --char ratnamma

Fires on click, never in bulk. That is the answer to "how does this scale to a real
catalogue": stubs are free and already in the dossier, and you only pay for the
bible of a character somebody actually picked.

Kept separate from the spinoff writer on purpose. One call emitting both the bible
and the episode would leave no seam to inspect, and at the quality gate you have to
be able to tell "the character is conceived wrong" from "the prose is wrong" —
otherwise you tune blind.
"""

import sys
import pathlib
import argparse
from typing import Any, Dict, Optional

from src.canon import store, views
from src.generation.client import call_structured
from src.generation.schemas import obj
from src.generation import brief as brief_mod
from src.util import SPINOFFS, load_env, load_prompt, log, write_json

PROMPTS = pathlib.Path(__file__).resolve().parent / "prompts"

STANCES = ("dupe", "accomplice", "architect", "witness")

BIBLE_SCHEMA = obj({
    "want": {"type": "string"},
    "wound": {"type": "string"},
    "voice": {"type": "string"},
    "engine": {"type": "string"},
    "offscreen_ledger": {"type": "array", "items": obj({
        "window": {"type": "string"},
        "what": {"type": "string"},
    })},
    "reframe": {"type": "string"},
    "stance": {"type": "string", "enum": list(STANCES)},
    "genre": {"type": "string"},
    "pitch": {"type": "string"},
})


def bible_path(story_id: str, char_id: str) -> pathlib.Path:
    return SPINOFFS / f"{story_id}__{char_id}__bible.json"


def promote(story: Dict[str, Any], char_id: str,
            client: Any = None) -> Dict[str, Any]:
    """Stub plus the three views in, character bible out."""
    view = views.character_view(story, char_id)
    system = load_prompt(PROMPTS / "promotion.md",
                             brief=brief_mod.build_promotion_input(story, char_id))
    # The prompt carries the brief in its input_template, so the user message only
    # has to name the job. Keeping them in one string also keeps the cache key
    # stable against a reordering of the blocks.
    user = f"Build the character bible for {view['name']} ({char_id})."

    bible = call_structured(
        stage=f"promote_{story['story_id']}_{char_id}",
        system=system, user=user,
        schema=BIBLE_SCHEMA, schema_name="bible",
        role="WRITER", client=client,
    )

    char = store.get_char(story, char_id)
    return {
        "char_id": char_id,
        "name": view["name"],
        "role": view["role"],
        "promotable": True,
        "real_anchor": {
            "maps_to": char.get("maps_to", "invented"),
            "composite": char.get("composite", False),
            # Inherited, never restated. schemas/character.schema.json requires it
            # and nothing implemented it until now.
            "clearance": story["dossier"].get("clearance", {}).get("status", "unknown"),
        },
        "stub": {
            "facts": [b["what_happened"] for b in view["knows"]],
            "want": view["want"],
            "voice_samples": view["voice_samples"],
        },
        "bible": bible,
    }


def load_bible(story_id: str, char_id: str) -> Optional[Dict[str, Any]]:
    """The bible if it has been generated, else None. The spinoff writer runs
    without one rather than failing — a thinner episode beats no episode."""
    path = bible_path(story_id, char_id)
    if not path.exists():
        return None
    from src.util import read_json
    return read_json(path).get("bible")


def main() -> int:
    load_env()
    parser = argparse.ArgumentParser(prog="promote")
    parser.add_argument("--story", default=store.DEFAULT_STORY)
    parser.add_argument("--char", default=store.DEFAULT_CHAR)
    args = parser.parse_args()

    try:
        story = store.load_story(args.story)
        record = promote(story, args.char)
    except (RuntimeError, ValueError, KeyError) as exc:
        log(str(exc), "error")
        return 1

    write_json(bible_path(args.story, args.char), record)
    b = record["bible"]
    print(f"\n{record['name']} — {b['stance']} · {b['genre']}")
    print(f'  "{b["pitch"]}"\n')
    print(f"  WANT     {b['want']}")
    print(f"  WOUND    {b['wound']}")
    print(f"  ENGINE   {b['engine']}")
    print(f"  REFRAME  {b['reframe']}")
    print(f"  ledger   {len(b['offscreen_ledger'])} window(s)\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
