"""
Beat store on Lakebase Postgres.

Renamed from `store.py` on merge: `src/canon/store.py` is the loader that reads
`data/stories/` off disk, which the generation and validation stages are built on.
Two different jobs, so two names rather than one module doing both badly.

Beats are the source of truth, so the store's only job is to hand them back
exactly as they went in. The array fields live in jsonb with GIN indexes -
membership (`present @> '["jignesh"]'`) is the query the character views are
built from, even though the views themselves filter in Python at this scale.

Four stories ship in `data/stories/` and every one of them numbers its beats
`b001..b0nn`, so `beat_id` alone is not an identity - loading a second story on
top of a first silently replaced it. The key is `(story_id, beat_id)`. `story_id`
is storage identity and never joins the beat dict: `character_view` is compared
against the source JSON file, and a key the file does not have would fail that
comparison for no reason.

The spinoff artifacts live here too - the bible, the episode, and the validation
result with its violations broken out one row each, because "show me every
violation for this character's episode" is a question the demo asks out loud.
Only the arrays that are genuinely arrays go to jsonb; anything the UI filters or
counts on is a column.

Hard rule 2 - a spinoff never mutates core canon - is enforced by a BEFORE UPDATE
trigger rather than by the caller. `check_branch_beats` in the validator catches
an id collision after the fact, and after the fact is too late if nobody ran it.
"""

from typing import Any, Optional

import psycopg
from psycopg.types.json import Jsonb

from src.util import log

Beat = dict[str, Any]
Record = dict[str, Any]

DEFAULT_SCHEMA = "canonforge"

# The hand-written IPL fixture is what any pre-`story_id` deployment's beats table
# holds, so it is both the seed default and the value the migration backfills with.
DEFAULT_STORY_ID = "ipl_molipur"

CORE = "core_canon"
BRANCH = "branch_canon"

# Storage identity. Written and queried, never handed back inside a beat.
_STORAGE = ("story_id", "anchor_beat_id")

# Ordered so a row can be rebuilt into the exact dict shape it arrived as.
# `crossing_of` is here because sealed branch beats carry it and the earlier
# column list dropped it on the way in.
_SCALARS = ("beat_id", "ep", "seq", "world_time", "location", "what_happened",
            "source_ref", "tier", "pov", "note", "crossing_of")
_ARRAYS = ("present", "witnessed_by", "hidden_from", "state_changes")

_BEAT_COLS = _STORAGE + _SCALARS + _ARRAYS
_BEAT_KEYS = ("story_id", "beat_id")

_BIBLE_COLS = ("story_id", "char_id", "name", "role", "promotable",
               "maps_to", "composite", "clearance",
               "stub_want", "stub_facts", "voice_samples",
               "want", "wound", "voice", "engine", "reframe",
               "stance", "genre", "pitch", "offscreen_ledger")
_BIBLE_KEYS = ("story_id", "char_id")
_BIBLE_JSON = ("stub_facts", "voice_samples", "offscreen_ledger")

# An episode is identified by its run as well as its anchor: the leak proof
# generates the same character on the same beat twice and the two must both land.
_EPISODE_KEYS = ("story_id", "char_id", "anchor_beat_id", "constrained")

_SPINOFF_COLS = _EPISODE_KEYS + (
    "generated_at", "model", "title", "logline", "script",
    "anchor", "forbidden", "crossing_candidates", "crossings",
    "cites", "flags", "bible")
_SPINOFF_JSON = ("anchor", "forbidden", "crossing_candidates", "crossings",
                 "cites", "flags", "bible")

_VALIDATION_COLS = _EPISODE_KEYS + (
    "status", "n_errors", "members_run", "members_expected",
    "inconclusive", "attempts_that_failed", "deterministic_errors")
_VALIDATION_JSON = ("inconclusive", "attempts_that_failed", "deterministic_errors")

# `check` is a reserved word, so the column is `check_name` and the round trip
# renames it. Everything else matches `checks.violation()` field for field.
_VIOLATION_COLS = _EPISODE_KEYS + (
    "ord", "check_name", "severity", "quote", "beat_id", "why", "source")


def _upsert(schema: str, table: str, cols: tuple, keys: tuple) -> str:
    updates = ", ".join(f"{c} = EXCLUDED.{c}" for c in cols if c not in keys)
    return (f'INSERT INTO "{schema}".{table} ({", ".join(cols)}) '
            f'VALUES ({", ".join(["%s"] * len(cols))}) '
            f'ON CONFLICT ({", ".join(keys)}) DO UPDATE SET {updates}')


# ---------------------------------------------------------------------------
# SCHEMA
# ---------------------------------------------------------------------------

def init_schema(conn: psycopg.Connection, schema: str = DEFAULT_SCHEMA) -> None:
    """
    Create everything, or bring an older deployment up to date.

    `CREATE TABLE IF NOT EXISTS` is not enough on its own: a deployment seeded
    before `story_id` existed already has a `beats` table, so the statement is a
    no-op and the new column never arrives. The additive steps below run against
    that table and are themselves no-ops on a table that was just created.
    """
    with conn.cursor() as cur:
        cur.execute(f'CREATE SCHEMA IF NOT EXISTS "{schema}"')
        _create_beats(cur, schema)
        # Before the indexes: two of them are on columns a legacy table only
        # acquires here, and CREATE INDEX on a missing column is an error.
        _migrate_beats(cur, schema)
        _index_beats(cur, schema)
        _guard_core_canon(cur, schema)
        _create_artifacts(cur, schema)
    conn.commit()


def _create_beats(cur: psycopg.Cursor, schema: str) -> None:
    cur.execute(
        f"""
        CREATE TABLE IF NOT EXISTS "{schema}".beats (
            story_id       text NOT NULL,
            beat_id        text NOT NULL,
            ep             integer NOT NULL,
            seq            integer NOT NULL,
            world_time     text,
            location       text,
            what_happened  text,
            source_ref     text,
            tier           text NOT NULL DEFAULT 'core_canon',
            pov            text,
            note           text,
            crossing_of    text,
            anchor_beat_id text,
            present        jsonb NOT NULL DEFAULT '[]'::jsonb,
            witnessed_by   jsonb NOT NULL DEFAULT '[]'::jsonb,
            hidden_from    jsonb NOT NULL DEFAULT '[]'::jsonb,
            state_changes  jsonb NOT NULL DEFAULT '[]'::jsonb,
            PRIMARY KEY (story_id, beat_id)
        )
        """
    )


def _index_beats(cur: psycopg.Cursor, schema: str) -> None:
    for col in ("present", "witnessed_by", "hidden_from"):
        cur.execute(
            f'CREATE INDEX IF NOT EXISTS beats_{col}_gin '
            f'ON "{schema}".beats USING gin ({col})'
        )
    cur.execute(
        f'CREATE INDEX IF NOT EXISTS beats_story_order '
        f'ON "{schema}".beats (story_id, ep, seq)'
    )
    # Partial: only branch rows carry an anchor, and this is the index behind
    # "the beats this episode produced".
    cur.execute(
        f'CREATE INDEX IF NOT EXISTS beats_branch '
        f'ON "{schema}".beats (story_id, pov, anchor_beat_id) '
        f"WHERE tier = '{BRANCH}'"
    )
    # Superseded by beats_story_order - an (ep, seq) index cannot serve a
    # per-story scan now that one table holds four seasons.
    cur.execute(f'DROP INDEX IF EXISTS "{schema}".beats_order')


def _migrate_beats(cur: psycopg.Cursor, schema: str) -> None:
    """Bring a pre-`story_id` beats table forward without dropping its canon."""
    table = f'"{schema}".beats'
    for col, kind in (("story_id", "text"), ("anchor_beat_id", "text"),
                      ("crossing_of", "text")):
        cur.execute(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {col} {kind}")

    cur.execute(f"UPDATE {table} SET story_id = %s WHERE story_id IS NULL",
                (DEFAULT_STORY_ID,))
    if cur.rowcount:
        log(f"migrated {cur.rowcount} beat(s) in {schema}.beats to "
            f"story_id {DEFAULT_STORY_ID}", "warn")
    cur.execute(f"ALTER TABLE {table} ALTER COLUMN story_id SET NOT NULL")

    # Only touch the key when it is actually the old one. Dropping and rebuilding
    # a primary key on every init would rewrite the index each time the demo resets.
    cur.execute("SELECT pg_get_constraintdef(oid) FROM pg_constraint "
                "WHERE conrelid = %s::regclass AND contype = 'p'", (table,))
    row = cur.fetchone()
    if (row[0] if row else "") != "PRIMARY KEY (story_id, beat_id)":
        cur.execute(f"ALTER TABLE {table} DROP CONSTRAINT IF EXISTS beats_pkey")
        cur.execute(f"ALTER TABLE {table} ADD CONSTRAINT beats_pkey "
                    "PRIMARY KEY (story_id, beat_id)")
        log(f"{schema}.beats is now keyed on (story_id, beat_id)", "warn")


def _guard_core_canon(cur: psycopg.Cursor, schema: str) -> None:
    """
    Hard rule 2, in the one place that cannot be skipped.

    `load_beats` upserts, so without this a branch beat that happened to reuse a
    mainline id would quietly become the mainline beat and every downstream view
    would agree with it. A caller can forget to run the validator; it cannot forget
    to go through the table.

    The second rule is the same failure one level down. `seal_branch_beats` numbers
    branch beats `x_<char>_001`, which is unique within an episode and identical
    across two episodes of the same character - so Ratnamma's b033 episode and her
    b014 episode both claim `x_ratnamma_001`. Whichever ran last would win in
    silence. Loud is the only acceptable outcome.
    """
    cur.execute(
        f"""
        CREATE OR REPLACE FUNCTION "{schema}".beats_guard() RETURNS trigger
        LANGUAGE plpgsql AS $guard$
        BEGIN
            IF OLD.tier = '{CORE}' AND NEW.tier <> '{CORE}' THEN
                RAISE EXCEPTION
                    'hard rule 2: %/% is core_canon and a % write may not overwrite it',
                    OLD.story_id, OLD.beat_id, NEW.tier;
            END IF;
            IF OLD.tier = '{BRANCH}'
               AND (NEW.anchor_beat_id IS DISTINCT FROM OLD.anchor_beat_id
                    OR NEW.pov IS DISTINCT FROM OLD.pov) THEN
                RAISE EXCEPTION
                    'branch beat %/% belongs to the % episode anchored on %; the % episode anchored on % may not take its id',
                    OLD.story_id, OLD.beat_id, OLD.pov, OLD.anchor_beat_id,
                    NEW.pov, NEW.anchor_beat_id;
            END IF;
            RETURN NEW;
        END
        $guard$
        """
    )
    # DROP + CREATE rather than CREATE OR REPLACE TRIGGER, which needs PG 14.
    cur.execute(f'DROP TRIGGER IF EXISTS beats_guard ON "{schema}".beats')
    cur.execute(
        f'CREATE TRIGGER beats_guard BEFORE UPDATE ON "{schema}".beats '
        f'FOR EACH ROW EXECUTE FUNCTION "{schema}".beats_guard()'
    )


def _create_artifacts(cur: psycopg.Cursor, schema: str) -> None:
    """
    The three spinoff artifacts.

    Flattened where the field is asked a question - stance, genre, status,
    severity, the citation list - and jsonb only where the value is genuinely an
    array or an opaque snapshot.
    """
    cur.execute(
        f"""
        CREATE TABLE IF NOT EXISTS "{schema}".bibles (
            story_id         text NOT NULL,
            char_id          text NOT NULL,
            name             text,
            role             text,
            promotable       boolean NOT NULL DEFAULT true,
            maps_to          text,
            composite        boolean NOT NULL DEFAULT false,
            clearance        text,
            stub_want        text,
            stub_facts       jsonb NOT NULL DEFAULT '[]'::jsonb,
            voice_samples    jsonb NOT NULL DEFAULT '[]'::jsonb,
            want             text,
            wound            text,
            voice            text,
            engine           text,
            reframe          text,
            stance           text,
            genre            text,
            pitch            text,
            offscreen_ledger jsonb NOT NULL DEFAULT '[]'::jsonb,
            PRIMARY KEY (story_id, char_id)
        )
        """
    )
    cur.execute(
        f"""
        CREATE TABLE IF NOT EXISTS "{schema}".spinoffs (
            story_id            text NOT NULL,
            char_id             text NOT NULL,
            anchor_beat_id      text NOT NULL,
            constrained         boolean NOT NULL,
            generated_at        text,
            model               text,
            title               text,
            logline             text,
            script              text,
            anchor              jsonb NOT NULL DEFAULT '{{}}'::jsonb,
            forbidden           jsonb NOT NULL DEFAULT '{{}}'::jsonb,
            crossing_candidates jsonb NOT NULL DEFAULT '[]'::jsonb,
            crossings           jsonb NOT NULL DEFAULT '[]'::jsonb,
            cites               jsonb NOT NULL DEFAULT '[]'::jsonb,
            flags               jsonb NOT NULL DEFAULT '[]'::jsonb,
            bible               jsonb,
            PRIMARY KEY (story_id, char_id, anchor_beat_id, constrained)
        )
        """
    )
    # Which episodes rest on a given mainline beat is the leak question asked
    # backwards, and it is a membership test on an array - the GIN idiom exactly.
    cur.execute(f'CREATE INDEX IF NOT EXISTS spinoffs_cites_gin '
                f'ON "{schema}".spinoffs USING gin (cites)')

    cur.execute(
        f"""
        CREATE TABLE IF NOT EXISTS "{schema}".validations (
            story_id             text NOT NULL,
            char_id              text NOT NULL,
            anchor_beat_id       text NOT NULL,
            constrained          boolean NOT NULL,
            status               text NOT NULL,
            n_errors             integer NOT NULL DEFAULT 0,
            members_run          integer,
            members_expected     integer,
            inconclusive         jsonb NOT NULL DEFAULT '[]'::jsonb,
            attempts_that_failed jsonb NOT NULL DEFAULT '{{}}'::jsonb,
            deterministic_errors jsonb NOT NULL DEFAULT '[]'::jsonb,
            PRIMARY KEY (story_id, char_id, anchor_beat_id, constrained)
        )
        """
    )
    cur.execute(
        f"""
        CREATE TABLE IF NOT EXISTS "{schema}".violations (
            story_id       text NOT NULL,
            char_id        text NOT NULL,
            anchor_beat_id text NOT NULL,
            constrained    boolean NOT NULL,
            ord            integer NOT NULL,
            check_name     text NOT NULL,
            severity       text NOT NULL,
            quote          text NOT NULL DEFAULT '',
            beat_id        text NOT NULL DEFAULT '',
            why            text NOT NULL DEFAULT '',
            source         text NOT NULL DEFAULT '',
            PRIMARY KEY (story_id, char_id, anchor_beat_id, constrained, ord),
            FOREIGN KEY (story_id, char_id, anchor_beat_id, constrained)
                REFERENCES "{schema}".validations
                ON DELETE CASCADE
        )
        """
    )
    # "Which mainline beat leaks most often" crosses episodes, so it is the one
    # question the primary key's leading columns cannot serve.
    cur.execute(f'CREATE INDEX IF NOT EXISTS violations_beat '
                f'ON "{schema}".violations (story_id, beat_id)')


# ---------------------------------------------------------------------------
# BEATS
# ---------------------------------------------------------------------------

def load_beats(
    beats: list[Beat],
    story_id: str,
    conn: psycopg.Connection,
    schema: str = DEFAULT_SCHEMA,
    anchor_beat_id: Optional[str] = None,
) -> int:
    """
    Upsert a beat sheet. Idempotent by `(story_id, beat_id)` so re-seeding the
    demo does not duplicate canon.

    `anchor_beat_id` is the episode a sealed branch beat came out of, and is left
    null for mainline canon. It is what tells two episodes of the same character
    apart, since the sealed ids do not.
    """
    sql = _upsert(schema, "beats", _BEAT_COLS, _BEAT_KEYS)
    # tier is NOT NULL, and a column DEFAULT does not apply to an explicitly
    # inserted NULL - only to an omitted column. A beat without tier would
    # otherwise raise IntegrityError rather than land as core_canon.
    rows = [
        [story_id, anchor_beat_id]
        + [b.get(c, CORE) if c == "tier" else b.get(c) for c in _SCALARS]
        + [Jsonb(b.get(c, [])) for c in _ARRAYS]
        for b in beats
    ]
    with conn.cursor() as cur:
        cur.executemany(sql, rows)
    conn.commit()
    log(f"loaded {len(rows)} beats into {schema}.beats as {story_id}")
    return len(rows)


def _row_to_beat(row: tuple) -> Beat:
    beat = dict(zip(_SCALARS + _ARRAYS, row))
    # Optional fields are absent from the source JSON rather than null, and
    # the views compare against the source file.
    return {k: v for k, v in beat.items() if v is not None}


def _select_beats(conn: psycopg.Connection, schema: str,
                  where: list[str], params: list[Any]) -> list[Beat]:
    sql = f'SELECT {", ".join(_SCALARS + _ARRAYS)} FROM "{schema}".beats'
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY story_id, ep, seq"
    with conn.cursor() as cur:
        cur.execute(sql, params)
        return [_row_to_beat(r) for r in cur.fetchall()]


def all_beats(
    conn: psycopg.Connection,
    schema: str = DEFAULT_SCHEMA,
    tier: Optional[str] = None,
    story_id: Optional[str] = None,
) -> list[Beat]:
    where, params = [], []
    if tier:
        where.append("tier = %s")
        params.append(tier)
    if story_id:
        where.append("story_id = %s")
        params.append(story_id)
    return _select_beats(conn, schema, where, params)


def branch_beats(
    story_id: str,
    char_id: str,
    anchor_beat_id: str,
    conn: psycopg.Connection,
    schema: str = DEFAULT_SCHEMA,
) -> list[Beat]:
    """The sealed beats one spinoff episode wrote back."""
    return _select_beats(
        conn, schema,
        ["story_id = %s", "pov = %s", "anchor_beat_id = %s", "tier = %s"],
        [story_id, char_id, anchor_beat_id, BRANCH],
    )


def get_beat(
    story_id: str,
    beat_id: str,
    conn: psycopg.Connection,
    schema: str = DEFAULT_SCHEMA,
) -> Optional[Beat]:
    found = _select_beats(conn, schema, ["story_id = %s", "beat_id = %s"],
                          [story_id, beat_id])
    return found[0] if found else None


# ---------------------------------------------------------------------------
# THE BIBLE
# ---------------------------------------------------------------------------

def load_bible(record: Record, story_id: str, conn: psycopg.Connection,
               schema: str = DEFAULT_SCHEMA) -> None:
    """
    Store one promotion output.

    Takes `story_id` separately because the bible record does not carry one - it
    is written per story directory and identified by its filename. The episode and
    validation records do carry theirs, so they do not take the argument.
    """
    bible = record.get("bible", {})
    anchor = record.get("real_anchor", {})
    stub = record.get("stub", {})
    values = {
        "story_id": story_id, "char_id": record["char_id"],
        "name": record.get("name"), "role": record.get("role"),
        "promotable": record.get("promotable", True),
        "maps_to": anchor.get("maps_to"), "composite": anchor.get("composite", False),
        "clearance": anchor.get("clearance"),
        "stub_want": stub.get("want"), "stub_facts": stub.get("facts", []),
        "voice_samples": stub.get("voice_samples", []),
        "offscreen_ledger": bible.get("offscreen_ledger", []),
    }
    for field in ("want", "wound", "voice", "engine", "reframe",
                  "stance", "genre", "pitch"):
        values[field] = bible.get(field)

    with conn.cursor() as cur:
        cur.execute(_upsert(schema, "bibles", _BIBLE_COLS, _BIBLE_KEYS),
                    [Jsonb(values[c]) if c in _BIBLE_JSON else values[c]
                     for c in _BIBLE_COLS])
    conn.commit()
    log(f"stored the {record['char_id']} bible in {schema}.bibles")


def get_bible(story_id: str, char_id: str, conn: psycopg.Connection,
              schema: str = DEFAULT_SCHEMA) -> Optional[Record]:
    """The promotion record as `promote()` returned it, or None."""
    with conn.cursor() as cur:
        cur.execute(
            f'SELECT {", ".join(_BIBLE_COLS)} FROM "{schema}".bibles '
            "WHERE story_id = %s AND char_id = %s", (story_id, char_id))
        row = cur.fetchone()
    if not row:
        return None
    r = dict(zip(_BIBLE_COLS, row))
    return {
        "char_id": r["char_id"], "name": r["name"], "role": r["role"],
        "promotable": r["promotable"],
        "real_anchor": {"maps_to": r["maps_to"], "composite": r["composite"],
                        "clearance": r["clearance"]},
        "stub": {"facts": r["stub_facts"], "want": r["stub_want"],
                 "voice_samples": r["voice_samples"]},
        "bible": {"want": r["want"], "wound": r["wound"], "voice": r["voice"],
                  "engine": r["engine"], "offscreen_ledger": r["offscreen_ledger"],
                  "reframe": r["reframe"], "stance": r["stance"],
                  "genre": r["genre"], "pitch": r["pitch"]},
    }


# ---------------------------------------------------------------------------
# THE EPISODE
# ---------------------------------------------------------------------------

def load_spinoff(record: Record, conn: psycopg.Connection,
                 schema: str = DEFAULT_SCHEMA) -> int:
    """
    Store one spinoff episode and write its sealed beats back as branch canon.

    Returns the number of branch beats written.

    The unconstrained control arm is stored as an artifact and its beats are not:
    they are the leak we generated on purpose, and canon is the last place they
    belong. The episode row still lands so the leak proof stays queryable.

    `bible` is kept on the row rather than joined from `bibles` for the same
    reason `forbidden` is - the episode records what the writer was actually
    handed, and a bible regenerated later would answer a different question.
    """
    story_id, char_id = record["story_id"], record["char_id"]
    anchor = record["anchor_beat_id"]
    constrained = record.get("constrained", True)
    episode = record.get("episode", {})

    values = {
        "story_id": story_id, "char_id": char_id, "anchor_beat_id": anchor,
        "constrained": constrained,
        "generated_at": record.get("generated_at"), "model": record.get("model"),
        "title": episode.get("title"), "logline": episode.get("logline"),
        "script": episode.get("script"),
        "anchor": record.get("anchor", {}), "forbidden": record.get("forbidden", {}),
        "crossing_candidates": record.get("crossing_candidates", []),
        "crossings": record.get("crossings", []),
        "cites": record.get("cites", []), "flags": record.get("flags", []),
        "bible": record.get("bible"),
    }

    with conn.cursor() as cur:
        cur.execute(_upsert(schema, "spinoffs", _SPINOFF_COLS, _EPISODE_KEYS),
                    [Jsonb(values[c]) if c in _SPINOFF_JSON else values[c]
                     for c in _SPINOFF_COLS])
        if constrained:
            # Replace rather than upsert: a re-run that emits three beats where it
            # emitted four must not leave the fourth behind. Scoped to this
            # character's episode - two characters share an anchor in the
            # delivered data - and to branch_canon, which is a second lock on
            # hard rule 2: this statement cannot reach a mainline row.
            cur.execute(
                f'DELETE FROM "{schema}".beats WHERE story_id = %s AND pov = %s '
                "AND anchor_beat_id = %s AND tier = %s",
                (story_id, char_id, anchor, BRANCH))

    if not constrained:
        conn.commit()
        log(f"{story_id}/{char_id}/{anchor}: unconstrained run stored as an "
            "artifact only - its beats are the deliberate leak and are never "
            "written back as canon", "warn")
        return 0

    return load_beats(record.get("beats", []), story_id, conn, schema=schema,
                      anchor_beat_id=anchor)


def get_spinoff(story_id: str, char_id: str, anchor_beat_id: str,
                conn: psycopg.Connection, schema: str = DEFAULT_SCHEMA,
                constrained: bool = True) -> Optional[Record]:
    """The episode as `write_spinoff()` returned it, or None."""
    with conn.cursor() as cur:
        cur.execute(
            f'SELECT {", ".join(_SPINOFF_COLS)} FROM "{schema}".spinoffs '
            "WHERE story_id = %s AND char_id = %s AND anchor_beat_id = %s "
            "AND constrained = %s",
            (story_id, char_id, anchor_beat_id, constrained))
        row = cur.fetchone()
    if not row:
        return None
    r = dict(zip(_SPINOFF_COLS, row))
    return {
        "story_id": r["story_id"], "char_id": r["char_id"],
        "anchor_beat_id": r["anchor_beat_id"], "anchor": r["anchor"],
        "constrained": r["constrained"],
        "generated_at": r["generated_at"], "model": r["model"],
        "forbidden": r["forbidden"],
        "crossing_candidates": r["crossing_candidates"],
        "bible": r["bible"],
        "episode": {"title": r["title"], "logline": r["logline"],
                    "script": r["script"]},
        "beats": branch_beats(story_id, char_id, anchor_beat_id, conn, schema=schema),
        "crossings": r["crossings"], "cites": r["cites"], "flags": r["flags"],
    }


# ---------------------------------------------------------------------------
# THE VERDICT
# ---------------------------------------------------------------------------

def load_validation(result: Record, conn: psycopg.Connection,
                    schema: str = DEFAULT_SCHEMA) -> int:
    """
    Store one panel result and its violations, one row each. Returns the count.

    Violations are replaced rather than upserted by ordinal, so a re-run that
    finds fewer cannot leave a stale finding on the board.

    `deterministic_errors` stays on the parent row as jsonb even though every
    entry also appears among the violations. It cannot be recovered by filtering
    them: `panel.dedupe` merges a deterministic finding with whichever panel
    members quoted the same line and rewrites `source` as it goes.
    """
    key = (result["story_id"], result["char_id"],
           result.get("anchor_beat_id") or "", result.get("constrained", True))
    values = {
        "story_id": key[0], "char_id": key[1], "anchor_beat_id": key[2],
        "constrained": key[3],
        "status": result["status"], "n_errors": result.get("n_errors", 0),
        "members_run": result.get("members_run"),
        "members_expected": result.get("members_expected"),
        "inconclusive": result.get("inconclusive", []),
        "attempts_that_failed": result.get("attempts_that_failed", {}),
        "deterministic_errors": result.get("deterministic_errors", []),
    }
    found = result.get("violations", [])
    rows = [
        list(key) + [i, v.get("check", ""), v.get("severity", ""),
                     v.get("quote", ""), v.get("beat_id", ""),
                     v.get("why", ""), v.get("source", "")]
        for i, v in enumerate(found)
    ]

    with conn.cursor() as cur:
        cur.execute(_upsert(schema, "validations", _VALIDATION_COLS, _EPISODE_KEYS),
                    [Jsonb(values[c]) if c in _VALIDATION_JSON else values[c]
                     for c in _VALIDATION_COLS])
        cur.execute(
            f'DELETE FROM "{schema}".violations WHERE story_id = %s AND char_id = %s '
            "AND anchor_beat_id = %s AND constrained = %s", key)
        cur.executemany(
            f'INSERT INTO "{schema}".violations ({", ".join(_VIOLATION_COLS)}) '
            f'VALUES ({", ".join(["%s"] * len(_VIOLATION_COLS))})', rows)
    conn.commit()
    log(f"{key[1]}/{key[2]}: {result['status']} — stored {len(rows)} violation(s)")
    return len(rows)


def violations_for(story_id: str, char_id: str, anchor_beat_id: str,
                   conn: psycopg.Connection, schema: str = DEFAULT_SCHEMA,
                   constrained: bool = True) -> list[Record]:
    """Every violation found against one episode, in the order the panel reported."""
    fields = _VIOLATION_COLS[len(_EPISODE_KEYS) + 1:]
    with conn.cursor() as cur:
        cur.execute(
            f'SELECT {", ".join(fields)} FROM "{schema}".violations '
            "WHERE story_id = %s AND char_id = %s AND anchor_beat_id = %s "
            "AND constrained = %s ORDER BY ord",
            (story_id, char_id, anchor_beat_id, constrained))
        rows = cur.fetchall()
    # check_name back to `check` — the reserved word the column could not be.
    return [dict(zip(("check",) + fields[1:], r)) for r in rows]


def get_validation(story_id: str, char_id: str, anchor_beat_id: str,
                   conn: psycopg.Connection, schema: str = DEFAULT_SCHEMA,
                   constrained: bool = True) -> Optional[Record]:
    """The panel result as `validate()` returned it, or None."""
    with conn.cursor() as cur:
        cur.execute(
            f'SELECT {", ".join(_VALIDATION_COLS)} FROM "{schema}".validations '
            "WHERE story_id = %s AND char_id = %s AND anchor_beat_id = %s "
            "AND constrained = %s",
            (story_id, char_id, anchor_beat_id, constrained))
        row = cur.fetchone()
    if not row:
        return None
    r = dict(zip(_VALIDATION_COLS, row))
    return {
        "story_id": r["story_id"], "char_id": r["char_id"],
        "anchor_beat_id": r["anchor_beat_id"], "constrained": r["constrained"],
        "status": r["status"],
        "violations": violations_for(story_id, char_id, anchor_beat_id, conn,
                                     schema=schema, constrained=constrained),
        "n_errors": r["n_errors"],
        "deterministic_errors": r["deterministic_errors"],
        "inconclusive": r["inconclusive"],
        "attempts_that_failed": r["attempts_that_failed"],
        "members_run": r["members_run"],
        "members_expected": r["members_expected"],
    }
