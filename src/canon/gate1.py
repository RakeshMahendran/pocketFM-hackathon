"""
Gate 1 — print one character's knows / blind / gaps / anchors.

    python tasks.py gate1 --story story1_denied_identity --char ratnamma

Nothing downstream exists until this is right. If the counts are wrong here, the
brief is wrong, the episode is wrong, and the validator certifies a lie.
"""

import sys
import json
import argparse
from typing import Any, Dict, List

from src.canon import store, views
from src.util import load_env, log


def _line(beats: List[Dict[str, Any]], n: int = 4) -> str:
    ids = [b["beat_id"] for b in beats]
    shown = ", ".join(ids[:n])
    return f"{shown}{f' … +{len(ids) - n} more' if len(ids) > n else ''}"


def report(story: Dict[str, Any], char_id: str) -> Dict[str, Any]:
    view = views.character_view(story, char_id)
    total = view["n_beats"]

    print(f"\n{view['name']}  ({char_id})  —  {story['story_id']}")
    print(f"  {view['role']}")
    print(f"  wants: {view['want']}\n")

    print(f"  knows   {len(view['knows']):3}/{total}   {_line(view['knows'])}")
    print(f"  blind   {len(view['blind']):3}/{total}   {_line(view['blind'])}")
    print(f"    of which explicitly hidden_from: {len(view['explicitly_hidden'])}")
    print(f"  in the room, did not register: "
          f"{_line(view['present_not_witnessed']) if view['present_not_witnessed'] else '—'}")

    print(f"\n  gaps  {len(view['gaps'])} run(s) of beats she is absent from:")
    for g in view["gaps"]:
        after = g["after_beat"] or "season start"
        before = g["before_beat"] or "season end"
        print(f"    {after} → {before}   {g['span']:2} beats, ep {g['eps']}")

    print(f"\n  anchors — the moments the most happens to her:")
    for a in view["anchors"]:
        print(f"    {a['beat_id']} ep{a['ep']:<3} {a['valence']:+d}  [{a['kind']:9}] "
              f"{a['fact'][:58]}")

    print(f"\n  voice  {len(view['voice_samples'])} sample line(s):")
    for line in view["voice_samples"][:3]:
        print(f"    \"{line[:76]}\"")
    print()
    return view


def main() -> int:
    load_env()
    parser = argparse.ArgumentParser(prog="gate1")
    parser.add_argument("--story", default=store.DEFAULT_STORY)
    parser.add_argument("--char", default=store.DEFAULT_CHAR)
    parser.add_argument("--json", action="store_true", help="emit the view as JSON")
    args = parser.parse_args()

    try:
        story = store.load_story(args.story)
        if args.json:
            print(json.dumps(views.character_view(story, args.char),
                             ensure_ascii=False, indent=2))
        else:
            report(story, args.char)
    except (RuntimeError, ValueError, KeyError) as exc:
        log(str(exc), "error")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
