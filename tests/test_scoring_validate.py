"""
The beat-sheet validator, and the evidence run over the four committed stories.

The unit tests use the hand-authored `ipl_beats.json` fixture as the shape a
clean season has, then break it one field at a time. The last test grades the
four seasons actually in the repo — three of them fail, and that is the point of
having it: `validate_output()` was written from those failures, so the test is
the record of which ones each story still carries.
"""

import pytest

from src.util import SAMPLES
from src.scoring.validate import (alleged_as_fact, contradictory_beats, coverage,
                                  load_beats, load_story, present_but_unstated,
                                  stories, thin_characters, unknown_participants,
                                  unstated_ignorance, untraceable_beats,
                                  validate_output)

EVENT = "evt_molipur_2022"


@pytest.fixture
def beats():
    return load_beats(SAMPLES / "ipl_beats.json")


@pytest.fixture
def dossier(beats):
    """A dossier just complete enough to grade the fixture against."""
    cast = sorted({who for b in beats
                   for f in ("present", "witnessed_by", "hidden_from")
                   for who in b.get(f, [])})
    return {
        "event_id": EVENT,
        "cast": [{"char_id": c} for c in cast],
        "timeline": [{"id": f"t{i}", "what_happened": "a fact",
                      "confidence": "reported"} for i in range(1, 9)],
    }


def test_the_hand_authored_season_is_clean(dossier, beats):
    """The fixture is the standard the generated seasons are held to."""
    fatal, _advisory = validate_output(dossier, beats)

    assert fatal == []


def test_an_episode_number_is_not_a_source(dossier, beats):
    beats[0]["source_ref"] = "ep04"

    problems = untraceable_beats(dossier, beats)
    assert len(problems) == 1
    assert "'ep04'" in problems[0]


def test_invented_is_not_the_word(dossier, beats):
    """'invented' means the right thing and still breaks every downstream query."""
    for beat in beats:
        beat["source_ref"] = "invented"

    problems = untraceable_beats(dossier, beats)
    assert len(problems) == 1, "one mistake, not twenty-two"
    assert "fictionalized" in problems[0]


def test_a_bare_timeline_id_is_named_as_the_near_miss(dossier, beats):
    beats[0]["source_ref"] = "t3"

    assert f"'{EVENT}#t3'" in untraceable_beats(dossier, beats)[0]


def test_many_wrong_formats_collapse_to_one_line(dossier, beats):
    for i, beat in enumerate(beats):
        beat["source_ref"] = f"season.ep{i}.turn"

    problems = untraceable_beats(dossier, beats)
    assert len(problems) == 1
    assert "different source_ref formats" in problems[0]


def test_a_place_in_a_beat_is_not_a_character(dossier, beats):
    beats[0]["present"].append("the tea shop bench")

    problems = unknown_participants(dossier, beats)
    assert len(problems) == 1
    assert "the tea shop bench" in problems[0]
    assert "cast char_id" in problems[0]


def test_a_crowd_hidden_from_a_beat_is_not_a_character(dossier, beats):
    beats[0]["hidden_from"].append("two hundred candidates")

    assert unknown_participants(dossier, beats)


def test_witnessing_and_being_blind_to_one_beat_is_a_contradiction(beats):
    beats[0]["hidden_from"].append(beats[0]["witnessed_by"][0])

    assert "cannot both hold" in contradictory_beats(beats)[0]


def test_an_empty_hidden_from_reports_how_much_of_the_cast_was_absent(dossier, beats):
    beats[0]["hidden_from"] = []

    problems = unstated_ignorance(dossier, beats)
    assert len(problems) == 1
    assert "nobody's ignorance" in problems[0]


def test_an_empty_hidden_from_does_not_block_the_write(dossier, beats):
    """A finale where the whole cast is in the square hides nothing from anyone.
    Advisory, so a real authorial choice is not made unwritable."""
    beats[0]["hidden_from"] = []

    fatal, advisory = validate_output(dossier, beats)
    assert fatal == []
    assert any("nobody's ignorance" in p for p in advisory)


def test_standing_in_a_scene_without_knowing_it_is_reported(dossier, beats):
    beats[0]["witnessed_by"] = []

    assert "no stated knowledge" in present_but_unstated(beats)[0]


def test_coverage_counts_knows_blind_and_unstated(dossier, beats):
    rows = dict((c, (k, b, u)) for c, k, b, u in coverage(dossier, beats))

    knows, blind, unstated = rows["jignesh"]
    assert (knows, blind, unstated) == (4, 18, 0), "DELIVERY_PLAN §0: 4 known, 18 blind"
    assert all(k + b + u == len(beats) for k, b, u in rows.values())


def test_a_character_the_canon_never_places_is_reported(dossier, beats):
    dossier["cast"].append({"char_id": "lokanath"})

    assert "no beat at all" in thin_characters(dossier, beats)[0]


def test_a_dossier_claim_tagged_alleged_is_pointed_at(dossier, beats):
    dossier["timeline"][2]["confidence"] = "alleged"

    problems = alleged_as_fact(dossier, beats)
    assert problems and "hard rule 3" in problems[0]


def test_an_empty_beat_sheet_is_fatal(dossier):
    fatal, _advisory = validate_output(dossier, [])

    assert any("no canon to query" in p for p in fatal)


# ----------------------------------------------------------------------------
# The evidence: the four seasons as committed.
# ----------------------------------------------------------------------------

# What each committed story violates today, measured. When a story is fixed,
# this table is the reminder to move it — a green run against stale expectations
# is worth nothing.
#
# story3 moved here after its 58 `invented` source_refs were replaced with the
# literal `fictionalized` the contract names. That substitution under-claims:
# a beat genuinely derived from a timeline entry loses the ability to say so,
# but no beat gains provenance it does not have. story3 therefore has zero
# sourced beats, which is honest and also why story1 — 39 fictionalized against
# 7 sourced — remains the stronger season for the traceability claim.
COMMITTED = {
    "story1_denied_identity": (),
    "story2_long_deception": ("source_ref", "participant"),
    "story3_revenge": (),
    "story4_family_betrayal": ("source_ref", "participant"),
}


@pytest.mark.parametrize("name", sorted(COMMITTED))
def test_the_committed_stories_violate_what_we_measured(name):
    dossier, beats = load_story(next(d for d in stories() if d.name == name))
    fatal, _advisory = validate_output(dossier, beats)
    blob = " ".join(fatal)

    for expected in COMMITTED[name]:
        assert expected in blob, f"{name} no longer fails on {expected} — update COMMITTED"
    if not COMMITTED[name]:
        assert fatal == [], f"{name} was clean and is not any more: {fatal}"
