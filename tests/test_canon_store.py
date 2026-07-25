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
    from src.canon import store as store_module
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
    store_module.load_beats(read_json(IPL_BEATS), conn, schema=TEST_SCHEMA)
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
    b003 = store_module.get_beat("b003", conn, schema=TEST_SCHEMA)
    assert set(b003["hidden_from"]) == {
        "jignesh", "pankaj", "labourers", "village", "bettor_tver",
    }


def test_stored_canon_yields_the_same_character_view_as_the_source_file(loaded):
    """
    The strongest test here: querying the database must produce exactly the
    view the raw beat sheet produces. Any drift means the store is editing
    canon on the way through.
    """
    from src.canon.views import character_view

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
    assert store_module.get_beat("b999", conn, schema=TEST_SCHEMA) is None


def test_loading_twice_does_not_duplicate_canon(loaded):
    """Re-seeding is how the demo resets. It must be idempotent."""
    store_module, conn = loaded
    before = len(store_module.all_beats(conn, schema=TEST_SCHEMA))
    store_module.load_beats(read_json(IPL_BEATS), conn, schema=TEST_SCHEMA)
    assert len(store_module.all_beats(conn, schema=TEST_SCHEMA)) == before
