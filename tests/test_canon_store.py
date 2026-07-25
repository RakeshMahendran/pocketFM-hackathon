"""
Beat store against a real Lakebase Postgres.

These are integration tests on purpose. A store test with a mocked driver
proves the mock works. They skip when no Lakebase is reachable so the
offline suite still runs, and they use a throwaway schema so a test run
can never touch demo canon.
"""

import os
import uuid

import pytest

from src.util import IPL_BEATS, read_json

pytestmark = pytest.mark.lakebase

TEST_SCHEMA = f"canonforge_test_{uuid.uuid4().hex[:8]}"
# The IPL sample predates story_id and carries none of its own, so it is filed
# under the same default the seeder uses.
STORY = "ipl_molipur"


def _reachable() -> bool:
    if os.environ.get("OFFLINE", "0") not in ("0", "", "false", "False"):
        return False
    try:
        from src.canon.db import healthcheck

        return healthcheck()
    except Exception:
        return False


pytest.importorskip("psycopg")
if not _reachable():
    pytest.skip("no Lakebase reachable", allow_module_level=True)


@pytest.fixture(scope="module")
def store():
    # pgstore, not store: the Postgres half kept the name until the spinoff slice
    # arrived with an on-disk story loader that wanted it more. This file went on
    # importing `store` for a while afterwards and nothing said so, because the
    # skip above fires before the fixture is ever built — an integration test with
    # nothing to integrate against reports exactly like one that passed.
    from src.canon import pgstore as store_module
    from src.canon.db import connect

    conn = connect()
    store_module.init_schema(conn, schema=TEST_SCHEMA)
    yield store_module, conn
    with conn.cursor() as cur:
        cur.execute(f'DROP SCHEMA IF EXISTS "{TEST_SCHEMA}" CASCADE')
    conn.commit()
    conn.close()


@pytest.fixture(scope="module")
def loaded(store):
    store_module, conn = store
    store_module.load_beats(read_json(IPL_BEATS), STORY, conn, schema=TEST_SCHEMA)
    return store_module, conn


def test_every_beat_survives_the_round_trip(loaded):
    store_module, conn = loaded
    rows = store_module.all_beats(conn, schema=TEST_SCHEMA)
    assert len(rows) == len(read_json(IPL_BEATS))


def test_hidden_from_survives_the_round_trip(loaded):
    """
    hidden_from is the whole product. If jsonb round-tripping drops or
    reorders it, every downstream constraint is silently wrong.
    """
    store_module, conn = loaded
    b003 = store_module.get_beat(STORY, "b003", conn, schema=TEST_SCHEMA)
    assert set(b003["hidden_from"]) == {
        "jignesh", "pankaj", "labourers", "village", "bettor_tver",
    }


def test_stored_canon_yields_the_same_character_view_as_the_source_file(loaded):
    """
    The strongest test here: querying the database must produce exactly the
    view the raw beat sheet produces. Any drift means the store is editing
    canon on the way through.
    """
    from src.canon.views import character_view_from_beats as character_view

    store_module, conn = loaded
    from_db = character_view(store_module.all_beats(conn, schema=TEST_SCHEMA), "jignesh")
    from_file = character_view(read_json(IPL_BEATS), "jignesh")

    assert [b["beat_id"] for b in from_db["knows"]] == [
        b["beat_id"] for b in from_file["knows"]
    ]
    assert [b["beat_id"] for b in from_db["blind"]] == [
        b["beat_id"] for b in from_file["blind"]
    ]
    assert from_db["gaps"] == from_file["gaps"]


def test_get_beat_returns_none_for_unknown_id(loaded):
    store_module, conn = loaded
    assert store_module.get_beat(STORY, "b999", conn, schema=TEST_SCHEMA) is None


def test_loading_twice_does_not_duplicate_canon(loaded):
    """Re-seeding is how the demo resets. It must be idempotent."""
    store_module, conn = loaded
    before = len(store_module.all_beats(conn, schema=TEST_SCHEMA))
    store_module.load_beats(read_json(IPL_BEATS), STORY, conn, schema=TEST_SCHEMA)
    assert len(store_module.all_beats(conn, schema=TEST_SCHEMA)) == before


def test_one_story_cannot_overwrite_another(loaded):
    """
    Every story in data/stories numbers its beats b001 upward, so before the key
    became (story_id, beat_id) loading a second story silently replaced the first.
    Only a real database can prove the constraint, rather than the shape of the SQL.
    """
    store_module, conn = loaded
    other = read_json(IPL_BEATS)[:3]
    store_module.load_beats(other, "other_story", conn, schema=TEST_SCHEMA)

    mine = store_module.all_beats(conn, schema=TEST_SCHEMA, story_id=STORY)
    theirs = store_module.all_beats(conn, schema=TEST_SCHEMA, story_id="other_story")

    assert len(mine) == len(read_json(IPL_BEATS))
    assert len(theirs) == 3


def test_core_canon_cannot_be_rewritten_as_a_branch(loaded):
    """
    Hard rule 1 of the store. The guard is plpgsql, so this is the only place it
    can actually be made to fire — everything offline can check is that the DDL
    was emitted.
    """
    import psycopg

    store_module, conn = loaded
    hijack = dict(read_json(IPL_BEATS)[0])
    hijack["tier"] = "branch_canon"
    hijack["pov"] = "jignesh"

    with pytest.raises(psycopg.errors.RaiseException):
        store_module.load_beats([hijack], STORY, conn, schema=TEST_SCHEMA)
    conn.rollback()

    survived = store_module.get_beat(STORY, hijack["beat_id"], conn, schema=TEST_SCHEMA)
    assert survived["tier"] == "core_canon"
