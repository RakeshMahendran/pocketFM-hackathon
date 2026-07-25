"""
The roster screen — every character in a story, with what they know and don't.

    python tasks.py cast --story story1_denied_identity

This is the first screen of the demo. The number that sells it is the second
column: a character excluded from far more than they saw is a character with a
story the mainline never told.
"""

import sys
import json
import argparse

from src.canon import store, views
from src.util import load_env, log


def main() -> int:
    load_env()
    parser = argparse.ArgumentParser(prog="cast")
    parser.add_argument("--story", default=store.DEFAULT_STORY)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    try:
        story = store.load_story(args.story)
        rows = views.promotable(story)
    except (RuntimeError, ValueError, KeyError) as exc:
        log(str(exc), "error")
        return 1

    if args.json:
        print(json.dumps(rows, ensure_ascii=False, indent=2))
        return 0

    total = len(story["beats"])
    n_ok = sum(1 for r in rows if r["promotable"])
    print(f"\n{story['dossier'].get('title', args.story)}"
          f"   {total} beats · {len(rows)} cast · {n_ok} promotable\n")
    print(f"  {'':2} {'character':14} {'knows':>5} {'blind':>6}   role")
    for r in rows:
        mark = "•" if r["promotable"] else " "
        print(f"  {mark:2} {r['char_id']:14} {r['witnessed']:5} {r['blind']:6}   "
              f"{r['role'][:52]}")
    print(f"\n  • = promotable ({views.MIN_WITNESSED_FOR_PROMOTION}+ beats witnessed, "
          f"and excluded from more than they appear in)\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
