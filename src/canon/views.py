"""
The three derived views of a character: knows, blind, gaps.

Pure functions over a list of beat dicts. The store hands them rows; they
do not talk to a database themselves, so the whole product claim is
testable without one.
"""

from typing import Any

Beat = dict[str, Any]


def _ordered(beats: list[Beat]) -> list[Beat]:
    """Canon order is (ep, seq). world_time is partial ISO 8601 and does
    not subtract reliably, so it is never used for ordering."""
    return sorted(beats, key=lambda b: (b["ep"], b["seq"]))


def _present_at(beat: Beat, char_id: str) -> bool:
    return char_id in beat.get("present", []) or char_id in beat.get("witnessed_by", [])


def knows(beats: list[Beat], char_id: str) -> list[Beat]:
    """Beats the character was present at or witnessed."""
    return [b for b in _ordered(beats) if _present_at(b, char_id)]


def blind(beats: list[Beat], char_id: str) -> list[Beat]:
    """Beats the character is explicitly excluded from."""
    return [b for b in _ordered(beats) if char_id in b.get("hidden_from", [])]


def gaps(beats: list[Beat], char_id: str) -> list[dict[str, Any]]:
    """
    Maximal runs of consecutive beats the character appears in nowhere.

    These are the windows a spinoff may invent into without touching canon,
    which is why they are returned as spans rather than a count.
    """
    out: list[dict[str, Any]] = []
    run: list[Beat] = []
    for beat in _ordered(beats):
        if _present_at(beat, char_id):
            if run:
                out.append(_span(run))
                run = []
        else:
            run.append(beat)
    if run:
        out.append(_span(run))
    return out


def _span(run: list[Beat]) -> dict[str, Any]:
    return {
        "start": run[0]["beat_id"],
        "end": run[-1]["beat_id"],
        "length": len(run),
        "beat_ids": [b["beat_id"] for b in run],
    }


def character_view(beats: list[Beat], char_id: str) -> dict[str, Any]:
    """All three lists in one pass-through object."""
    return {
        "char_id": char_id,
        "knows": knows(beats, char_id),
        "blind": blind(beats, char_id),
        "gaps": gaps(beats, char_id),
    }
