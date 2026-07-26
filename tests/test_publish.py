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


# ---------------------------------------------------------------------------
# Per-episode release.
#
# The show going live means it exists at all; an episode going out is the thing
# that earns. Both decisions can be got wrong in ways a listener feels: a season
# that breaks after launch and keeps shipping, or a serial with episode 7 out
# and episode 3 held.
# ---------------------------------------------------------------------------


@pytest.fixture
def serial(story, tmp_path):
    """A season with episodes written to disk, so there is something to release."""
    def build(beats, episodes=3, story_id="s1"):
        sid = story(beats, story_id)
        d = tmp_path / sid / "episodes"
        d.mkdir(parents=True, exist_ok=True)
        for n in range(1, episodes + 1):
            (d / f"ep{n:02d}.md").write_text(f"# Episode {n}\n", encoding="utf-8")
        return sid

    return build


def rewrite_beats(sid, beats):
    """Edit the beat sheet after the fact, the way an editor with a text editor does."""
    (pub.STORIES / sid / "beats.json").write_text(
        json.dumps({"story_id": sid, "beats": beats}), encoding="utf-8"
    )


def rewrite_episodes(sid, episodes):
    """Hand-punch the episodes map, the way nothing in this module ever would."""
    path = pub.state_path(sid)
    state = json.loads(path.read_text(encoding="utf-8"))
    state["episodes"] = episodes
    path.write_text(json.dumps(state), encoding="utf-8")


def test_a_season_broken_after_launch_refuses_its_next_episode(serial):
    """
    The gate that matters. Episodes go out days apart and the beat sheet is
    editable in between, so a check that only ran when the show went live would
    be a gate on the first episode and on nothing else — the season a listener
    is halfway through could break and keep shipping.
    """
    sid = serial([beat("b001"), beat("b002")])
    pub.publish(sid, by="priya")
    pub.publish_episode(sid, 1, by="priya")

    # `invented` is not the literal the contract mandates: from here on nothing
    # downstream can tell b002 from unmarked invention.
    rewrite_beats(sid, [beat("b001"), beat("b002", source_ref="invented")])

    with pytest.raises(RuntimeError, match="cannot go out"):
        pub.publish_episode(sid, 2, by="priya")

    state = pub.read_state(sid)
    assert sorted(pub.released(state)) == [1]
    assert pub.released_through(state) == 1


def test_refusing_an_episode_says_what_is_wrong_with_the_season(serial):
    """The editor is holding a release date; the message has to name the fix."""
    sid = serial([beat("b001")])
    pub.publish(sid, by="priya")
    pub.publish_episode(sid, 1, by="priya")
    rewrite_beats(sid, [beat("b001", present=("asha", "the tea shop bench"))])

    with pytest.raises(RuntimeError) as exc:
        pub.publish_episode(sid, 2, by="priya")
    assert "tea shop bench" in str(exc.value)


def test_an_episode_cannot_jump_the_one_before_it(serial):
    """A serial with episode 2 out and episode 1 held is not a thing to listen to."""
    sid = serial([beat("b001")])
    pub.publish(sid, by="priya")

    with pytest.raises(RuntimeError, match="not out yet"):
        pub.publish_episode(sid, 2, by="priya")
    assert pub.released(pub.read_state(sid)) == {}


def test_pulling_an_episode_takes_everything_after_it(serial):
    """
    Pulling episode 2 of three that are out would otherwise leave episode 3
    stranded behind a hole no listener can get past.
    """
    sid = serial([beat("b001")])
    pub.publish(sid, by="priya")
    for n in (1, 2, 3):
        pub.publish_episode(sid, n, by="priya")

    state = pub.unpublish_episode(sid, 2)

    assert sorted(pub.released(state)) == [1]
    assert pub.released_through(pub.read_state(sid)) == 1


def test_a_pulled_episode_can_go_back_out_in_order(serial):
    """Pulling is a hold, not a deletion — the season has to be able to resume."""
    sid = serial([beat("b001")])
    pub.publish(sid, by="priya")
    for n in (1, 2, 3):
        pub.publish_episode(sid, n, by="priya")
    pub.unpublish_episode(sid, 2)

    pub.publish_episode(sid, 2, by="devika")
    pub.publish_episode(sid, 3, by="devika")
    assert pub.released_through(pub.read_state(sid)) == 3


def test_re_publishing_keeps_the_episodes_already_out(serial):
    """
    Standing behind the season a second time is not a reason to take back what
    listeners already paid to unlock.
    """
    sid = serial([beat("b001")])
    pub.publish(sid, by="priya")
    pub.publish_episode(sid, 1, by="priya")
    pub.publish_episode(sid, 2, by="priya")

    state = pub.publish(sid, by="devika")

    assert sorted(pub.released(state)) == [1, 2]
    assert pub.released_through(state) == 2
    assert state["by"] == "devika"


def test_an_episode_cannot_go_out_before_the_show_is_live(serial):
    """
    The season gate is the only gate. Releasing an episode of a show nobody
    published would route around it entirely.
    """
    sid = serial([beat("b001")])

    with pytest.raises(RuntimeError, match="not live"):
        pub.publish_episode(sid, 1, by="priya")
    assert pub.read_state(sid) is None


def test_there_is_no_episode_zero(serial):
    """Episode numbers are what a listener taps; off-by-one here is a dead link."""
    sid = serial([beat("b001")])
    pub.publish(sid, by="priya")

    with pytest.raises(RuntimeError, match="no episode 0"):
        pub.publish_episode(sid, 0, by="priya")
    assert pub.released(pub.read_state(sid)) == {}


def test_an_episode_nobody_wrote_cannot_be_released(serial):
    """Releasing past the end of the season would sell an unlock for nothing."""
    sid = serial([beat("b001")], episodes=3)
    pub.publish(sid, by="priya")

    with pytest.raises(RuntimeError, match="no episode 99"):
        pub.publish_episode(sid, 99, by="priya")


def test_a_season_with_nothing_written_releases_nothing(story):
    """A live show with no episode files is pre-launch, not broken — but empty."""
    sid = story([beat("b001")])
    pub.publish(sid, by="priya")

    assert pub.episode_count(sid) == 0
    with pytest.raises(RuntimeError, match="no written episodes"):
        pub.publish_episode(sid, 1, by="priya")


def test_releasing_the_same_episode_twice_changes_nothing(serial):
    """
    A double click on the release button must not rewrite who released it or
    when — that record is the only thing saying a person stood behind it.
    """
    sid = serial([beat("b001")])
    pub.publish(sid, by="priya")
    first = pub.publish_episode(sid, 1, by="priya")
    stamp = pub.released(first)[1]["at"]

    again = pub.publish_episode(sid, 1, by="devika")

    out = pub.released(again)
    assert sorted(out) == [1]
    assert out[1]["by"] == "priya"
    assert out[1]["at"] == stamp


def test_a_state_file_with_no_episodes_key_reads_as_none_out(serial):
    """
    Seasons published before per-episode release exist on disk. They read as a
    live show with nothing out, which is true, rather than crashing the console.
    """
    sid = serial([beat("b001")])
    pub.publish(sid, by="priya")
    path = pub.state_path(sid)
    state = json.loads(path.read_text(encoding="utf-8"))
    del state["episodes"]
    path.write_text(json.dumps(state), encoding="utf-8")

    assert pub.released(pub.read_state(sid)) == {}
    assert pub.released_through(pub.read_state(sid)) == 0

    pub.publish_episode(sid, 1, by="priya")
    assert pub.released_through(pub.read_state(sid)) == 1


def test_one_unreadable_key_does_not_lose_the_releases_around_it(serial):
    """
    The state file is the record of decisions people made. Losing all of them to
    one bad hand edit is worse than ignoring the bad one.
    """
    sid = serial([beat("b001")])
    pub.publish(sid, by="priya")
    rewrite_episodes(sid, {
        "1": {"by": "priya", "at": "1999-01-01T00:00:00+00:00"},
        "later": {"by": "someone", "at": "whenever"},
        "2": {"by": "priya", "at": "1999-01-02T00:00:00+00:00"},
    })

    out = pub.released(pub.read_state(sid))
    assert sorted(out) == [1, 2]
    assert out[1]["by"] == "priya"
    assert pub.released_through(pub.read_state(sid)) == 2


def test_a_hole_reads_as_released_up_to_the_hole(serial):
    """
    Counting records rather than the unbroken run would offer an episode the
    listener cannot reach, because episode 2 is not there to get past.
    """
    sid = serial([beat("b001")])
    pub.publish(sid, by="priya")
    rewrite_episodes(sid, {
        "1": {"by": "priya", "at": "1999-01-01T00:00:00+00:00"},
        "3": {"by": "priya", "at": "1999-01-03T00:00:00+00:00"},
    })

    state = pub.read_state(sid)
    assert sorted(pub.released(state)) == [1, 3]
    assert pub.released_through(state) == 1


def test_episode_count_counts_only_written_episodes(serial, tmp_path):
    """
    This number is the ceiling on what can be released. Counting a stray note or
    a directory as an episode would let a release point at nothing.
    """
    sid = serial([beat("b001")], episodes=3)
    d = tmp_path / sid / "episodes"
    (d / "notes.md").write_text("scratch", encoding="utf-8")
    (d / "ep4.txt").write_text("wrong extension", encoding="utf-8")
    (d / "ep05.md").mkdir()

    assert pub.episode_count(sid) == 3
    assert pub.episode_count("does_not_exist") == 0


def test_unpublishing_the_show_takes_the_episodes_with_it(serial):
    """Back to draft means back to draft: nothing left in front of listeners."""
    sid = serial([beat("b001")])
    pub.publish(sid, by="priya")
    pub.publish_episode(sid, 1, by="priya")
    pub.publish_episode(sid, 2, by="priya")

    pub.unpublish(sid)

    assert pub.read_state(sid) is None
    assert pub.released(pub.read_state(sid)) == {}
    assert pub.released_through(pub.read_state(sid)) == 0
