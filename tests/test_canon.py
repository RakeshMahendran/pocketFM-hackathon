"""
The guarantees the spinoff rests on.

Every one of these is a rule that has already been written down wrong somewhere in
this repo. `docs/SPINOFF.md:13` and `.claude/commands/spine.md` both define `knows`
as `present + witnessed_by`, which would let a character know a beat they stood next
to and did not take in. `HANDOFF.md` reports `blind` as the length of `hidden_from`,
which under-counts it by every beat nobody thought to list. Both readings look
reasonable and both quietly disarm the product.
"""

import pytest

from src.canon import store, views


def _beat(bid, ep, seq, present=(), witnessed=(), hidden=(), changes=(), what="a thing happens"):
    return {"beat_id": bid, "ep": ep, "seq": seq, "world_time": f"D{ep:02d}",
            "location": "somewhere", "present": list(present),
            "witnessed_by": list(witnessed), "hidden_from": list(hidden),
            "what_happened": what, "state_changes": list(changes),
            "source_ref": "fictionalized", "tier": "core_canon"}


def _story(beats, cast=("ana", "ben", "cy"), story_id="t"):
    roster = [{"char_id": c, "name": c.capitalize(), "role": f"{c} the role",
               "want": "something"} for c in cast]
    ordered = sorted(beats, key=lambda b: (b["ep"], b["seq"]))
    return {"story_id": story_id, "path": None, "event_id": "evt_t",
            "dossier": {"cast": roster, "title": "T"}, "beats": ordered,
            "cast": roster, "cast_index": {c["char_id"]: c for c in roster},
            "beat_index": {b["beat_id"]: b for b in ordered}}


# ---------------------------------------------------------------------------
# knows / blind
# ---------------------------------------------------------------------------

def test_a_character_knows_only_the_beats_they_witnessed():
    s = _story([_beat("b1", 1, 1, present=["ana"], witnessed=["ana"]),
                _beat("b2", 1, 2, present=["ben"], witnessed=["ben"], hidden=["ana"])])

    assert [b["beat_id"] for b in views.knows(s, "ana")] == ["b1"]


def test_blind_is_every_beat_the_character_did_not_witness():
    """
    The beat nobody classified. b2 lists ana nowhere — not present, not witnessing,
    not hidden_from. She must still be blind to it, because the alternative is a
    character with permission to know something nobody decided they knew.
    """
    s = _story([_beat("b1", 1, 1, witnessed=["ana"]),
                _beat("b2", 1, 2, present=["ben"], witnessed=["ben"])])

    assert [b["beat_id"] for b in views.blind(s, "ana")] == ["b2"]


def test_being_present_without_witnessing_is_not_knowing():
    """b014-shaped: in the room, did not register. The delivered data does this
    deliberately and it is the distinction the whole spinoff sells."""
    s = _story([_beat("b1", 1, 1, present=["ana", "ben"], witnessed=["ben"])])

    assert views.knows(s, "ana") == []
    assert [b["beat_id"] for b in views.blind(s, "ana")] == ["b1"]
    assert [b["beat_id"] for b in views.present_not_witnessed(s, "ana")] == ["b1"]


def test_hidden_from_is_emphasis_and_never_shrinks_the_blind_list():
    """`hidden_from` is non-exhaustive in the delivered data — story1's kempanna is
    unlisted on 36 of 46 beats — so it may sharpen a prohibition, never shorten one."""
    s = _story([_beat("b1", 1, 1, witnessed=["ben"], hidden=["ana"]),
                _beat("b2", 1, 2, witnessed=["ben"])])

    assert [b["beat_id"] for b in views.explicitly_hidden(s, "ana")] == ["b1"]
    assert [b["beat_id"] for b in views.blind(s, "ana")] == ["b1", "b2"]


def test_the_allowed_and_forbidden_lists_partition_the_season():
    s = _story([_beat("b1", 1, 1, witnessed=["ana"]),
                _beat("b2", 1, 2, witnessed=["ben"]),
                _beat("b3", 2, 1, present=["ana"], witnessed=["ben"])])
    payload = views.forbidden_facts(s, "ana")

    assert len(payload["allowed_ids"]) + len(payload["forbidden_ids"]) == 3
    assert not set(payload["allowed_ids"]) & set(payload["forbidden_ids"])


# ---------------------------------------------------------------------------
# gaps
# ---------------------------------------------------------------------------

def test_gaps_are_runs_of_consecutive_beats_the_character_is_absent_from():
    s = _story([_beat("b1", 1, 1, witnessed=["ana"]),
                _beat("b2", 1, 2, witnessed=["ben"]),
                _beat("b3", 2, 1, witnessed=["ben"]),
                _beat("b4", 2, 2, witnessed=["ana"])])
    runs = views.gaps(s, "ana")

    assert len(runs) == 1
    assert runs[0]["beat_ids"] == ["b2", "b3"]
    assert (runs[0]["after_beat"], runs[0]["before_beat"]) == ("b1", "b4")


def test_a_gap_that_opens_the_season_is_reported():
    """The off-by-one nobody writes a test for. Where the character was before they
    first appear is the most writable space they have."""
    s = _story([_beat("b1", 1, 1, witnessed=["ben"]),
                _beat("b2", 1, 2, witnessed=["ana"])])
    runs = views.gaps(s, "ana")

    assert runs[0]["beat_ids"] == ["b1"]
    assert runs[0]["after_beat"] is None


# ---------------------------------------------------------------------------
# anchors
# ---------------------------------------------------------------------------

def test_an_anchor_the_character_did_not_witness_is_labelled_offscreen():
    """
    story1's b032 is ratnamma's largest moment at +5 and she is in its `hidden_from`.
    Filtering it away loses the best episode in the season; handing it over unlabelled
    tells the writer to dramatise a beat the same brief forbids.
    """
    s = _story([_beat("b1", 1, 1, witnessed=["ben"],
                      changes=[{"entity": "ana", "fact": "recognised", "valence": 5}]),
                _beat("b2", 1, 2, present=["ana"], witnessed=["ana"],
                      changes=[{"entity": "ana", "fact": "admitted", "valence": 4}])])
    got = views.anchors(s, "ana")

    assert [(a["beat_id"], a["kind"]) for a in got] == [("b1", "offscreen"), ("b2", "witnessed")]


def test_a_witnessed_anchor_outranks_an_offscreen_one_of_the_same_size():
    s = _story([_beat("b1", 1, 1, witnessed=["ben"],
                      changes=[{"entity": "ana", "fact": "x", "valence": 4}]),
                _beat("b2", 1, 2, witnessed=["ana"],
                      changes=[{"entity": "ana", "fact": "y", "valence": -4}])])

    assert [a["beat_id"] for a in views.anchors(s, "ana")] == ["b2", "b1"]


def test_an_anchor_is_ranked_by_the_size_of_the_change_not_its_direction():
    s = _story([_beat("b1", 1, 1, witnessed=["ana"],
                      changes=[{"entity": "ana", "fact": "small", "valence": 2}]),
                _beat("b2", 1, 2, witnessed=["ana"],
                      changes=[{"entity": "ana", "fact": "ruin", "valence": -5}])])

    assert [a["beat_id"] for a in views.anchors(s, "ana")] == ["b2", "b1"]


def test_a_possessive_entity_still_belongs_to_its_character():
    """story1's b031 records the change against "ratnamma's marriage", not "ratnamma"."""
    s = _story([_beat("b1", 1, 1, witnessed=["ben"],
                      changes=[{"entity": "ana's marriage", "fact": "recorded", "valence": 4}])])

    assert [a["beat_id"] for a in views.anchors(s, "ana")] == ["b1"]


def test_a_crowd_scene_is_not_offered_as_an_anchor():
    """story1's b044 is legal for ratnamma but resolves nine threads in front of
    thirteen people. Legal is not the same as writable from one point of view."""
    crowd = [f"x{i}" for i in range(9)] + ["ana"]
    s = _story([_beat("b1", 1, 1, present=crowd, witnessed=crowd,
                      changes=[{"entity": "ana", "fact": "big", "valence": 5}]),
                _beat("b2", 1, 2, present=["ana"], witnessed=["ana"],
                      changes=[{"entity": "ana", "fact": "small", "valence": 1}])])

    assert [a["beat_id"] for a in views.anchors(s, "ana")] == ["b2"]


def test_only_witnessed_beats_can_cross_into_the_spinoff():
    s = _story([_beat("b1", 1, 1, witnessed=["ana"]),
                _beat("b2", 1, 2, witnessed=["ben"])])
    anchor = {"beat_id": "b1", "ep": 1, "kind": "witnessed"}

    assert [c["beat_id"] for c in views.crossing_points(s, "ana", anchor)] == ["b1"]


def test_an_offscreen_anchor_has_no_crossing_points():
    """The episode is written beside that beat, not on it — there is nothing to match."""
    s = _story([_beat("b1", 1, 1, witnessed=["ana"])])

    assert views.crossing_points(s, "ana", {"beat_id": "b9", "ep": 1, "kind": "offscreen"}) == []


# ---------------------------------------------------------------------------
# the roster
# ---------------------------------------------------------------------------

def test_the_promotable_rule_needs_three_beats_and_more_exclusions_than_appearances():
    beats = [_beat(f"b{i}", 1, i, witnessed=["ana"]) for i in range(1, 6)]
    beats += [_beat(f"c{i}", 2, i, witnessed=["ben"]) for i in range(1, 3)]
    #  ana witnesses 5 of 7 — excluded from fewer than she appears in, so no.
    #  ben witnesses 2 of 7 — enough exclusions, but under the three-beat floor.
    rows = {r["char_id"]: r for r in views.promotable(_story(beats))}

    assert rows["ana"]["promotable"] is False
    assert rows["ben"]["promotable"] is False
    assert rows["cy"]["promotable"] is False


def test_the_whole_cast_is_returned_not_only_the_promotable_ones():
    """The roster screen needs the mainline lead visible and greyed, because the
    contrast between 43-of-46 and 11-of-46 is the entire idea."""
    s = _story([_beat("b1", 1, 1, witnessed=["ana"])])

    assert {r["char_id"] for r in views.promotable(s)} == {"ana", "ben", "cy"}


# ---------------------------------------------------------------------------
# store
# ---------------------------------------------------------------------------

def test_a_duplicate_beat_id_is_refused(tmp_path):
    """
    Set membership is the guarantee. Two beats sharing an id makes one of them
    invisible to `forbidden_facts`, and the check then passes something it never saw.
    """
    import json
    d = tmp_path / "dup"
    (d / "episodes").mkdir(parents=True)
    (d / "dossier.json").write_text(json.dumps({"event_id": "e", "cast": []}))
    (d / "beats.json").write_text(json.dumps(
        {"beats": [_beat("b1", 1, 1), _beat("b1", 1, 2)]}))

    with pytest.raises(RuntimeError, match="duplicate beat_id"):
        store.load_story("dup", root=tmp_path)


def test_a_directory_without_a_dossier_is_not_a_story(tmp_path):
    (tmp_path / "real" / "episodes").mkdir(parents=True)
    (tmp_path / "real" / "dossier.json").write_text("{}")
    (tmp_path / "real" / "beats.json").write_text("[]")
    (tmp_path / "scratch").mkdir()

    assert store.story_ids(root=tmp_path) == ["real"]


def test_beats_are_ordered_by_episode_then_sequence_whatever_the_file_says(tmp_path):
    """`world_time` cannot order them — it is a different unparseable scheme in each
    of the four delivered stories, down to the literal string "same, minutes later"."""
    import json
    d = tmp_path / "s"
    d.mkdir()
    (d / "dossier.json").write_text(json.dumps({"event_id": "e", "cast": []}))
    (d / "beats.json").write_text(json.dumps({"beats": [
        _beat("b3", 2, 1), _beat("b1", 1, 1), _beat("b2", 1, 2)]}))

    got = store.load_story("s", root=tmp_path)

    assert [b["beat_id"] for b in got["beats"]] == ["b1", "b2", "b3"]


def test_an_unknown_character_names_the_cast_rather_than_raising_a_key_error():
    with pytest.raises(RuntimeError, match="no character zed"):
        store.get_char(_story([_beat("b1", 1, 1)]), "zed")
