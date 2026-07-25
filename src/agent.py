"""
A bounded tool-use loop.

Two stages in this pipeline cannot be given what they need in advance, because
what they need depends on what they decide to write:

- the serial writer, which must ask whether a character knows a thing before it
  lets them act on it
- the director, which must see how the episodes around this one move before it
  can say whether this one is the climb or the dip

Everything else is a single typed call, and should stay one. `CLAUDE.md` is right
that a fifth LLM stage usually wants to be a SQL filter instead — the test for an
agent is not "would a model be good at this" but "can the query be written in
advance". If it can, write it.

The loop is capped and every tool is a local function over data already on disk.
No tool reaches the network, so an agent here cannot invent a source; the worst it
can do is ask a question the data answers.
"""

import json
from typing import Any, Callable, Dict, List, Optional

from src.util import log

# A stage that has not finished in this many rounds is looping, not thinking.
MAX_ROUNDS = 12


class Tool:
    """A local function the model may call, and the schema it is called with."""

    def __init__(self, name: str, description: str,
                 parameters: Dict[str, Any], fn: Callable[..., Any]):
        self.name = name
        self.description = description
        self.parameters = parameters
        self.fn = fn

    def spec(self) -> Dict[str, Any]:
        return {
            "type": "function",
            "name": self.name,
            "description": self.description,
            "parameters": {**self.parameters, "additionalProperties": False},
            "strict": True,
        }


def run(client: Any, model: str, system: str, user: str, tools: List[Tool],
        output_schema: Dict[str, Any], schema_name: str = "result",
        max_rounds: int = MAX_ROUNDS) -> Dict[str, Any]:
    """
    Call, answer whatever it asks for, call again, until it stops asking.

    Returns the parsed final object. Raises if it never stops asking — a stage
    that spends twelve rounds querying and never writes anything is a defect
    worth surfacing, not a longer timeout.
    """
    by_name = {t.name: t for t in tools}
    messages: List[Dict[str, Any]] = [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]
    asked: List[str] = []

    for round_no in range(1, max_rounds + 1):
        response = client.responses.create(
            model=model,
            input=messages,
            tools=[t.spec() for t in tools],
            text={"format": {"type": "json_schema", "name": schema_name,
                             "schema": output_schema, "strict": True}},
        )

        calls = [item for item in (getattr(response, "output", []) or [])
                 if _kind(item) == "function_call"]

        if not calls:
            text = getattr(response, "output_text", "") or ""
            if not text.strip():
                raise RuntimeError(
                    f"no tool calls and no output on round {round_no}")
            if asked:
                log(f"answered {len(asked)} questions: {', '.join(asked[:6])}"
                    + (" …" if len(asked) > 6 else ""))
            return json.loads(text)

        # Everything it asked for, answered from local data, then handed back.
        messages += [_as_dict(c) for c in calls]
        for call in calls:
            data = _as_dict(call)
            name = data.get("name", "")
            args = json.loads(data.get("arguments") or "{}")
            asked.append(f"{name}({', '.join(str(v) for v in args.values())})")
            tool = by_name.get(name)
            if tool is None:
                result = {"error": f"no such tool: {name}",
                          "available": sorted(by_name)}
            else:
                try:
                    result = tool.fn(**args)
                except Exception as exc:
                    # A tool that raises is information, not a crash — the model
                    # can ask something else. A stage dying because it asked a
                    # bad question would be worse than telling it the question
                    # was bad. Looked up separately from the call, so a KeyError
                    # from inside a tool is not reported as a missing tool.
                    result = {"error": f"{type(exc).__name__}: {exc}"}
            messages.append({
                "type": "function_call_output",
                "call_id": data.get("call_id"),
                "output": json.dumps(result, ensure_ascii=False, default=str)[:20000],
            })

    raise RuntimeError(
        f"still asking after {max_rounds} rounds — asked: {', '.join(asked[:10])}")


def _kind(item: Any) -> str:
    return getattr(item, "type", None) or (
        item.get("type") if isinstance(item, dict) else "")


def _as_dict(item: Any) -> Dict[str, Any]:
    return item.model_dump() if hasattr(item, "model_dump") else dict(item)
