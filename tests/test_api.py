"""
The HTTP surface.

The beat source is overridden with the sample beat sheet so these run
offline. That is a data substitution, not a mock of the thing under test -
the routes, ordering and serialization exercised here are the real ones.
"""

import pytest
from fastapi.testclient import TestClient

from src.api.main import app, beat_source
from src.util import IPL_BEATS, read_json


@pytest.fixture
def client():
    app.dependency_overrides[beat_source] = lambda: read_json(IPL_BEATS)
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_beats_endpoint_returns_canon_in_episode_order(client):
    body = client.get("/api/beats").json()
    order = [(b["ep"], b["seq"]) for b in body]
    assert order == sorted(order)
    assert len(body) == 22


def test_single_beat_endpoint_returns_the_crossing_point(client):
    """b014 is the demo's split-screen beat. It must be addressable."""
    b014 = client.get("/api/beats/b014").json()
    assert b014["beat_id"] == "b014"
    assert "hits a clean six" in b014["what_happened"]
    assert set(b014["hidden_from"]) == {"village", "bettor_tver"}


def test_unknown_beat_returns_404(client):
    assert client.get("/api/beats/b999").status_code == 404


def test_character_view_endpoint_serves_the_three_lists(client):
    view = client.get("/api/characters/jignesh/view").json()
    assert {b["beat_id"] for b in view["knows"]} == {"b004", "b009", "b014", "b022"}
    assert len(view["blind"]) == 18
    assert len(view["gaps"]) == 4


def test_character_view_never_leaks_a_blind_beat_into_knows(client):
    """
    Hard rule 1, enforced at the HTTP boundary. If these ever intersect the
    spinoff prompt would be handed a contradiction.
    """
    view = client.get("/api/characters/jignesh/view").json()
    assert not ({b["beat_id"] for b in view["knows"]}
                & {b["beat_id"] for b in view["blind"]})


def test_unknown_api_route_returns_json_404_not_the_frontend(client):
    """
    The static mount is a catch-all. If it shadows /api, a typo'd endpoint
    silently returns HTML and the frontend fails somewhere far away.
    """
    resp = client.get("/api/does-not-exist")
    assert resp.status_code == 404
    assert resp.headers["content-type"].startswith("application/json")


def test_health_reports_without_requiring_a_database(client):
    """Health must answer even when Lakebase is unreachable, or a crashed
    app looks identical to a missing one."""
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert "database" in resp.json()
