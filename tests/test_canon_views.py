"""
Character views over the hand-authored IPL beat sheet.

These run against schemas/samples/ipl_beats.json rather than a synthetic
fixture, because that file is the canon the demo actually queries. A view
that works on invented beats and fails on the real season is worthless.
"""

import pytest

from src.util import IPL_BEATS, read_json
from src.canon.views import character_view_from_beats as character_view
from src.canon.views import knows, blind


@pytest.fixture(scope="module")
def beats():
    return read_json(IPL_BEATS)


# Jignesh is the demo's spinoff protagonist. His three lists are Gate 1.
JIGNESH_KNOWS = {"b004", "b009", "b014", "b022"}
JIGNESH_BLIND = {
    "b001", "b002", "b003", "b005", "b006", "b007", "b008", "b010",
    "b011", "b012", "b013", "b015", "b016", "b017", "b018", "b019",
    "b020", "b021",
}


def test_knows_returns_beats_the_character_was_present_at_or_witnessed(beats):
    assert {b["beat_id"] for b in knows(beats, "jignesh")} == JIGNESH_KNOWS


def test_blind_returns_beats_the_character_is_excluded_from(beats):
    assert {b["beat_id"] for b in blind(beats, "jignesh")} == JIGNESH_BLIND


def test_knows_and_blind_never_overlap(beats):
    """
    The product claim rests on this. A beat in both lists means the
    constraint set would both assert and prohibit the same fact.
    """
    for char in ("jignesh", "rafiq", "bhavlo", "pankaj"):
        k = {b["beat_id"] for b in knows(beats, char)}
        b = {b["beat_id"] for b in blind(beats, char)}
        assert k & b == set(), f"{char} has beats in both knows and blind"


def test_witnessing_without_being_present_still_counts_as_knowing(beats):
    """
    b008: Rafiq and Pankaj position cameras. Bhavlo is not present but is
    listed as a witness, so he knows it happened.
    """
    b008 = next(b for b in beats if b["beat_id"] == "b008")
    assert "bhavlo" not in b008["present"]
    assert "bhavlo" in b008["witnessed_by"]
    assert "b008" in {b["beat_id"] for b in knows(beats, "bhavlo")}


def test_unwitnessed_beat_is_in_nobody_knows(beats):
    """
    b018 has empty present and witnessed_by - deliberately open canon.
    No character may claim it.
    """
    all_chars = {"jignesh", "rafiq", "bhavlo", "pankaj", "police", "constable"}
    for char in all_chars:
        assert "b018" not in {b["beat_id"] for b in knows(beats, char)}


def test_gaps_are_runs_of_consecutive_beats_the_character_is_absent_from(beats):
    """
    Gaps are computed over (ep, seq) ordering, not world_time arithmetic -
    world_time is partial ISO 8601 and does not subtract reliably.
    """
    windows = [(g["start"], g["end"])
               for g in character_view(beats, "jignesh")["gaps"]]
    assert windows == [
        ("b001", "b003"),
        ("b005", "b008"),
        ("b010", "b013"),
        ("b015", "b021"),
    ]


def test_largest_gap_is_the_rain_days(beats):
    """
    b017's note calls the rain days Jignesh's largest gap. The data must
    agree with the note, or the note is a lie the writers will believe.
    """
    largest = max(character_view(beats, "jignesh")["gaps"],
                  key=lambda g: g["length"])
    assert (largest["start"], largest["end"]) == ("b015", "b021")
    assert largest["length"] == 7


def test_a_character_absent_from_canon_is_blind_to_all_of_it(beats):
    """
    Changed deliberately, and it is the merge's one behavioural change.

    `blind` used to mean "listed in hidden_from", which made a stranger to the
    season blind to nothing at all. It now means "did not witness it", so a
    stranger is blind to everything.

    The old reading passes on this fixture because its hidden_from lists happen to
    be complete. On the delivered stories they are not: kempanna is listed in
    neither array on 36 of 46 beats, so those 36 fell out of the prohibition set
    entirely and the writer was free to use them.
    """
    view = character_view(beats, "nobody_at_all")
    assert view["knows"] == []
    assert len(view["blind"]) == len(beats)


def test_character_view_bundles_the_three_lists(beats):
    view = character_view(beats, "jignesh")
    assert {b["beat_id"] for b in view["knows"]} == JIGNESH_KNOWS
    assert {b["beat_id"] for b in view["blind"]} == JIGNESH_BLIND
    assert len(view["gaps"]) == 4
    assert view["char_id"] == "jignesh"


def test_beats_come_back_in_episode_and_sequence_order(beats):
    """
    Constraint lines are injected into prompts in order. Out-of-order canon
    reads as a story told backwards.
    """
    k = knows(beats, "jignesh")
    order = [(b["ep"], b["seq"]) for b in k]
    assert order == sorted(order)
