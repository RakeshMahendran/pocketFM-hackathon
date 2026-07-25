"""
Create the canon schema and load a beat sheet into it.

Idempotent: re-running resets the demo without duplicating canon.

Which beat sheet is a choice now that `beats` is keyed on `(story_id, beat_id)`.
The four delivered stories all number their beats from `b001`, so before that key
existed the second `seed` run silently replaced the first story's canon with the
second's; they can now sit in one table at once.
"""

import argparse
import pathlib
import sys
from typing import Optional

from src.canon import pgstore as store
from src.canon.db import connect
from src.canon.views import character_view_from_beats as character_view
from src.util import IPL_BEATS, STORIES, log, read_json


def beats_path(story_id: str) -> pathlib.Path:
    """
    The story's own beat sheet, or the hand-written IPL fixture.

    The fixture is not under `data/stories/` and has no directory of its own — it
    is the fallback canon `tasks.py seed` loads when nothing else is asked for.
    """
    delivered = STORIES / story_id / "beats.json"
    return delivered if delivered.exists() else IPL_BEATS


def seed(path: Optional[str] = None, schema: str = store.DEFAULT_SCHEMA,
         story_id: str = store.DEFAULT_STORY_ID) -> int:
    raw = read_json(path or beats_path(story_id))
    # A delivered story wraps its list; the hand-written fixture is a bare list.
    beats = raw["beats"] if isinstance(raw, dict) else raw
    with connect() as conn:
        store.init_schema(conn, schema=schema)
        count = store.load_beats(beats, story_id, conn, schema=schema)
        stored = store.all_beats(conn, schema=schema, story_id=story_id)
    log(f"{schema}.beats now holds {len(stored)} beats for {story_id}")
    return count


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(prog="seed")
    parser.add_argument("--story", default=store.DEFAULT_STORY_ID,
                        help="story id the beats are filed under")
    parser.add_argument("--beats", default=None,
                        help="a beat sheet to load instead of the story's own")
    parser.add_argument("--schema", default=store.DEFAULT_SCHEMA)
    parser.add_argument("--char", default="jignesh", help="character to summarise after loading")
    args = parser.parse_args(argv)

    seed(args.beats, args.schema, args.story)

    with connect() as conn:
        view = character_view(
            store.all_beats(conn, schema=args.schema, story_id=args.story), args.char)
    print(f"{args.char}: knows {len(view['knows'])}, "
          f"blind {len(view['blind'])}, gaps {len(view['gaps'])}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
