"""
The shape a writing batch must come back in.

`episode.md` specifies five outputs and this is them, expressed strictly so the
model cannot omit one. Strict mode has two consequences worth knowing before
editing: every property must appear in `required`, and there is no `minimum`,
`maxItems` or tuple typing — anything numeric or countable is checked in Python
afterwards, never here.

Fields exist because something downstream reads them. `hidden_from` is the
product; `source_ref` is how it answers which parts actually happened; the
promise ledger is what stops a season raising questions it never settles. None
of them are decoration, and `src/scoring/validate.py` fails a season that gets
them wrong.
"""

from typing import Any, Dict, List

# `episode.md` fixes these. Restated rather than parsed out of the prompt: a
# markdown scrape breaks on the first formatting edit and fails silently.
PROMISE_STATUS = ["open", "paid", "paid_late"]
BEAT_TIER = ["core_canon"]


def obj(properties: Dict[str, Any]) -> Dict[str, Any]:
    """Strict object: every key required, nothing else permitted."""
    return {
        "type": "object",
        "additionalProperties": False,
        "required": list(properties),
        "properties": properties,
    }


def arr(items: Dict[str, Any]) -> Dict[str, Any]:
    return {"type": "array", "items": items}


STRING = {"type": "string"}
INTEGER = {"type": "integer"}
NULLABLE_STRING = {"type": ["string", "null"]}
NULLABLE_INTEGER = {"type": ["integer", "null"]}


EPISODE = obj({
    "ep": INTEGER,
    "title": STRING,
    # The whole file: SFX, NARRATOR and CHARACTER lines exactly as written.
    # Word count is derived in Python — asking the model to count its own words
    # produces a number, not a measurement.
    "script": STRING,
})


STATE_CHANGE = obj({
    # A cast char_id, or a short lowercase label for a named non-person.
    # Never a real name, never a walk-on.
    "entity": STRING,
    "fact": STRING,
    "valence": INTEGER,
})


BEAT = obj({
    "beat_id": STRING,
    "ep": INTEGER,
    "seq": INTEGER,
    # Partial ISO 8601: 2022, 2022-11 or 2022-11-14. Least precision the story
    # actually fixes; never a relative scheme.
    "world_time": STRING,
    "location": STRING,
    # cast char_ids only. A place or a crowd here silently corrupts every
    # character view computed from it, and nothing downstream can detect it.
    "present": arr(STRING),
    "witnessed_by": arr(STRING),
    "hidden_from": arr(STRING),
    "what_happened": STRING,
    "state_changes": arr(STATE_CHANGE),
    # `{event_id}#{timeline_id}` or the literal "fictionalized". Two forms only.
    "source_ref": STRING,
    "tier": {"type": "string", "enum": BEAT_TIER},
    # Required by strict mode, so nullable rather than absent. Mandatory in
    # practice on an unwitnessed beat, where it says why the gap is deliberate.
    "note": NULLABLE_STRING,
})


PROMISE = obj({
    "id": STRING,
    "raised_ep": INTEGER,
    "listener_is_waiting_for": STRING,
    "must_pay_by_ep": INTEGER,
    # Null while open — never omitted, never an empty string.
    "paid_ep": NULLABLE_INTEGER,
    "how_paid": NULLABLE_STRING,
    "status": {"type": "string", "enum": PROMISE_STATUS},
})


CALENDAR = obj({
    "season_start": STRING,
    "dates_fixed": arr(obj({"ep": INTEGER, "when": STRING, "what": STRING})),
    # `between` is a pair of episode numbers. Strict mode cannot express a
    # 2-tuple, so the length is checked in Python.
    "periods_fixed": arr(obj({"between": arr(INTEGER), "elapsed": STRING})),
    "unresolved": arr(STRING),
})


BATCH = obj({
    "episodes": arr(EPISODE),
    "beat_sheet": arr(BEAT),
    # The whole ledger every time — inherited promises and newly raised ones —
    # so the last batch's output is the season's complete ledger rather than a
    # fragment the caller has to stitch.
    "promise_ledger": arr(PROMISE),
    "calendar": CALENDAR,
    # The only channel for talking to a human. Empty when there is nothing wrong.
    "flags": arr(STRING),
})


def batch_schema() -> Dict[str, Any]:
    return BATCH


def episode_word_count(script: str) -> int:
    """
    Everything in the file, per `episode.md` — SFX lines and speaker tags
    included. Counted here because a self-reported figure is a claim.
    """
    return len(script.split())


def word_floor(ep: int) -> int:
    """Ramp from `episode.md`. Under the floor is a failed episode, not a short one."""
    if ep <= 1:
        return 250
    if ep == 2:
        return 500
    if ep == 3:
        return 750
    return 1000


WORD_CEILING = 1400


def length_problems(episodes: List[Dict[str, Any]]) -> List[str]:
    """
    Length is the one rule in `episode.md` that is objectively checkable, and the
    one most likely to slip on a long batch. Reported, not raised: a short
    episode is worth reading before it is thrown away.
    """
    problems = []
    for e in episodes:
        ep = e.get("ep", 0)
        words = episode_word_count(e.get("script", ""))
        floor = word_floor(ep)
        if words < floor:
            problems.append(f"ep{ep:02d} is {words} words, under its {floor} floor")
        elif words > WORD_CEILING:
            problems.append(
                f"ep{ep:02d} is {words} words, over the {WORD_CEILING} ceiling"
            )
    return problems
