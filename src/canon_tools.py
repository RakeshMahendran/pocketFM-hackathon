"""
The canon, as questions a writer can ask.

`src/canon/views.py` computes what a character knows, is blind to, and has no
beat in. Flattening those into a text block and handing it over means guessing in
advance which of them the writer will need — and the whole reason for a tool is
that you cannot guess.

Every answer is a query over beats already on disk. A writer cannot invent a
permission it was not given, because the permission is computed, not remembered.
"""

import json
import pathlib
from typing import Any, Dict, List

from src.agent import Tool
from src.util import DATA
from src.canon.views import blind, gaps, knows

STORIES = DATA / "stories"


def _beats(story: str) -> List[Dict[str, Any]]:
    doc = json.loads((STORIES / story / "beats.json").read_text(encoding="utf-8"))
    return doc["beats"] if isinstance(doc, dict) and "beats" in doc else doc


def _thin(beat: Dict[str, Any]) -> Dict[str, Any]:
    """What a writer needs to know about a beat. Not the whole record."""
    return {k: beat[k] for k in ("beat_id", "ep", "world_time", "what_happened")
            if k in beat}


def tools_for(story: str) -> List[Tool]:
    def character_knows(char_id: str) -> Dict[str, Any]:
        found = knows(_beats(story), char_id)
        return {"char_id": char_id, "count": len(found),
                "beats": [_thin(b) for b in found]}

    def character_blind(char_id: str) -> Dict[str, Any]:
        found = blind(_beats(story), char_id)
        return {"char_id": char_id, "count": len(found),
                "beats": [_thin(b) for b in found]}

    def character_gaps(char_id: str) -> Dict[str, Any]:
        return {"char_id": char_id, "windows": gaps(_beats(story), char_id)}

    def does_character_know(char_id: str, beat_id: str) -> Dict[str, Any]:
        beat = next((b for b in _beats(story) if b["beat_id"] == beat_id), None)
        if not beat:
            return {"error": f"no beat {beat_id}"}
        # `witnessed_by` alone, matching `views.knows`. Being in the room is not
        # knowing — a character present and not witnessing is where dramatic
        # irony lives, and answering True for them tells a writer it may use a
        # fact the validator will then flag.
        return {
            "char_id": char_id, "beat_id": beat_id,
            "knows": char_id in beat.get("witnessed_by", []),
            "present_but_did_not_witness": (
                char_id in beat.get("present", [])
                and char_id not in beat.get("witnessed_by", [])),
            "explicitly_blind": char_id in beat.get("hidden_from", []),
            "what_happened": beat["what_happened"],
        }

    def who_was_there(beat_id: str) -> Dict[str, Any]:
        beat = next((b for b in _beats(story) if b["beat_id"] == beat_id), None)
        if not beat:
            return {"error": f"no beat {beat_id}"}
        return {k: beat.get(k) for k in
                ("beat_id", "what_happened", "present", "witnessed_by", "hidden_from")}

    return [
        # These descriptions are the only account the model gets of what the
        # numbers mean, and the constrained arm is built on them. Told that
        # `character_knows` covers presence, a writer reasons that a beat missing
        # from it was one the character was absent for — and licenses itself on
        # the ones it was present for and did not witness, which is precisely the
        # leak `hidden_from` exists to stop. So each one states the rule its
        # implementation actually applies, including where that is narrower or
        # wider than the name suggests.
        Tool("character_knows",
             "Every beat this character is listed as witnessing (`witnessed_by`). "
             "Being in the room is NOT included: a beat they were present for and "
             "did not take in does not appear here, and they may not refer to it. "
             "Use before letting them refer to something.",
             {"type": "object", "required": ["char_id"],
              "properties": {"char_id": {"type": "string"}}},
             character_knows),
        Tool("character_blind",
             "Every beat this character did not witness — the exact complement of "
             "character_knows, not only the beats an author marked `hidden_from`. "
             "Beats nobody decided about are in here, because being unrecorded is "
             "not permission. They may never demonstrate knowledge of any of these.",
             {"type": "object", "required": ["char_id"],
              "properties": {"char_id": {"type": "string"}}},
             character_blind),
        Tool("character_gaps",
             "Runs of consecutive beats this character does not witness, measured "
             "in beats rather than clock time. Canon says nothing about where they "
             "were, so nothing there can be contradicted: it is writable space.",
             {"type": "object", "required": ["char_id"],
              "properties": {"char_id": {"type": "string"}}},
             character_gaps),
        Tool("does_character_know",
             "Whether one character knows one specific beat. The cheapest check "
             "before writing a line that depends on it.",
             {"type": "object", "required": ["char_id", "beat_id"],
              "properties": {"char_id": {"type": "string"},
                             "beat_id": {"type": "string"}}},
             does_character_know),
        Tool("who_was_there",
             "Who was present, who witnessed, and who is excluded from one beat.",
             {"type": "object", "required": ["beat_id"],
              "properties": {"beat_id": {"type": "string"}}},
             who_was_there),
    ]
