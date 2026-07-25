"""
Publishing is the last gate before listeners, and the only one an editor cannot
argue with. A season with fatal continuity problems does not go out — the
guarantee is the product, and one that can be waived under deadline is not one.

Advisories are a different thing: only someone reading the prose can settle
them, so they are reported and do not block.
"""

import json

import pytest

from src import publish as pub


DOSSIER = {
    "event_id": "evt_test_1999",
    "title": "The Test Season",
    "cast": [{"char_id": "asha", "name": "Asha"}, {"char_id": "vikram", "name": "Vikram"}],
    "people": [],
    "fictionalization_map": {},
    "timeline": [{"id": "t1", "what_happened": "a thing", "confidence": "reported"}],
    "season": [{"ep": 1, "turn": "t", "ends_on": "e", "hook_type": "REVEAL", "status": 3}],
}


def beat(bid, source_ref="fictionalized", present=("asha",), hidden=("vikram",)):
    return {
        "beat_id": bid, "ep": 1, "seq": int(bid[-1]), "world_time": "1999",
        "location": "a room", "present": list(present),
        "witnessed_by": list(present), "hidden_from": list(hidden),
        "what_happened": "something", "state_changes": [],
        "source_ref": source_ref, "tier": "core_canon", "note": None,
    }


@pytest.fixture
def story(tmp_path, monkeypatch):
    """A season on disk, with the module pointed at it."""
    monkeypatch.setattr(pub, "STORIES", tmp_path)

    def build(beats, story_id="s1"):
        d = tmp_path / story_id
        d.mkdir(parents=True, exist_ok=True)
        (d / "dossier.json").write_text(json.dumps(DOSSIER), encoding="utf-8")
        (d / "beats.json").write_text(
            json.dumps({"story_id": story_id, "beats": beats}), encoding="utf-8"
        )
        return story_id

    return build


def test_a_clean_season_goes_live(story):
    sid = story([beat("b001"), beat("b002")])
    state = pub.publish(sid, by="priya")

    assert state["state"] == "live"
    assert state["by"] == "priya"
    assert pub.read_state(sid)["state"] == "live"


def test_a_season_with_a_broken_source_ref_is_refused(story):
    # `invented` is not the literal the contract mandates, so nothing downstream
    # can tell this beat from unmarked invention.
    sid = story([beat("b001"), beat("b002", source_ref="invented")])

    with pytest.raises(RuntimeError, match="cannot be published"):
        pub.publish(sid, by="priya")
    assert pub.read_state(sid) is None


def test_a_season_naming_someone_outside_the_cast_is_refused(story):
    # `character_view()` filters on char_id, so a place in these arrays becomes a
    # promotable character with its own knows and blind lists.
    sid = story([beat("b001", present=("asha", "the tea shop bench"))])

    with pytest.raises(RuntimeError, match="cannot be published"):
        pub.publish(sid, by="priya")


def test_refusing_says_what_is_wrong_not_just_that_it_failed(story):
    sid = story([beat("b001", source_ref="ep01")])
    with pytest.raises(RuntimeError) as exc:
        pub.publish(sid)
    # The editor cannot fix what the message does not name.
    assert "source_ref" in str(exc.value) or "ep01" in str(exc.value)


def test_advisories_are_recorded_but_do_not_block(story):
    # Nobody's ignorance asserted — legitimate on a public finale beat, so it
    # warns rather than refusing.
    b = beat("b001")
    b["hidden_from"] = []
    sid = story([b])

    state = pub.publish(sid, by="devika")
    assert state["state"] == "live"
    assert isinstance(state["advisory_at_publish"], list)


def test_publishing_is_recorded_against_a_person(story):
    sid = story([beat("b001")])
    pub.publish(sid, by="arjun")
    assert pub.read_state(sid)["by"] == "arjun"
    assert pub.read_state(sid)["at"]


def test_unpublishing_needs_no_permission(story):
    """Shipping is gated. Pulling something back never is."""
    sid = story([beat("b001")])
    pub.publish(sid)
    pub.unpublish(sid)
    assert pub.read_state(sid) is None


def test_a_missing_season_says_so(story, tmp_path):
    with pytest.raises(RuntimeError, match="no season"):
        pub.publish("does_not_exist")


def test_check_reports_without_publishing(story):
    sid = story([beat("b001")])
    fatal, advisory = pub.check(sid)
    assert fatal == []
    assert pub.read_state(sid) is None
