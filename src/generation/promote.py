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
from src.scoring.run import HOOK_TYPES
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


DEFAULT_EPISODES = 10

SEASON_SCHEMA = obj({
    "title": {"type": "string"},
    "logline": {"type": "string"},
    "season": {"type": "array", "items": obj({
        "ep": {"type": "integer"},
        "turn": {"type": "string"},
        "ends_on": {"type": "string"},
        # The mainline's ten. Imported rather than restated — two copies of an
        # enum drift, and the validator's hook check reads the same list.
        "hook_type": {"type": "string", "enum": HOOK_TYPES},
        "sets_in": {"type": "string"},
    })},
})


def bible_path(story_id: str, char_id: str) -> pathlib.Path:
    return SPINOFFS / f"{story_id}__{char_id}__bible.json"


def season_plan(story: Dict[str, Any], char_id: str, bible: Dict[str, Any],
                n_episodes: int = DEFAULT_EPISODES,
                client: Any = None) -> Dict[str, Any]:
    """
    What happens across this character's serial, one turn per episode.

    Shaped as `dossier.season[]` on purpose. The mainline is `score` (dossier plus
    season plan) then `serial` (episodes from that plan), and a spike confirmed
    `write_season` accepts a synthesized spinoff dossier and grades clean — so if
    full seasons are ever wanted, this plan is already the input they need.

    Kept as its own call rather than folded into the bible: the bible is who she is
    and the plan is what she does, and generated together a weak plan would force
    regenerating a bible that was fine. Bibles already on disk stay valid.
    """
    system = load_prompt(PROMPTS / "season.md",
                         brief=brief_mod.build_promotion_input(story, char_id),
                         n_episodes=str(n_episodes))
    plan = call_structured(
        stage=f"season_{story['story_id']}_{char_id}_{n_episodes}",
        system=system,
        user=f"Plan {n_episodes} episodes of {bible.get('genre', 'this serial')} "
             f"for {char_id}.",
        schema=SEASON_SCHEMA, schema_name="season",
        role="WRITER", client=client,
    )

    # The prompt asks; the schema cannot enforce a count and strict mode has no
    # minItems. Checked here rather than trusted, exactly as the scout's
    # thresholds are.
    got = len(plan.get("season", []))
    if got != n_episodes:
        log(f"{char_id}: asked for {n_episodes} episodes, planned {got}", "warn")
    return plan


def promote(story: Dict[str, Any], char_id: str,
            n_episodes: int = DEFAULT_EPISODES,
            client: Any = None) -> Dict[str, Any]:
    """Stub plus the three views in, character bible and season plan out."""
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

    plan = season_plan(story, char_id, bible, n_episodes, client=client)

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
        "season": plan["season"],
        "title": plan["title"],
        "logline": plan["logline"],
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
    parser.add_argument("--episodes", type=int, default=DEFAULT_EPISODES)
    args = parser.parse_args()

    try:
        story = store.load_story(args.story)
        record = promote(story, args.char, args.episodes)
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
    print(f"  ledger   {len(b['offscreen_ledger'])} window(s)")
    print(f"\n  {record['title']} — {len(record['season'])} episodes")
    print(f"  {record['logline']}\n")
    for e in record["season"]:
        print(f"    ep{e['ep']:<3} [{e['hook_type']:<11}] {e['turn'][:66]}")
        print(f"          ends on: {e['ends_on'][:64]}")
    print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
