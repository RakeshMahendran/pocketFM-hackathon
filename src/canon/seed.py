"""
Create the canon schema and load a beat sheet into it.

Idempotent: re-running resets the demo without duplicating canon.
"""

import argparse
import sys

from src.canon import pgstore as store
from src.canon.db import connect
from src.canon.views import character_view_from_beats as character_view
from src.util import IPL_BEATS, log, read_json


def seed(path=IPL_BEATS, schema: str = store.DEFAULT_SCHEMA) -> int:
    beats = read_json(path)
    with connect() as conn:
        store.init_schema(conn, schema=schema)
        count = store.load_beats(beats, conn, schema=schema)
        stored = store.all_beats(conn, schema=schema)
    log(f"{schema}.beats now holds {len(stored)} beats")
    return count


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(prog="seed")
    parser.add_argument("--beats", default=str(IPL_BEATS))
    parser.add_argument("--schema", default=store.DEFAULT_SCHEMA)
    parser.add_argument("--char", default="jignesh", help="character to summarise after loading")
    args = parser.parse_args(argv)

    seed(args.beats, args.schema)

    with connect() as conn:
        view = character_view(store.all_beats(conn, schema=args.schema), args.char)
    print(f"{args.char}: knows {len(view['knows'])}, "
          f"blind {len(view['blind'])}, gaps {len(view['gaps'])}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
