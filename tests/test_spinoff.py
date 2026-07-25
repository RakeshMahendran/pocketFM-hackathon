"""
The brief, the sealing, and the check that is actually the guarantee.

The panel is six model opinions and can miss things. `set(cites) <= set(allowed_ids)`
cannot, which is why the tests that matter most here are the boring set ones.
"""

import json

import pytest

from src.generation import client as llm_client
from src.generation.schemas import obj as schema_obj
from src.generation import brief as brief_mod
from src.generation import spinoff as spinoff_mod
from src.validation import checks, panel
from tests.test_canon import _beat, _story


class FakeResponse:
    """The Responses API shape, as plain data. Matches tests/test_discovery.py."""

    def __init__(self, body, status="completed"):
        self.status = status
        self.output_text = body if isinstance(body, str) else json.dumps(body)
        self.output = [{"content": [{"type": "output_text",
                                     "text": self.output_text}]}]
        self.incomplete_details = "max_output_tokens"


class StubClient:
    def __init__(self, *responses):
        self.responses = self
        self._queue = list(responses)
        self.calls = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        nxt = self._queue.pop(0) if len(self._queue) > 1 else self._queue[0]
        if isinstance(nxt, Exception):
            raise nxt
        return nxt


def _demo_story():
    beats = [
        _beat("b1", 1, 1, present=["ana"], witnessed=["ana"], what="ana signs the form"),
        _beat("b2", 1, 2, present=["ben"], witnessed=["ben"], hidden=["ana"],
              what="ben sells the land"),
        _beat("b3", 2, 1, present=["ana", "ben"], witnessed=["ana", "ben"],
              what="ana is let into the house",
              changes=[{"entity": "ana", "fact": "admitted", "valence": 4}]),
    ]
    s = _story(beats)
    s["dossier"]["engine"] = "the mainline engine"
    s["dossier"]["clearance"] = {"status": "fictionalize_first"}
    s["dossier"]["fictionalization_map"] = {"Mysuru district": "unnamed district"}
    s["dossier"]["season"] = [{"ep": 1, "hook_type": "REVEAL"},
                              {"ep": 2, "hook_type": "REVERSAL"}]
    return s


# ---------------------------------------------------------------------------
# the brief
# ---------------------------------------------------------------------------

def test_the_unconstrained_run_is_the_naive_baseline_not_a_starved_one(monkeypatch):
    """
    The leak proof compares against what a writer gets WITHOUT this system: the
    whole season, undifferentiated, and no rule about any of it.

    Merely dropping the prohibition block is not that comparison — it removes the
    forbidden facts from the prompt along with the rule, and a writer cannot leak
    what it was never shown. Built that way, a real run came back with the
    unconstrained episode cleaner than the constrained one, which proved nothing
    except that the experiment was wrong.
    """
    monkeypatch.setattr(brief_mod.views, "voice_samples", lambda s, c, limit=12: ["a line"])
    s = _demo_story()

    on = brief_mod.build_brief(s, "ana", "b3")["text"]
    off = brief_mod.build_brief(s, "ana", "b3", constrained=False)["text"]

    # b2 is the beat ana is blind to. Constrained, it appears only as a prohibition.
    assert "ben sells the land" in on
    assert "DOES NOT KNOW" in on
    # Unconstrained, it is offered as ordinary material with no rule attached.
    assert "ben sells the land" in off
    assert "DOES NOT KNOW" not in off
    assert "THE SEASON" in off


def test_every_block_except_the_knowledge_ones_survives_the_unconstrained_run(monkeypatch):
    """One variable. Voice, clearance, open space and the moment must not move,
    or the two runs differ in ways nobody is tracking."""
    monkeypatch.setattr(brief_mod.views, "voice_samples", lambda s, c, limit=12: ["a line"])
    s = _demo_story()

    off = brief_mod.build_brief(s, "ana", "b3", constrained=False)["text"]

    for block in ("THE MOMENT", "OPEN SPACE", "VOICE", "CLEARANCE", "CROSSING POINTS"):
        assert block in off


def test_the_brief_and_the_validator_are_handed_the_same_forbidden_list(monkeypatch):
    """Two derivations of "what she may not know" is one derivation too many."""
    monkeypatch.setattr(brief_mod.views, "voice_samples", lambda s, c, limit=12: ["a line"])
    s = _demo_story()
    built = brief_mod.build_brief(s, "ana", "b3")

    assert built["forbidden"] is not None
    assert built["forbidden"]["forbidden_ids"] == \
        brief_mod.views.forbidden_facts(s, "ana")["forbidden_ids"]


def test_a_block_with_nothing_in_it_is_omitted_rather_than_left_empty(monkeypatch):
    """An empty heading teaches the model the block is optional, and the prohibition
    block is the one that must never read as optional."""
    monkeypatch.setattr(brief_mod.views, "voice_samples", lambda s, c, limit=12: ["a line"])
    s = _demo_story()

    assert "IN THE ROOM, DID NOT REGISTER" not in brief_mod.build_brief(s, "ana", "b3")["text"]


def test_an_offscreen_moment_tells_the_writer_to_hide_it_not_dramatise_it(monkeypatch):
    monkeypatch.setattr(brief_mod.views, "voice_samples", lambda s, c, limit=12: ["a line"])
    s = _demo_story()

    text = brief_mod.build_brief(s, "ana", "b2")["text"]

    assert "never learns this happened" in text
    assert "Do not reveal it" in text


def test_clearance_reaches_the_writer(monkeypatch):
    """The spinoff prompt does not inherit episode.md's continuity block, so without
    this the spinoff path is the one place in the pipeline with no name safety."""
    monkeypatch.setattr(brief_mod.views, "voice_samples", lambda s, c, limit=12: ["a line"])

    assert "Mysuru district" in brief_mod.build_brief(_demo_story(), "ana", "b3")["text"]


# ---------------------------------------------------------------------------
# sealing
# ---------------------------------------------------------------------------

def test_a_returned_beat_is_sealed_as_branch_canon_whatever_the_model_said():
    s = _demo_story()
    sealed = spinoff_mod.seal_branch_beats(s, "ana", [
        {"beat_id": "b1", "tier": "core_canon", "present": ["ana"],
         "witnessed_by": ["ana"], "hidden_from": []}])

    assert sealed[0]["tier"] == "branch_canon"
    assert sealed[0]["pov"] == "ana"


def test_a_returned_beat_id_cannot_collide_with_a_mainline_beat():
    """A model asked to suggest an id will return "b1", which already exists and
    would overwrite real canon on any future merge."""
    s = _demo_story()
    sealed = spinoff_mod.seal_branch_beats(s, "ana", [{"beat_id": "b1"}])

    assert sealed[0]["beat_id"] not in s["beat_index"]
    assert "b1" in sealed[0]["note"]


def test_a_branch_beat_is_hidden_from_every_mainline_character_not_placed_in_it():
    """Stops one character's serial leaking into another's."""
    s = _demo_story()
    sealed = spinoff_mod.seal_branch_beats(s, "ana", [
        {"beat_id": "x", "present": ["ana"], "witnessed_by": ["ana"]}])

    assert set(sealed[0]["hidden_from"]) == {"ben", "cy"}


def test_the_default_anchor_is_one_the_character_actually_witnessed():
    """Offscreen moments are fully supported and are not what an unattended run
    should silently choose."""
    assert spinoff_mod.default_anchor(_demo_story(), "ana") == "b3"


# ---------------------------------------------------------------------------
# the guarantee
# ---------------------------------------------------------------------------

def _spinoff(cites, script="SFX: a door.", crossings=()):
    s = _demo_story()
    payload = brief_mod.views.forbidden_facts(s, "ana")
    return {"story_id": "t", "char_id": "ana", "anchor_beat_id": "b3",
            "anchor": {"ep": 2}, "constrained": True, "forbidden": payload,
            "episode": {"script": script}, "beats": [], "cites": list(cites),
            "crossings": list(crossings)}, s


def test_a_citation_of_a_forbidden_beat_is_caught_without_a_model_call():
    """This is the guarantee. No model is consulted and none can disagree."""
    spin, s = _spinoff(["b1", "b2"])

    found = checks.check_cites(spin)

    assert [v["beat_id"] for v in found] == ["b2"]
    assert found[0]["check"] == "leakage"


def test_a_citation_of_a_beat_that_does_not_exist_is_caught_too():
    spin, _ = _spinoff(["b99"])

    assert checks.check_cites(spin)[0]["check"] == "citation"


def test_a_crossing_can_only_cross_a_beat_she_witnessed():
    spin, s = _spinoff([], crossings=[{"mainline_beat_id": "b2", "rendered_as": "x"}])

    assert checks.check_crossings(spin)[0]["beat_id"] == "b2"


def test_a_real_place_name_in_the_script_is_caught():
    spin, s = _spinoff([], script="SFX: a bus leaves Mysuru district.")

    assert checks.check_real_names(spin, s)[0]["check"] == "clearance"


# ---------------------------------------------------------------------------
# the panel
# ---------------------------------------------------------------------------

def test_a_panel_member_that_fails_is_reported_as_inconclusive_not_as_clean(monkeypatch):
    """
    The difference between "we checked and found nothing" and "we did not check".
    A panel that silently drops a failed call certifies an episode nobody finished
    reading.
    """
    monkeypatch.setattr(panel, "offline", lambda: False)
    spin, s = _spinoff([])
    clean = FakeResponse({"violations": [], "checked": "ok",
                          "found": False, "attempts_that_failed": ["tried x"]})
    client = StubClient(clean, clean, RuntimeError("juror died"))

    result = panel.run_panel(spin, s, client=client)

    assert result["status"] == "inconclusive"
    assert result["inconclusive"]


def test_every_panel_member_is_asked(monkeypatch):
    monkeypatch.setattr(panel, "offline", lambda: False)
    spin, s = _spinoff([])
    client = StubClient(FakeResponse({"violations": [], "checked": "ok",
                                      "found": False, "attempts_that_failed": []}))

    panel.run_panel(spin, s, client=client)

    assert len(client.calls) == 6


def test_two_panel_members_quoting_the_same_line_report_one_violation():
    """Six members quoting one leak must not read as six failures."""
    v = checks.violation("leakage", "why", quote="the same line", beat_id="b2")
    merged = panel.dedupe([dict(v, source="leakage"), dict(v, source="refuter_inference")])

    assert len(merged) == 1
    assert "refuter_inference" in merged[0]["source"]


# ---------------------------------------------------------------------------
# the cache half that did not exist
# ---------------------------------------------------------------------------

def test_a_cache_miss_offline_raises_and_names_the_file(monkeypatch, tmp_path):
    """`.env.example` promises exactly this: a miss raises rather than silently
    calling the API."""
    monkeypatch.setattr(llm_client, "offline", lambda: True)
    monkeypatch.setattr(llm_client, "CALLS", tmp_path)

    with pytest.raises(RuntimeError, match="OFFLINE is set and widget"):
        llm_client.call_structured("widget", "sys", "usr", schema_obj({}), "w")


def test_a_cached_response_is_replayed_without_touching_the_client(monkeypatch, tmp_path):
    """The half of caching that did not exist until the spinoff slice needed it:
    save_raw wrote forensic dumps and nothing ever read one back."""
    monkeypatch.setattr(llm_client, "CALLS", tmp_path)
    key = llm_client.cache_key(stage="widget", model=llm_client.model_for("WRITER"),
                               system="sys", user="usr", schema=schema_obj({}))
    (tmp_path / f"widget_{key}.json").write_text(json.dumps({"ok": True}))

    got = llm_client.call_structured("widget", "sys", "usr", schema_obj({}), "w",
                                     client=StubClient(RuntimeError("must not be called")))

    assert got == {"ok": True}


def test_an_unfilled_prompt_slot_is_refused(tmp_path):
    """Shipping the literal string "{{voice_samples}}" to a model reads as an
    instruction and produces confident nonsense."""
    from src.util import load_prompt
    p = tmp_path / "p.md"
    p.write_text("hello {{name}} and {{missing}}")

    with pytest.raises(ValueError, match="missing"):
        load_prompt(p, name="x")
