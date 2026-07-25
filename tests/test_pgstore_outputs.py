"""
The Lakebase store, without a Lakebase.

`tests/test_canon_store.py` is the integration half and it is right to be one: a
store test with a mocked driver proves the mock works. But that file skips whole
whenever no instance is reachable, which is every offline run and every CI run we
have — so the rewrite in 79fa49d (a `(story_id, beat_id)` key, four artifact
tables, a hard-rule-2 trigger) shipped with nothing watching it at all.

These tests take the other half: everything about `pgstore` that is decided in
Python before a packet leaves the process. That is more than it sounds. The
module builds every statement it runs by string assembly over module-level column
tuples, so a column added to `_SPINOFF_COLS` and forgotten in `load_spinoff`'s
`values` dict is a `KeyError`, and a placeholder list built from the wrong tuple
is a parameter-count mismatch — both of which a fake cursor catches exactly as
well as Postgres does, and several seconds sooner.

`FakePG` below is a small SQL engine, not a mock. It stores what it is given,
enforces primary keys, and hands rows back through the same projection the reader
asks for, so "round trip" here means the same thing it means in the integration
file. What it deliberately does NOT do is execute plpgsql: the `beats_guard`
trigger is asserted as emitted DDL and as the caller-side scoping that backs it
up, never as behaviour. See `test_the_guard_is_installed_on_every_init` for where
that line is drawn.
"""

import copy
import json
import re

import pytest

from src.util import SPINOFFS, STORIES, read_json

pytest.importorskip("psycopg")

from psycopg.types.json import Jsonb  # noqa: E402  (after the importorskip)

from src.canon import pgstore  # noqa: E402

SCHEMA = "canonforge_test"
STORY = "story1_denied_identity"

# ---------------------------------------------------------------------------
# the fake
# ---------------------------------------------------------------------------

# The fake enforces these the way Postgres would. Taken from the module rather
# than retyped: a key that changes there must change the test's meaning too, not
# quietly leave the test asserting the old shape.
_PKEYS = {
    "beats": pgstore._BEAT_KEYS,
    "bibles": pgstore._BIBLE_KEYS,
    "spinoffs": pgstore._EPISODE_KEYS,
    "validations": pgstore._EPISODE_KEYS,
    "violations": pgstore._EPISODE_KEYS + ("ord",),
}

_INSERT = re.compile(
    r'^INSERT INTO "(?P<schema>[^"]+)"\.(?P<table>\w+) '
    r"\((?P<cols>[^)]*)\) VALUES \((?P<ph>[^)]*)\)(?P<rest>.*)$", re.S)
_CONFLICT = re.compile(r"ON CONFLICT \((?P<keys>[^)]*)\) DO UPDATE SET (?P<sets>.*)$", re.S)
_SELECT = re.compile(
    r'^SELECT (?P<cols>.+?) FROM "(?P<schema>[^"]+)"\.(?P<table>\w+)(?P<rest>.*)$', re.S)
_DELETE = re.compile(r'^DELETE FROM "(?P<schema>[^"]+)"\.(?P<table>\w+)(?P<rest>.*)$', re.S)


def _clauses(rest: str):
    """`WHERE a = %s AND b = %s ORDER BY x, y` -> (["a", "b"], ["x", "y"])."""
    rest = rest.strip()
    order = ""
    if "ORDER BY" in rest:
        rest, _, order = rest.partition("ORDER BY")
    rest = rest.strip()
    cols = []
    if rest.startswith("WHERE"):
        for cond in rest[len("WHERE"):].strip().split(" AND "):
            col, _, val = cond.partition(" = ")
            assert val.strip() == "%s", f"unsupported condition {cond!r}"
            cols.append(col.strip())
    return cols, [c.strip() for c in order.split(",") if c.strip()]


class FakePG:
    """Rows, keyed by table. Values are stored as a database would return them."""

    def __init__(self):
        self.tables: dict[str, dict[tuple, dict]] = {}

    def rows(self, table: str) -> list[dict]:
        return list(self.tables.setdefault(table, {}).values())

    def _key(self, table: str, row: dict) -> tuple:
        return tuple(row[c] for c in _PKEYS[table])

    def insert(self, table: str, row: dict, upsert: bool) -> None:
        store = self.tables.setdefault(table, {})
        key = self._key(table, row)
        if key in store and not upsert:
            raise RuntimeError(
                f"duplicate key value violates unique constraint {table}_pkey: {key}")
        store[key] = row

    def delete(self, table: str, match: dict) -> int:
        store = self.tables.setdefault(table, {})
        gone = [k for k, r in store.items()
                if all(r.get(c) == v for c, v in match.items())]
        for k in gone:
            del store[k]
        return len(gone)

    def select(self, table: str, cols: list[str], match: dict,
               order: list[str]) -> list[tuple]:
        found = [r for r in self.rows(table)
                 if all(r.get(c) == v for c, v in match.items())]
        if order:
            found.sort(key=lambda r: tuple(r.get(c) for c in order))
        return [tuple(r.get(c) for c in cols) for r in found]


def _stored(value):
    """
    What Postgres hands back for a value that went in.

    jsonb arrives wrapped and comes back as plain data, so the wrapper is
    unpicked and re-parsed — which also means a value that is not JSON
    serialisable fails here rather than three layers into psycopg's adapter.
    """
    if isinstance(value, Jsonb):
        return json.loads(json.dumps(value.obj))
    return value


class FakeCursor:
    def __init__(self, conn):
        self.conn = conn
        self.db = conn.db
        self._result: list[tuple] = []
        self.rowcount = 0

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    # -- driver surface ----------------------------------------------------

    def execute(self, sql, params=None):
        self.conn.statements.append((sql, params))
        self._check(sql, params)
        self._run(sql, list(params) if params is not None else [])

    def executemany(self, sql, rows):
        rows = list(rows)
        if not rows:
            self.conn.statements.append((sql, None))
            self.rowcount = 0
            return
        for row in rows:
            self.conn.statements.append((sql, row))
            self._check(sql, row)
            self._run(sql, list(row))

    def fetchone(self):
        return self._result[0] if self._result else None

    def fetchall(self):
        return list(self._result)

    # -- the bits that make it a database ----------------------------------

    def _check(self, sql, params):
        if params is None:
            assert "%s" not in sql, f"placeholders with no parameters: {sql!r}"
            return
        assert sql.count("%s") == len(params), (
            f"{sql.count('%s')} placeholders bound to {len(params)} parameters "
            f"in {sql!r}")
        for p in params:
            assert not isinstance(p, (dict, list)), (
                f"bare {type(p).__name__} parameter {p!r} — a json column must be "
                f"wrapped in Jsonb or psycopg cannot adapt it")

    def _run(self, sql, params):
        self._result = []
        self.rowcount = 0

        m = _INSERT.match(sql)
        if m:
            cols = [c.strip() for c in m.group("cols").split(",")]
            phs = [p.strip() for p in m.group("ph").split(",")]
            assert len(cols) == len(phs), (
                f"{len(cols)} columns against {len(phs)} values in {sql!r}")
            assert m.group("schema") == SCHEMA
            row = {c: _stored(v) for c, v in zip(cols, params)}
            conflict = _CONFLICT.search(m.group("rest"))
            if conflict:
                # Postgres needs a unique index over the arbiter columns, so an
                # ON CONFLICT target that is not the primary key does not resolve
                # to "update the existing row" — it fails outright.
                target = tuple(c.strip() for c in conflict.group("keys").split(","))
                assert target == _PKEYS[m.group("table")], (
                    f"ON CONFLICT {target} is not {m.group('table')}'s primary key")
            self.db.insert(m.group("table"), row, upsert=bool(conflict))
            self.rowcount = 1
            return

        m = _DELETE.match(sql)
        if m:
            where, _ = _clauses(m.group("rest"))
            self.rowcount = self.db.delete(m.group("table"), dict(zip(where, params)))
            return

        m = _SELECT.match(sql)
        if m:
            cols = [c.strip() for c in m.group("cols").split(",")]
            where, order = _clauses(m.group("rest"))
            self._result = self.db.select(m.group("table"), cols,
                                          dict(zip(where, params)), order)
            self.rowcount = len(self._result)
            return

        # DDL, the catalogue probe in `_migrate_beats`, and the backfill UPDATE.
        # Recorded, never executed — nothing downstream of them reads a result.


class FakeConn:
    def __init__(self):
        self.db = FakePG()
        self.statements: list[tuple] = []
        self.commits = 0

    def cursor(self):
        return FakeCursor(self)

    def commit(self):
        self.commits += 1

    def sql(self) -> list[str]:
        return [s for s, _ in self.statements]


# ---------------------------------------------------------------------------
# fixtures
# ---------------------------------------------------------------------------

def _artifact(name):
    return read_json(SPINOFFS / f"{STORY}__{name}.json")


def _mainline():
    return read_json(STORIES / STORY / "beats.json")["beats"]


def _drop_nulls(beat):
    """`_row_to_beat`'s contract: a null column is an absent key, not a null one."""
    return {k: v for k, v in beat.items() if v is not None}


def _beat(bid, story="s", **over):
    row = {"beat_id": bid, "ep": 1, "seq": 1, "world_time": "D1",
           "location": "somewhere", "what_happened": f"{bid} happens",
           "source_ref": "fictionalized", "tier": pgstore.CORE,
           "present": [], "witnessed_by": [], "hidden_from": [],
           "state_changes": []}
    row.update(over)
    return row


@pytest.fixture
def conn():
    c = FakeConn()
    pgstore.init_schema(c, schema=SCHEMA)
    return c


@pytest.fixture
def loaded(conn):
    """The whole delivered golden path, both arms of the leak proof included."""
    pgstore.load_beats(_mainline(), STORY, conn, schema=SCHEMA)
    pgstore.load_bible(_artifact("ratnamma__bible"), STORY, conn, schema=SCHEMA)
    pgstore.load_spinoff(_artifact("ratnamma__b033"), conn, schema=SCHEMA)
    pgstore.load_spinoff(_artifact("ratnamma__b033__leak"), conn, schema=SCHEMA)
    pgstore.load_validation(_artifact("ratnamma__b033__validation"), conn, schema=SCHEMA)
    pgstore.load_validation(_artifact("ratnamma__b033__leak__validation"), conn,
                            schema=SCHEMA)
    return conn


# ---------------------------------------------------------------------------
# round trip — beats are the source of truth, so they come back or it is a bug
# ---------------------------------------------------------------------------

def test_every_mainline_beat_survives_the_round_trip_field_for_field(conn):
    """
    Not a count. `test_canon_store.py` can only afford to compare lengths and one
    `hidden_from`; here the whole 46-beat sheet is compared dict against dict, so a
    column dropped from `_SCALARS` — which is exactly how `crossing_of` was lost
    once already — fails instead of passing with the right number of rows.
    """
    beats = _mainline()
    pgstore.load_beats(beats, STORY, conn, schema=SCHEMA)

    assert pgstore.all_beats(conn, schema=SCHEMA) == [_drop_nulls(b) for b in beats]


def test_the_storage_columns_never_join_the_beat_they_identify(conn):
    """`story_id` and `anchor_beat_id` are how a row is found, not part of canon.
    The views compare against the source JSON file, which has neither key."""
    pgstore.load_beats(_mainline()[:1], STORY, conn, schema=SCHEMA,
                       anchor_beat_id="b033")

    got = pgstore.all_beats(conn, schema=SCHEMA)[0]

    assert "story_id" not in got and "anchor_beat_id" not in got


def test_a_null_optional_field_comes_back_as_an_absent_key(conn):
    """
    The sealed branch beats carry `crossing_of: null` on every beat that crosses
    nothing, and mainline beats carry no `pov` or `note` at all. Both land in the
    same nullable columns, so the reader cannot tell "absent" from "null" — it
    picks absent, because that is the shape the source files have and the shape
    `character_view` is compared against.
    """
    record = _artifact("ratnamma__b033")
    uncrossed = [b for b in record["beats"] if b["crossing_of"] is None]
    assert uncrossed, "fixture no longer exercises the null case"

    pgstore.load_spinoff(record, conn, schema=SCHEMA)
    got = {b["beat_id"]: b for b in
           pgstore.branch_beats(STORY, "ratnamma", "b033", conn, schema=SCHEMA)}

    assert "crossing_of" not in got[uncrossed[0]["beat_id"]]
    assert got[record["beats"][0]["beat_id"]]["crossing_of"] == "b033"


def test_the_bible_comes_back_exactly_as_promotion_wrote_it(conn):
    """The promotion call is the expensive one and fires once. If storage cannot
    return it byte for byte, the demo pays for it again on every click."""
    record = _artifact("ratnamma__bible")
    pgstore.load_bible(record, STORY, conn, schema=SCHEMA)

    assert pgstore.get_bible(STORY, "ratnamma", conn, schema=SCHEMA) == record


def test_the_constrained_episode_comes_back_exactly_as_the_writer_wrote_it(conn):
    record = _artifact("ratnamma__b033")
    pgstore.load_spinoff(record, conn, schema=SCHEMA)

    expected = dict(record, beats=[_drop_nulls(b) for b in record["beats"]])

    assert pgstore.get_spinoff(STORY, "ratnamma", "b033", conn, schema=SCHEMA) == expected


def test_the_panel_verdict_and_its_violations_come_back_in_the_reported_order(conn):
    """
    Order is the payload. The panel reports the deterministic findings first and
    the demo reads the list top down; violations are stored one row each precisely
    so they can be counted and filtered, and an unordered read would undo that.
    """
    record = _artifact("ratnamma__b033__leak__validation")
    n = pgstore.load_validation(record, conn, schema=SCHEMA)

    assert n == len(record["violations"])
    assert pgstore.get_validation(STORY, "ratnamma", "b033", conn, schema=SCHEMA,
                                  constrained=False) == record


def test_a_violation_keeps_the_field_name_the_column_could_not_have(conn):
    """`check` is a reserved word so the column is `check_name`. The rename is the
    reader's job and nothing outside this module should ever see `check_name`."""
    pgstore.load_validation(_artifact("ratnamma__b033__validation"), conn, schema=SCHEMA)

    found = pgstore.violations_for(STORY, "ratnamma", "b033", conn, schema=SCHEMA)

    assert found and all("check_name" not in v for v in found)
    assert [v["check"] for v in found] == [
        v["check"] for v in _artifact("ratnamma__b033__validation")["violations"]]


def test_the_two_arms_of_the_leak_proof_are_kept_apart(loaded):
    """
    `constrained` is in every artifact key because the proof generates the same
    character on the same beat twice. Merged, the demo would show one verdict and
    the whole experiment collapses to an anecdote.
    """
    clean = pgstore.get_validation(STORY, "ratnamma", "b033", loaded, schema=SCHEMA)
    leak = pgstore.get_validation(STORY, "ratnamma", "b033", loaded, schema=SCHEMA,
                                  constrained=False)

    assert clean == _artifact("ratnamma__b033__validation")
    assert leak == _artifact("ratnamma__b033__leak__validation")
    assert clean["n_errors"] < leak["n_errors"]

    on = pgstore.get_spinoff(STORY, "ratnamma", "b033", loaded, schema=SCHEMA)
    off = pgstore.get_spinoff(STORY, "ratnamma", "b033", loaded, schema=SCHEMA,
                              constrained=False)

    assert on["episode"]["script"] != off["episode"]["script"]


def test_a_record_that_was_never_stored_reads_back_as_none(conn):
    assert pgstore.get_beat(STORY, "b999", conn, schema=SCHEMA) is None
    assert pgstore.get_bible(STORY, "nobody", conn, schema=SCHEMA) is None
    assert pgstore.get_spinoff(STORY, "nobody", "b001", conn, schema=SCHEMA) is None
    assert pgstore.get_validation(STORY, "nobody", "b001", conn, schema=SCHEMA) is None


# ---------------------------------------------------------------------------
# story_id — the bug the key change fixed
# ---------------------------------------------------------------------------

def test_two_stories_that_both_number_a_beat_b001_do_not_overwrite_each_other(conn):
    """
    The regression that forced the new primary key. All four delivered stories
    number their beats `b001..b0nn`, so under a `beat_id` key loading the second
    story silently replaced the first and every character view answered from the
    wrong season without raising anything.
    """
    pgstore.load_beats([_beat("b001", what_happened="story one, beat one")],
                       "story1", conn, schema=SCHEMA)
    pgstore.load_beats([_beat("b001", what_happened="story two, beat one")],
                       "story2", conn, schema=SCHEMA)

    assert len(pgstore.all_beats(conn, schema=SCHEMA)) == 2
    assert pgstore.get_beat("story1", "b001", conn, schema=SCHEMA)["what_happened"] \
        == "story one, beat one"
    assert pgstore.get_beat("story2", "b001", conn, schema=SCHEMA)["what_happened"] \
        == "story two, beat one"


def test_all_beats_can_be_narrowed_to_one_story(conn):
    pgstore.load_beats([_beat("b001"), _beat("b002", seq=2)], "story1", conn,
                       schema=SCHEMA)
    pgstore.load_beats([_beat("b001")], "story2", conn, schema=SCHEMA)

    assert len(pgstore.all_beats(conn, schema=SCHEMA, story_id="story1")) == 2
    assert len(pgstore.all_beats(conn, schema=SCHEMA, story_id="story2")) == 1
    assert len(pgstore.all_beats(conn, schema=SCHEMA)) == 3


def test_the_tier_and_story_filters_narrow_together_rather_than_replacing_each_other(conn):
    pgstore.load_beats([_beat("b001")], "story1", conn, schema=SCHEMA)
    pgstore.load_beats([_beat("x1", tier=pgstore.BRANCH, pov="ana")], "story1", conn,
                       schema=SCHEMA, anchor_beat_id="b001")
    pgstore.load_beats([_beat("x1", tier=pgstore.BRANCH, pov="ana")], "story2", conn,
                       schema=SCHEMA, anchor_beat_id="b001")

    both = pgstore.all_beats(conn, schema=SCHEMA, tier=pgstore.BRANCH,
                             story_id="story1")

    assert [b["beat_id"] for b in both] == ["x1"]


def test_branch_beats_belong_to_one_character_and_one_anchor(conn):
    """`seal_branch_beats` numbers every episode's beats `x_<char>_001`, so the id
    alone cannot tell Ratnamma's b033 episode from her b014 one."""
    pgstore.load_beats([_beat("x_ana_001", tier=pgstore.BRANCH, pov="ana")],
                       STORY, conn, schema=SCHEMA, anchor_beat_id="b033")
    pgstore.load_beats([_beat("x_ben_001", tier=pgstore.BRANCH, pov="ben")],
                       STORY, conn, schema=SCHEMA, anchor_beat_id="b033")

    mine = pgstore.branch_beats(STORY, "ana", "b033", conn, schema=SCHEMA)

    assert [b["beat_id"] for b in mine] == ["x_ana_001"]


# ---------------------------------------------------------------------------
# the SQL itself — the failure a database-free test can genuinely catch
# ---------------------------------------------------------------------------

def test_every_statement_binds_one_parameter_per_placeholder(loaded):
    """
    Every statement in this module is assembled by joining a module-level column
    tuple against `["%s"] * len(...)`, and the values are built by a separate
    comprehension over a different tuple. Nothing but arithmetic keeps the two in
    step, and the failure is a `ProgrammingError` at demo time.

    `FakeCursor._check` asserts this on every execute in every test here; this one
    exists so the sweep is a named guarantee rather than a side effect, and so it
    fails loudly if the fixture ever stops covering the whole surface.
    """
    bound = [(s, p) for s, p in loaded.statements if p is not None]

    assert len(bound) > 60, "the golden-path fixture stopped exercising the module"
    for sql, params in bound:
        assert sql.count("%s") == len(params), sql


@pytest.mark.parametrize("table, cols, keys", [
    ("beats", pgstore._BEAT_COLS, pgstore._BEAT_KEYS),
    ("bibles", pgstore._BIBLE_COLS, pgstore._BIBLE_KEYS),
    ("spinoffs", pgstore._SPINOFF_COLS, pgstore._EPISODE_KEYS),
    ("validations", pgstore._VALIDATION_COLS, pgstore._EPISODE_KEYS),
])
def test_an_upsert_lists_as_many_values_as_columns(table, cols, keys):
    sql = pgstore._upsert(SCHEMA, table, cols, keys)
    m = _INSERT.match(sql)

    assert m, sql
    assert len(m.group("cols").split(",")) == len(cols)
    assert len(m.group("ph").split(",")) == len(cols)


@pytest.mark.parametrize("table, cols, keys", [
    ("beats", pgstore._BEAT_COLS, pgstore._BEAT_KEYS),
    ("bibles", pgstore._BIBLE_COLS, pgstore._BIBLE_KEYS),
    ("spinoffs", pgstore._SPINOFF_COLS, pgstore._EPISODE_KEYS),
    ("validations", pgstore._VALIDATION_COLS, pgstore._EPISODE_KEYS),
])
def test_an_upsert_never_rewrites_the_columns_it_matched_on(table, cols, keys):
    """`SET story_id = EXCLUDED.story_id` is legal, useless, and the tell that the
    key tuple and the column tuple were assembled from the wrong pair. The arbiter
    is checked alongside it: ON CONFLICT needs a unique index over exactly those
    columns, and a target that has none is an error, not a slower upsert."""
    m = _CONFLICT.search(pgstore._upsert(SCHEMA, table, cols, keys))
    assigned = {s.split(" = ")[0].strip() for s in m.group("sets").split(", ")}

    assert tuple(c.strip() for c in m.group("keys").split(",")) == _PKEYS[table]
    assert assigned == set(cols) - set(keys)


def test_a_json_column_is_handed_over_wrapped_rather_than_as_a_bare_dict(loaded):
    """psycopg cannot adapt a bare dict or list, so an array column added to the
    scalar tuple by mistake fails at execute time with an adapter error nobody
    reads as "wrong tuple"."""
    for sql, params in loaded.statements:
        for p in params or []:
            assert not isinstance(p, (dict, list)), sql


def test_every_beat_read_orders_its_rows_rather_than_trusting_the_heap(loaded):
    """
    Beats mean nothing out of order — `gaps` is runs of consecutive beats and the
    brief is read top to bottom. Postgres returns an unordered SELECT in whatever
    order the heap gives it, which is insertion order right up until the first
    update rewrites a row, so this is the bug that appears only after a rerun.
    """
    loaded.statements.clear()

    pgstore.all_beats(loaded, schema=SCHEMA)
    pgstore.all_beats(loaded, schema=SCHEMA, story_id=STORY, tier=pgstore.CORE)
    pgstore.get_beat(STORY, "b033", loaded, schema=SCHEMA)
    pgstore.branch_beats(STORY, "ratnamma", "b033", loaded, schema=SCHEMA)

    reads = [s for s in loaded.sql() if f'FROM "{SCHEMA}".beats' in s]

    assert len(reads) == 4
    assert all(s.endswith("ORDER BY story_id, ep, seq") for s in reads)


# ---------------------------------------------------------------------------
# hard rule 2 — a spinoff never mutates core canon
# ---------------------------------------------------------------------------

def test_the_guard_is_installed_on_every_init(conn):
    """
    The trigger body is plpgsql and cannot run here, so this asserts what a
    database-free test honestly can: that `init_schema` emits it, that it fires
    BEFORE UPDATE (after the fact is too late — the row is already written), and
    that it names both prohibitions. Behaviour is `test_canon_store.py`'s job on
    the day there is an instance to run it against.
    """
    ddl = "\n".join(conn.sql())

    assert f'CREATE TRIGGER beats_guard BEFORE UPDATE ON "{SCHEMA}".beats' in ddl
    assert f'CREATE OR REPLACE FUNCTION "{SCHEMA}".beats_guard()' in ddl
    assert "hard rule 2" in ddl
    # Rule one: core canon may never be overwritten by a branch write.
    assert f"IF OLD.tier = '{pgstore.CORE}' AND NEW.tier <> '{pgstore.CORE}'" in ddl
    # Rule two: a branch beat may not be dragged to another episode or another pov.
    assert "NEW.anchor_beat_id IS DISTINCT FROM OLD.anchor_beat_id" in ddl
    assert "NEW.pov IS DISTINCT FROM OLD.pov" in ddl


def test_the_guard_is_replaced_rather_than_stacked_on_a_second_init(conn):
    """`init_schema` runs on every demo reset. Two triggers on one table would
    raise the same exception twice and read as two different bugs."""
    pgstore.init_schema(conn, schema=SCHEMA)
    ddl = conn.sql()

    assert ddl.count(f'DROP TRIGGER IF EXISTS beats_guard ON "{SCHEMA}".beats') == 2
    assert ddl.count(f"CREATE TRIGGER beats_guard BEFORE UPDATE ON "
                     f'"{SCHEMA}".beats FOR EACH ROW EXECUTE FUNCTION '
                     f'"{SCHEMA}".beats_guard()') == 2


def test_the_branch_beat_delete_can_never_reach_a_mainline_row(conn):
    """
    The second lock on hard rule 2, and the one that lives in Python. `load_spinoff`
    clears the previous run's beats before writing the new ones; if that DELETE
    were scoped only to the story and the anchor it would take the mainline beat
    the episode is anchored on with it, and the trigger — which is BEFORE UPDATE —
    would not see a thing.
    """
    pgstore.load_spinoff(_artifact("ratnamma__b033"), conn, schema=SCHEMA)

    deletes = [s for s in conn.sql() if s.startswith(f'DELETE FROM "{SCHEMA}".beats')]

    assert len(deletes) == 1
    where, _ = _clauses(_DELETE.match(deletes[0]).group("rest"))
    params = next(p for s, p in conn.statements if s == deletes[0])
    bound = dict(zip(where, params))

    assert set(where) == {"story_id", "pov", "anchor_beat_id", "tier"}
    assert bound["tier"] == pgstore.BRANCH
    assert bound["pov"] == "ratnamma"
    assert bound["story_id"] == STORY


def test_a_spinoff_run_leaves_the_mainline_it_is_anchored_on_untouched(conn):
    """The end-state form of the test above: b033 is the anchor AND a real mainline
    beat, so a mis-scoped delete would delete the very beat the episode crosses."""
    pgstore.load_beats(_mainline(), STORY, conn, schema=SCHEMA)
    before = pgstore.all_beats(conn, schema=SCHEMA, tier=pgstore.CORE)

    pgstore.load_spinoff(_artifact("ratnamma__b033"), conn, schema=SCHEMA)

    assert pgstore.all_beats(conn, schema=SCHEMA, tier=pgstore.CORE) == before
    assert pgstore.get_beat(STORY, "b033", conn, schema=SCHEMA)["tier"] == pgstore.CORE


def test_two_characters_anchored_on_the_same_beat_do_not_clear_each_other(conn):
    """
    Ratnamma and Savithri are both anchored on b033 in the delivered data, so the
    branch-beat DELETE has to be scoped by `pov` as well as by anchor. Scoped by
    anchor alone, generating the second episode would silently delete the first
    one's canon — and deletion is the one mutation no validator looks for.
    """
    pgstore.load_spinoff(_artifact("ratnamma__b033"), conn, schema=SCHEMA)
    pgstore.load_spinoff(_artifact("savithri__b033"), conn, schema=SCHEMA)

    assert len(pgstore.branch_beats(STORY, "ratnamma", "b033", conn, schema=SCHEMA)) == 4
    assert len(pgstore.branch_beats(STORY, "savithri", "b033", conn, schema=SCHEMA)) == 4


def test_two_episodes_of_one_character_really_do_reuse_the_same_beat_ids():
    """
    Why the guard's second rule exists, stated as data rather than as a comment.
    `seal_branch_beats` numbers beats `x_<char>_NNN` per episode, so Ratnamma's
    b014 episode and her b033 episode both claim `x_ratnamma_001` — and the
    branch-beat DELETE is scoped by anchor, so it cannot absorb the collision.
    Whichever ran last would win in silence if the trigger were ever dropped.
    """
    a = [b["beat_id"] for b in _artifact("ratnamma__b014")["beats"]]
    b = [b["beat_id"] for b in _artifact("ratnamma__b033")["beats"]]

    assert set(a) & set(b), "the fixtures no longer collide; re-read the guard"
    # And the delete cannot absorb it, because the two runs name different anchors.
    assert _artifact("ratnamma__b014")["anchor_beat_id"] != \
        _artifact("ratnamma__b033")["anchor_beat_id"]


def test_the_unconstrained_arm_writes_no_branch_canon(conn):
    """
    The leak episode is a violation we generated on purpose. It is stored as an
    artifact so the proof stays queryable and its beats are not stored at all —
    canon is the last place they belong.
    """
    leak = _artifact("ratnamma__b033__leak")
    assert leak["beats"], "fixture no longer has beats to refuse"

    written = pgstore.load_spinoff(leak, conn, schema=SCHEMA)

    assert written == 0
    assert pgstore.all_beats(conn, schema=SCHEMA) == []
    assert pgstore.get_spinoff(STORY, "ratnamma", "b033", conn, schema=SCHEMA,
                               constrained=False) is not None


def test_the_unconstrained_arm_does_not_delete_the_constrained_arms_canon(conn):
    """
    The arms share `(story_id, char_id, anchor_beat_id)` and the branch-beat DELETE
    is not scoped by `constrained` — it cannot be, because branch beats carry no
    such column. So the leak run must not issue that DELETE at all, or running the
    proof in the order the demo runs it would erase the clean episode's canon.
    """
    pgstore.load_spinoff(_artifact("ratnamma__b033"), conn, schema=SCHEMA)
    clean = pgstore.branch_beats(STORY, "ratnamma", "b033", conn, schema=SCHEMA)
    assert clean

    pgstore.load_spinoff(_artifact("ratnamma__b033__leak"), conn, schema=SCHEMA)

    assert pgstore.branch_beats(STORY, "ratnamma", "b033", conn, schema=SCHEMA) == clean


def test_a_beat_that_names_no_tier_lands_as_core_canon(conn):
    """`tier` is NOT NULL and a column DEFAULT does not apply to an explicitly
    inserted NULL, only to an omitted column — so the default lives in Python."""
    beat = _beat("b001")
    del beat["tier"]

    pgstore.load_beats([beat], STORY, conn, schema=SCHEMA)

    assert pgstore.get_beat(STORY, "b001", conn, schema=SCHEMA)["tier"] == pgstore.CORE


def test_a_violation_cannot_outlive_the_verdict_that_found_it(conn):
    """One row per finding is only safe if the rows cannot be orphaned; the demo
    counts violations by episode and a stale row inflates the count."""
    ddl = "\n".join(conn.sql())

    assert f'REFERENCES "{SCHEMA}".validations' in ddl
    assert "ON DELETE CASCADE" in ddl


# ---------------------------------------------------------------------------
# idempotency — re-seeding is how the demo resets
# ---------------------------------------------------------------------------

def test_loading_the_same_beat_sheet_twice_leaves_the_same_canon(conn):
    beats = _mainline()
    pgstore.load_beats(beats, STORY, conn, schema=SCHEMA)
    before = pgstore.all_beats(conn, schema=SCHEMA)

    pgstore.load_beats(beats, STORY, conn, schema=SCHEMA)

    assert pgstore.all_beats(conn, schema=SCHEMA) == before


def test_seeding_the_whole_golden_path_twice_leaves_the_same_end_state(loaded):
    """Every artifact at once, because idempotency per table is not idempotency of
    the pipeline: `load_spinoff` deletes beats and then writes them back."""
    before = {t: sorted(map(repr, rows))
              for t, rows in ((t, loaded.db.rows(t)) for t in _PKEYS)}

    pgstore.load_beats(_mainline(), STORY, loaded, schema=SCHEMA)
    pgstore.load_bible(_artifact("ratnamma__bible"), STORY, loaded, schema=SCHEMA)
    pgstore.load_spinoff(_artifact("ratnamma__b033"), loaded, schema=SCHEMA)
    pgstore.load_spinoff(_artifact("ratnamma__b033__leak"), loaded, schema=SCHEMA)
    pgstore.load_validation(_artifact("ratnamma__b033__validation"), loaded, schema=SCHEMA)
    pgstore.load_validation(_artifact("ratnamma__b033__leak__validation"), loaded,
                            schema=SCHEMA)

    assert {t: sorted(map(repr, loaded.db.rows(t))) for t in _PKEYS} == before


def test_a_rerun_that_emits_fewer_beats_leaves_none_of_the_old_ones_behind(conn):
    """
    Upserting would leave the fourth beat of a four-beat run standing after a
    three-beat rerun, still `branch_canon`, still `pov: ratnamma` — a beat the
    episode no longer contains but every constraint set still honours.
    """
    record = _artifact("ratnamma__b033")
    pgstore.load_spinoff(record, conn, schema=SCHEMA)
    assert len(pgstore.branch_beats(STORY, "ratnamma", "b033", conn, schema=SCHEMA)) == 4

    shorter = copy.deepcopy(record)
    shorter["beats"] = shorter["beats"][:2]
    pgstore.load_spinoff(shorter, conn, schema=SCHEMA)

    got = pgstore.branch_beats(STORY, "ratnamma", "b033", conn, schema=SCHEMA)
    assert [b["beat_id"] for b in got] == [b["beat_id"] for b in shorter["beats"]]


def test_a_second_verdict_with_fewer_violations_leaves_no_stale_finding(conn):
    """A clean rerun after a dirty one must read clean. Violations are keyed by
    ordinal, so upserting by ordinal would keep every finding past the new count."""
    dirty = _artifact("ratnamma__b033__leak__validation")
    pgstore.load_validation(dirty, conn, schema=SCHEMA)

    clean = dict(dirty, violations=[], n_errors=0, status="clean")
    pgstore.load_validation(clean, conn, schema=SCHEMA)

    assert pgstore.violations_for(STORY, "ratnamma", "b033", conn, schema=SCHEMA,
                                  constrained=False) == []
    assert pgstore.get_validation(STORY, "ratnamma", "b033", conn, schema=SCHEMA,
                                  constrained=False)["status"] == "clean"


def test_reloading_a_bible_updates_the_one_row_rather_than_adding_another(conn):
    record = _artifact("ratnamma__bible")
    pgstore.load_bible(record, STORY, conn, schema=SCHEMA)
    pgstore.load_bible(dict(record, role="a different role"), STORY, conn, schema=SCHEMA)

    assert len(conn.db.rows("bibles")) == 1
    assert pgstore.get_bible(STORY, "ratnamma", conn, schema=SCHEMA)["role"] \
        == "a different role"
