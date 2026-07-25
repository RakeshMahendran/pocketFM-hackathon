"""
The golden path, start to finish, from cache.

    python tasks.py demo                      # replay, network off
    python -m src.demo_seed --record          # run live once to fill the cache

`tasks.py demo` forces `OFFLINE=1`, so every call here must be a cache hit and a
miss raises rather than quietly opening a socket. That is the kill switch: wifi at
a hackathon fails, and the demo has to survive it.

Record it the moment the path works, then never think about it again.
"""

import sys
import argparse

from src.canon import store, views
from src.generation import promote as promote_mod
from src.generation import spinoff as spinoff_mod
from src.validation import run as validate_mod
from src.util import ensure_dirs, load_env, log, offline, read_json, write_json


def main() -> int:
    load_env()
    parser = argparse.ArgumentParser(prog="demo_seed")
    parser.add_argument("--story", default=store.DEFAULT_STORY)
    parser.add_argument("--char", default=store.DEFAULT_CHAR)
    parser.add_argument("--anchor", default=None)
    parser.add_argument("--record", action="store_true",
                        help="run live and populate the cache instead of replaying")
    args = parser.parse_args()

    if args.record and offline():
        log("--record cannot run with OFFLINE set. Use `python -m src.demo_seed "
            "--record` directly rather than `tasks.py demo`, which forces it.",
            "error")
        return 1

    ensure_dirs()
    try:
        story = store.load_story(args.story)
        anchor = args.anchor or spinoff_mod.default_anchor(story, args.char)

        print(f"\n  1/4  cast — {args.story}")
        rows = views.promotable(story)
        print(f"       {len(rows)} characters, "
              f"{sum(1 for r in rows if r['promotable'])} promotable")

        print(f"  2/4  {args.char} — knows / blind")
        view = views.character_view(story, args.char)
        print(f"       knows {len(view['knows'])}, blind {len(view['blind'])}, "
              f"{len(view['gaps'])} gap runs, {len(view['anchors'])} moments")

        print(f"  3/4  promotion")
        bible_path = promote_mod.bible_path(args.story, args.char)
        if args.record or not bible_path.exists():
            record = promote_mod.promote(story, args.char)
            write_json(bible_path, record)
        else:
            record = read_json(bible_path)
        print(f"       {record['bible']['stance']} · {record['bible']['genre']}")

        print(f"  4/4  episode on {anchor} — the live moment")
        path = spinoff_mod.spinoff_path(args.story, args.char, anchor)
        # The committed episode IS the fallback. Replaying an LLM response to
        # rebuild an artifact that is already on disk, in full, in a readable
        # format, is a hop for its own sake — and it makes the demo depend on a
        # cache key surviving every refactor, which is exactly what broke last time.
        if args.record or not path.exists():
            spin = spinoff_mod.write_spinoff(story, args.char, anchor,
                                             bible=record["bible"])
            write_json(path, spin)
        else:
            spin = read_json(path)
            print(f"       replayed from {path.name}")
        print(f"       \"{spin['episode']['title']}\" — "
              f"{len(spin['episode']['script'].split())} words")

        verdict_path = path.with_name(path.stem + "__validation.json")
        if args.record or not verdict_path.exists():
            result = validate_mod.validate(spin, story)
            write_json(verdict_path, result)
        else:
            result = read_json(verdict_path)
        validate_mod.report(result)
    except (RuntimeError, ValueError, KeyError) as exc:
        log(str(exc), "error")
        return 1

    return 0 if result["status"] == "clean" else 1


if __name__ == "__main__":
    sys.exit(main())
