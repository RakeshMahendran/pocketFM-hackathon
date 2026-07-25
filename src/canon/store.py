"""
Beat store on Lakebase Postgres.

Beats are the source of truth, so the store's only job is to hand them back
exactly as they went in. The array fields live in jsonb with GIN indexes -
membership (`present @> '["jignesh"]'`) is the query the character views are
built from, even though the views themselves filter in Python at this scale.
"""

from typing import Any, Optional

import psycopg
from psycopg.types.json import Jsonb

from src.util import log

Beat = dict[str, Any]

DEFAULT_SCHEMA = "canonforge"

# Ordered so a row can be rebuilt into the exact dict shape it arrived as.
_SCALARS = ("beat_id", "ep", "seq", "world_time", "location", "what_happened",
            "source_ref", "tier", "pov", "note")
_ARRAYS = ("present", "witnessed_by", "hidden_from", "state_changes")


def init_schema(conn: psycopg.Connection, schema: str = DEFAULT_SCHEMA) -> None:
    with conn.cursor() as cur:
        cur.execute(f'CREATE SCHEMA IF NOT EXISTS "{schema}"')
        cur.execute(
            f"""
            CREATE TABLE IF NOT EXISTS "{schema}".beats (
                beat_id       text PRIMARY KEY,
                ep            integer NOT NULL,
                seq           integer NOT NULL,
                world_time    text,
                location      text,
                what_happened text,
                source_ref    text,
                tier          text NOT NULL DEFAULT 'core_canon',
                pov           text,
                note          text,
                present       jsonb NOT NULL DEFAULT '[]'::jsonb,
                witnessed_by  jsonb NOT NULL DEFAULT '[]'::jsonb,
                hidden_from   jsonb NOT NULL DEFAULT '[]'::jsonb,
                state_changes jsonb NOT NULL DEFAULT '[]'::jsonb
            )
            """
        )
        for col in ("present", "witnessed_by", "hidden_from"):
            cur.execute(
                f'CREATE INDEX IF NOT EXISTS beats_{col}_gin '
                f'ON "{schema}".beats USING gin ({col})'
            )
        cur.execute(
            f'CREATE INDEX IF NOT EXISTS beats_order '
            f'ON "{schema}".beats (ep, seq)'
        )
    conn.commit()


def load_beats(
    beats: list[Beat],
    conn: psycopg.Connection,
    schema: str = DEFAULT_SCHEMA,
) -> int:
    """
    Upsert a beat sheet. Idempotent by beat_id so re-seeding the demo does
    not duplicate canon.
    """
    cols = _SCALARS + _ARRAYS
    placeholders = ", ".join(["%s"] * len(cols))
    updates = ", ".join(f"{c} = EXCLUDED.{c}" for c in cols if c != "beat_id")
    sql = (
        f'INSERT INTO "{schema}".beats ({", ".join(cols)}) '
        f"VALUES ({placeholders}) "
        f"ON CONFLICT (beat_id) DO UPDATE SET {updates}"
    )
    # tier is NOT NULL, and a column DEFAULT does not apply to an explicitly
    # inserted NULL - only to an omitted column. A beat without tier would
    # otherwise raise IntegrityError rather than land as core_canon.
    rows = [
        [b.get(c, "core_canon") if c == "tier" else b.get(c) for c in _SCALARS]
        + [Jsonb(b.get(c, [])) for c in _ARRAYS]
        for b in beats
    ]
    with conn.cursor() as cur:
        cur.executemany(sql, rows)
    conn.commit()
    log(f"loaded {len(rows)} beats into {schema}.beats")
    return len(rows)


def _row_to_beat(row: tuple) -> Beat:
    beat = dict(zip(_SCALARS + _ARRAYS, row))
    # Optional fields are absent from the source JSON rather than null, and
    # the views compare against the source file.
    return {k: v for k, v in beat.items() if v is not None}


def all_beats(
    conn: psycopg.Connection,
    schema: str = DEFAULT_SCHEMA,
    tier: Optional[str] = None,
) -> list[Beat]:
    cols = ", ".join(_SCALARS + _ARRAYS)
    sql = f'SELECT {cols} FROM "{schema}".beats'
    params: list[Any] = []
    if tier:
        sql += " WHERE tier = %s"
        params.append(tier)
    sql += " ORDER BY ep, seq"
    with conn.cursor() as cur:
        cur.execute(sql, params)
        return [_row_to_beat(r) for r in cur.fetchall()]


def get_beat(
    beat_id: str,
    conn: psycopg.Connection,
    schema: str = DEFAULT_SCHEMA,
) -> Optional[Beat]:
    cols = ", ".join(_SCALARS + _ARRAYS)
    with conn.cursor() as cur:
        cur.execute(
            f'SELECT {cols} FROM "{schema}".beats WHERE beat_id = %s', (beat_id,)
        )
        row = cur.fetchone()
    return _row_to_beat(row) if row else None
