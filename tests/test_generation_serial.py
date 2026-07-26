"""
The script writer is batched and stateful, and everything that can go wrong with
it goes wrong *between* calls: canon that does not carry, a ledger that
duplicates, a voice that drifts because nobody showed the model what the
character said last time.

So these test the carry, not the prose. No network, no key — the client is
injected.
"""

import json

import pytest

from src.generation import client as gen_client
from src.generation import serial
from src.generation.schemas import length_problems, word_floor
from src.generation.serial import (
    batches,
    build_user_prompt,
    character_ledger,
    last_lines,
    persist,
    speaker_lines,
    write_season,
)


# ---------------------------------------------------------------------------
# FIXTURES
# ---------------------------------------------------------------------------

DOSSIER = {
    "event_id": "evt_test_1999",
    "title": "The Test Season",
    "cast": [
        {"char_id": "asha", "name": "Asha", "role": "clerk", "want": "to be believed"},
        {"char_id": "vikram", "name": "Vikram", "role": "broker", "want": "the file"},
    ],
    "people": [{"name": "A Real Person"}],
    "fictionalization_map": {"A Real Person": "asha"},
    "timeline": [
        {"id": "t1", "what_happened": "a ledger went missing", "confidence": "reported"},
        {"id": "t2", "what_happened": "money moved", "confidence": "alleged"},
    ],
    "season": [
        {"ep": n, "turn": f"turn {n}", "ends_on": f"fact {n}",
         "hook_type": "REVEAL", "status": n, "pays_off": None}
        for n in range(1, 5)
    ],
}


def beat(bid, ep, seq, witnessed=(), hidden=(), what="something happened"):
    return {
        "beat_id": bid, "ep": ep, "seq": seq, "world_time": "1999-04",
        "location": "the office", "present": list(witnessed),
        "witnessed_by": list(witnessed), "hidden_from": list(hidden),
        "what_happened": what, "state_changes": [],
        "source_ref": "fictionalized", "tier": "core_canon", "note": None,
    }


class FakeResponse:
    def __init__(self, payload, status="completed"):
        self.output_text = json.dumps(payload)
        self.status = status
        self.output = []
        self.incomplete_details = None


class StubClient:
    """Records every prompt it is handed, so the carry can be asserted on."""

    def __init__(self, payloads):
        self._payloads = list(payloads)
        self.prompts = []
        self.responses = self

    def create(self, **kwargs):
        self.prompts.append(kwargs["input"][1]["content"])
        return FakeResponse(self._payloads.pop(0))


def payload(eps, beats, promises=(), flags=()):
    return {
        "episodes": [
            {"ep": n, "title": f"Episode {n}", "script": "WORD " * 1200} for n in eps
        ],
        "beat_sheet": list(beats),
        "promise_ledger": list(promises),
        "calendar": {"season_start": "1999-04", "dates_fixed": [],
                     "periods_fixed": [], "unresolved": []},
        "flags": list(flags),
    }


@pytest.fixture(autouse=True)
def isolated_cache(tmp_path, monkeypatch):
    """Never read or write the committed cache from a test."""
    monkeypatch.setattr(gen_client, "CALLS", tmp_path / "calls")
    monkeypatch.delenv("OFFLINE", raising=False)


# ---------------------------------------------------------------------------
# BATCHING
# ---------------------------------------------------------------------------

def test_batches_cover_every_episode_exactly_once():
    spans = batches([1, 2, 3, 4, 5, 6, 7], size=3)
    assert spans == [(1, 3), (4, 6), (7, 7)]


def test_batches_do_not_lose_a_trailing_episode():
    # An off-by-one here silently drops the finale, which is the one episode a
    # season cannot do without.
    for n in range(1, 20):
        spans = batches(range(1, n + 1), size=3)
        assert spans[-1][1] == n


# ---------------------------------------------------------------------------
# VOICE AND KNOWLEDGE CARRY
# ---------------------------------------------------------------------------

def test_speaker_lines_returns_only_that_characters_dialogue():
    script = (
        "SFX: A fan.\n"
        "ASHA: I signed nothing.\n"
        "VIKRAM: Nobody said you did.\n"
        "ASHA: Then why is my name on it.\n"
    )
    asha, vikram = DOSSIER["cast"]
    assert speaker_lines(script, asha) == ["I signed nothing.",
                                           "Then why is my name on it."]
    assert speaker_lines(script, vikram) == ["Nobody said you did."]


def test_speaker_lines_finds_a_character_whose_name_is_not_their_speaker_tag():
    """
    The real mismatch. `render_script` labels every line `speaker.upper()` and
    `speaker` is the *char_id*, so a cast carrying display names — "Ewan Kerr"
    against `ewan`, "Osric Bell" against `bell` — matched nothing at all. On the
    delivered season that was 12 of 13 characters returning zero lines, which
    emptied the `previously said:` block in every batch after the first and let
    voices drift with no error anywhere.
    """
    char = {"char_id": "ewan", "name": "Ewan Kerr"}
    script = "EWAN: The ledger is in my hand.\nBELL: Then put it down.\n"

    assert speaker_lines(script, char) == ["The ledger is in my hand."]


def test_speaker_lines_prefers_the_char_id_over_a_shared_first_name():
    """
    `store.speaker_tokens` ranks char_id ahead of the name parts, and this is why:
    two Kerrs in one cast, and matching on a name part would hand one of them the
    other's voice.
    """
    script = "EWAN: Mine.\nELSPETH: Mine.\n"

    assert speaker_lines(script, {"char_id": "elspeth", "name": "Elspeth Kerr"}) == ["Mine."]
    assert speaker_lines(script, {"char_id": "ewan", "name": "Ewan Kerr"}) == ["Mine."]
    # KERR is a candidate for both and belongs to neither: no line is labelled it.
    assert speaker_lines("KERR: Ours.\n", {"char_id": "ewan", "name": "Ewan Kerr"}) == ["Ours."]


def test_speaker_lines_is_silent_rather_than_wrong_for_a_character_with_no_lines():
    """An empty block is honest here — `character_ledger` omits the heading. It is
    a raise in `views.voice_samples` because a spinoff cannot proceed without a
    voice, but a mainline walk-on legitimately has none yet."""
    assert speaker_lines("ASHA: One.\n", {"char_id": "vikram", "name": "Vikram"}) == []


def test_ledger_separates_what_a_character_knows_from_what_they_must_not():
    beats = [
        beat("b001", 1, 1, witnessed=["asha"], hidden=["vikram"], what="the file is forged"),
        beat("b002", 1, 2, witnessed=["vikram"], what="a payment cleared"),
    ]
    text = character_ledger(DOSSIER, beats, {1: "ASHA: I signed nothing."})

    asha, vikram = text.split("vikram")[0], "vikram" + text.split("vikram")[1]
    assert "the file is forged" in asha
    assert "MUST NOT KNOW" in vikram and "the file is forged" in vikram
    # Her own line goes back so the next batch can match the voice.
    assert "I signed nothing." in asha


def test_ledger_carries_the_voice_of_a_character_whose_name_is_not_their_tag():
    """
    The batch-boundary bug, end to end: the ledger is the only place a character's
    earlier lines reach the next call, and it read them out of a script rendered
    with char_id labels while looking for display names.
    """
    dossier = dict(DOSSIER, cast=[
        {"char_id": "ewan", "name": "Ewan Kerr", "role": "clerk", "want": "out"}])
    b = beat("b001", 1, 1, witnessed=["ewan"], what="the ledger goes missing")

    text = character_ledger(dossier, [b], {1: "EWAN: I never touched it.\n"})

    assert 'previously said: "I never touched it."' in text


def test_ledger_does_not_credit_knowledge_to_someone_merely_present():
    """
    `character_view()` derives knowledge from `witnessed_by`, so the writer must
    not be told a character knows something on the strength of being in the room.
    A real season got this wrong and had its protagonist not knowing her own scenes.
    """
    b = beat("b001", 1, 1, what="a confession")
    b["present"] = ["asha"]
    b["witnessed_by"] = []

    text = character_ledger(DOSSIER, [b], {})
    assert "nothing yet" in text.split("vikram")[0]


def test_last_lines_come_from_the_most_recent_episode():
    scripts = {1: "ASHA: one\nASHA: two", 2: "VIKRAM: three\nVIKRAM: four"}
    assert last_lines(scripts, n=1) == "VIKRAM: four"


# ---------------------------------------------------------------------------
# THE PROMPT THE MODEL ACTUALLY RECEIVES
# ---------------------------------------------------------------------------

def test_prompt_carries_every_section_the_template_requires():
    text = build_user_prompt(DOSSIER, 1, 3, [], [], None, {})
    for heading in ("## SEASON PLAN", "## THIS BATCH", "## CAST", "## CANON SO FAR",
                    "## CHARACTER LEDGER", "## OPEN PROMISES", "## CALENDAR",
                    "## LAST LINES", "## CLEARANCE"):
        assert heading in text


def test_prompt_names_the_alleged_claims_and_the_real_person():
    text = build_user_prompt(DOSSIER, 1, 3, [], [], None, {})
    assert "A Real Person" in text          # so it can be kept out of the scripts
    assert "money moved" in text            # alleged: assertable, never narrated
    assert "a ledger went missing" not in text.split("Never narrate as fact")[1]


def test_prompt_hides_promises_that_are_already_paid():
    paid = {"id": "p01", "status": "paid", "raised_ep": 1, "must_pay_by_ep": 3,
            "listener_is_waiting_for": "x", "paid_ep": 2, "how_paid": "y"}
    text = build_user_prompt(DOSSIER, 4, 4, [], [paid], None, {})
    assert "(none open)" in text


# ---------------------------------------------------------------------------
# STATE CARRY ACROSS BATCHES
# ---------------------------------------------------------------------------

def test_second_batch_is_shown_the_first_batchs_canon():
    stub = StubClient([
        payload([1, 2], [beat("b001", 1, 1, witnessed=["asha"], what="the ledger vanished")]),
        payload([3, 4], [beat("b002", 3, 1, witnessed=["asha"])]),
    ])
    write_season(DOSSIER, "story_test", batch_size=2, client=stub)

    assert "nothing yet" in stub.prompts[0]           # first batch has no canon
    assert "the ledger vanished" in stub.prompts[1]   # second batch does


def test_ledger_is_replaced_not_appended():
    """
    The prompt returns the whole ledger every time, inherited entries included.
    Appending would duplicate every promise once per remaining batch and the
    open count — which the Slate screen shows — would climb on its own.
    """
    p = {"id": "p01", "raised_ep": 1, "listener_is_waiting_for": "who took it",
         "must_pay_by_ep": 4, "paid_ep": None, "how_paid": None, "status": "open"}
    stub = StubClient([
        payload([1, 2], [], promises=[p]),
        payload([3, 4], [], promises=[p]),
    ])
    season = write_season(DOSSIER, "story_test", batch_size=2, client=stub)
    assert len(season["promises"]) == 1


def test_a_batch_returning_no_episodes_stops_the_season():
    stub = StubClient([payload([], [])])
    with pytest.raises(RuntimeError, match="no episodes"):
        write_season(DOSSIER, "story_test", batch_size=2, client=stub)


def test_missing_season_plan_names_the_command_that_makes_one():
    with pytest.raises(RuntimeError, match="tasks.py score"):
        write_season({"event_id": "e", "season": []}, "story_test", client=StubClient([]))


def test_short_episodes_are_flagged_rather_than_silently_shipped():
    thin = payload([1, 2], [])
    thin["episodes"][0]["script"] = "too short"
    stub = StubClient([thin, payload([3, 4], [])])
    season = write_season(DOSSIER, "story_test", batch_size=2, client=stub)
    assert any("under its" in f for f in season["flags"])


# ---------------------------------------------------------------------------
# LENGTH RULES
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# PERSISTING
# ---------------------------------------------------------------------------

def season_of(n, story="story_test"):
    return {
        "story_id": story, "event_id": "evt_test_1999", "title": "T",
        "scripts": {i: f"SFX: A door.\nASHA: line {i}." for i in range(1, n + 1)},
        "titles": {i: f"Episode {i}" for i in range(1, n + 1)},
        "beats": [], "promises": [], "calendar": None, "flags": [],
    }


def test_a_shorter_season_does_not_leave_the_longer_one_behind(tmp_path, monkeypatch):
    """
    Every screen lists the episodes directory rather than the season plan, so a
    surplus file is shown as part of the season. A 14-episode story
    re-commissioned as a 3-episode taster really did leave episodes 4-14 on
    disk, starring a cast the new dossier had never heard of.
    """
    monkeypatch.setattr(serial, "STORIES", tmp_path)

    persist(season_of(14), DOSSIER)
    assert len(list((tmp_path / "story_test" / "episodes").glob("ep*.md"))) == 14

    persist(season_of(3), DOSSIER)
    left = sorted(p.name for p in (tmp_path / "story_test" / "episodes").glob("ep*.md"))
    assert left == ["ep01.md", "ep02.md", "ep03.md"]


def test_persist_leaves_files_it_does_not_own_alone(tmp_path, monkeypatch):
    """`audio/` and a handoff note belong to other stages. Not persist's to delete."""
    monkeypatch.setattr(serial, "STORIES", tmp_path)
    persist(season_of(3), DOSSIER)

    episodes = tmp_path / "story_test" / "episodes"
    (episodes / "notes.md").write_text("keep me", encoding="utf-8")
    (tmp_path / "story_test" / "HANDOFF.md").write_text("keep me too", encoding="utf-8")

    persist(season_of(2), DOSSIER)
    assert (episodes / "notes.md").exists()
    assert (tmp_path / "story_test" / "HANDOFF.md").exists()


def test_a_stale_calendar_is_removed_rather_than_left_dating_a_dead_season(
    tmp_path, monkeypatch
):
    monkeypatch.setattr(serial, "STORIES", tmp_path)

    dated = season_of(3)
    dated["calendar"] = {"season_start": "1821", "dates_fixed": [],
                         "periods_fixed": [], "unresolved": []}
    persist(dated, DOSSIER)
    assert (tmp_path / "story_test" / "calendar.json").exists()

    persist(season_of(3), DOSSIER)
    assert not (tmp_path / "story_test" / "calendar.json").exists()


# ---------------------------------------------------------------------------
# FINDING THE DOSSIER AGAIN
# ---------------------------------------------------------------------------

def test_a_story_on_disk_can_be_rewritten_after_a_later_commission(
    tmp_path, monkeypatch
):
    """
    `score` used to replace `data/dossiers.json` with a one-element list, so
    commissioning a second story made the first one unregeneratable — six of the
    seven delivered stories were in that state. `persist()` already writes the
    dossier beside the season; this is the read that makes that copy count.
    """
    monkeypatch.setattr(serial, "STORIES", tmp_path)
    monkeypatch.setattr(serial, "DOSSIERS_PATH", tmp_path / "dossiers.json")
    persist(season_of(3), DOSSIER)

    # The list now holds a different commission entirely.
    (tmp_path / "dossiers.json").write_text(
        json.dumps([{"event_id": "evt_something_else", "title": "Another"}]),
        encoding="utf-8")

    assert serial.load_dossier("evt_test_1999")["title"] == "The Test Season"
    assert serial.load_dossier("evt_something_else")["title"] == "Another"


def test_the_commission_list_wins_over_the_copy_beside_the_season(
    tmp_path, monkeypatch
):
    """A dossier corrected and re-planned should be the one the rewrite uses; the
    story copy is the fallback, not the authority."""
    monkeypatch.setattr(serial, "STORIES", tmp_path)
    monkeypatch.setattr(serial, "DOSSIERS_PATH", tmp_path / "dossiers.json")
    persist(season_of(3), DOSSIER)
    (tmp_path / "dossiers.json").write_text(
        json.dumps([dict(DOSSIER, title="Corrected")]), encoding="utf-8")

    assert serial.load_dossier("evt_test_1999")["title"] == "Corrected"


def test_an_unknown_event_names_every_dossier_that_does_exist(tmp_path, monkeypatch):
    """The error is the whole interface here — it is what tells an editor which id
    to use instead."""
    monkeypatch.setattr(serial, "STORIES", tmp_path)
    monkeypatch.setattr(serial, "DOSSIERS_PATH", tmp_path / "dossiers.json")
    persist(season_of(3), DOSSIER)

    with pytest.raises(RuntimeError, match="evt_test_1999"):
        serial.load_dossier("evt_nope")


def test_no_dossiers_anywhere_says_to_run_score(tmp_path, monkeypatch):
    monkeypatch.setattr(serial, "STORIES", tmp_path)
    monkeypatch.setattr(serial, "DOSSIERS_PATH", tmp_path / "dossiers.json")

    with pytest.raises(RuntimeError, match="tasks.py score"):
        serial.load_dossier("evt_test_1999")


def test_word_floor_ramps_over_the_first_three_episodes():
    assert [word_floor(n) for n in (1, 2, 3, 4, 14)] == [250, 500, 750, 1000, 1000]


def test_length_problems_catches_both_ends():
    problems = length_problems([
        {"ep": 4, "script": "word " * 900},
        {"ep": 5, "script": "word " * 1600},
        {"ep": 6, "script": "word " * 1200},
    ])
    assert len(problems) == 2
    assert "under" in problems[0] and "over" in problems[1]


# ---------------------------------------------------------------------------
# THE HARNESS
# ---------------------------------------------------------------------------

def test_a_cached_response_is_replayed_without_calling_out():
    stub = StubClient([payload([1], [])])
    args = dict(stage="s", system="sys", user="usr",
                schema={"type": "object"}, schema_name="n", client=stub)

    first = gen_client.call_structured(**args)
    second = gen_client.call_structured(**args)

    assert first == second
    assert len(stub.prompts) == 1   # the second call never reached the stub


def test_offline_refuses_rather_than_reaching_for_the_network(monkeypatch):
    monkeypatch.setenv("OFFLINE", "1")
    with pytest.raises(RuntimeError, match="OFFLINE"):
        gen_client.call_structured(
            stage="s", system="sys", user="usr",
            schema={"type": "object"}, schema_name="n", client=StubClient([]),
        )


def test_truncation_is_named_as_truncation():
    class Truncated(StubClient):
        def create(self, **kwargs):
            return FakeResponse(payload([1], []), status="incomplete")

    with pytest.raises(RuntimeError, match="truncated"):
        gen_client.call_structured(
            stage="s", system="sys", user="usr",
            schema={"type": "object"}, schema_name="n", client=Truncated([]),
        )


def test_empty_output_is_not_treated_as_an_empty_season():
    class Empty(StubClient):
        def create(self, **kwargs):
            r = FakeResponse({})
            r.output_text = ""
            return r

    with pytest.raises(RuntimeError, match="no text output"):
        gen_client.call_structured(
            stage="s", system="sys", user="usr",
            schema={"type": "object"}, schema_name="n", client=Empty([]),
        )
