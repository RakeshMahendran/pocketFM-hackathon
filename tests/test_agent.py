"""
The tool loop, and the tools two stages ask questions with.

An agent is only worth the extra round trips where the query cannot be written in
advance. That makes two things worth testing: that the loop actually answers what
it is asked and stops when it stops asking, and that a tool which fails tells the
model so rather than killing the stage.
"""

import json

import pytest

from src.agent import Tool, run
from src.canon_tools import tools_for as canon_tools

SCHEMA = {"type": "object", "additionalProperties": False,
          "required": ["answer"], "properties": {"answer": {"type": "string"}}}


class ScriptedClient:
    """Replays a fixed sequence of responses and records what it was sent."""

    def __init__(self, turns):
        self.responses = self
        self._turns = list(turns)
        self.sent = []

    def create(self, **kwargs):
        self.sent.append(kwargs)
        return self._turns.pop(0)


def _tool_call(name, args, call_id="c1"):
    return type("R", (), {
        "output": [{"type": "function_call", "name": name, "call_id": call_id,
                    "arguments": json.dumps(args)}],
        "output_text": ""})()


def _final(payload):
    return type("R", (), {"output": [], "output_text": json.dumps(payload)})()


def test_the_loop_answers_a_question_then_returns_the_answer():
    asked = []

    def lookup(char_id):
        asked.append(char_id)
        return {"knows": 11}

    tool = Tool("character_knows", "", {"type": "object", "required": ["char_id"],
                "properties": {"char_id": {"type": "string"}}}, lookup)
    client = ScriptedClient([_tool_call("character_knows", {"char_id": "ratnamma"}),
                             _final({"answer": "done"})])

    result = run(client, "m", "sys", "usr", [tool], SCHEMA)

    assert asked == ["ratnamma"]
    assert result == {"answer": "done"}
    assert len(client.sent) == 2


def test_a_tool_that_raises_is_reported_not_fatal():
    """
    A stage dying because it asked a bad question is worse than telling it the
    question was bad — it can ask something else.
    """
    def explode(char_id):
        raise KeyError("no such character")

    tool = Tool("character_knows", "", {"type": "object", "required": ["char_id"],
                "properties": {"char_id": {"type": "string"}}}, explode)
    client = ScriptedClient([_tool_call("character_knows", {"char_id": "nobody"}),
                             _final({"answer": "recovered"})])

    assert run(client, "m", "sys", "usr", [tool], SCHEMA) == {"answer": "recovered"}
    handed_back = client.sent[1]["input"][-1]["output"]
    assert "KeyError" in handed_back


def test_a_stage_that_never_stops_asking_is_a_defect():
    tool = Tool("character_knows", "", {"type": "object", "required": ["char_id"],
                "properties": {"char_id": {"type": "string"}}}, lambda char_id: {})
    client = ScriptedClient([_tool_call("character_knows", {"char_id": "x"})] * 4)

    with pytest.raises(RuntimeError, match="still asking"):
        run(client, "m", "sys", "usr", [tool], SCHEMA, max_rounds=3)


def test_canon_tools_answer_from_real_beats():
    """The product claim, reachable as a tool call."""
    tools = {t.name: t for t in canon_tools("story1_denied_identity")}

    ratnamma = tools["character_knows"].fn(char_id="ratnamma")
    blind = tools["character_blind"].fn(char_id="ratnamma")

    assert ratnamma["count"] == 11
    assert blind["count"] == 34
    assert all("beat_id" in b for b in ratnamma["beats"])


def test_a_writer_can_check_one_permission_before_using_it():
    tools = {t.name: t for t in canon_tools("story1_denied_identity")}

    answer = tools["does_character_know"].fn(char_id="ratnamma", beat_id="b001")

    assert answer["knows"] is False
    assert answer["explicitly_blind"] is True
    assert "what_happened" in answer
