"""
What one character knows, does not know, and was never around for.

Every function takes a loaded story dict rather than a story id, so all of this is
testable against a hand-built fixture with no filesystem.

Two rules here carry the whole product and are stated once, in code, on purpose:

  knows  = the character is in `witnessed_by`
  blind  = every other beat in the season

`blind` is the *complement*, not the `hidden_from` list. `hidden_from` is
non-exhaustive in the delivered data — story1's b001 accounts for 14 of 17 cast
members and `kempanna` is unlisted on 36 of 46 beats — so defining blindness from it
would hand a character permission to know things nobody ever decided they knew.

Note that `docs/SPINOFF.md:13` and `.claude/commands/spine.md` both state the rule as
`present + witnessed_by`. They are wrong and predate the delivered data. Being in the
room is not knowing: b014 has `mallesha` present and not witnessing, which is exactly
the distinction the spinoff sells.
"""

import re
from typing import Any, Dict, List, Optional

from src.canon import store
from src.util import log

MIN_WITNESSED_FOR_PROMOTION = 3

# A crossing point wants a scene a single POV can hold. story1's b044 is legal for
# ratnamma — she witnesses it — but it is the episode-14 finale that resolves nine
# threads in front of thirteen people. Anchors above this are skipped unless a
# character has nothing else.
MAX_PRESENT_FOR_ANCHOR = 5

_SPEAKER_RE = re.compile(r"^([A-Z][A-Z0-9 .'\-]{0,30}):\s*(.+)$", re.M)


# ---------------------------------------------------------------------------
# THE THREE VIEWS
# ---------------------------------------------------------------------------

def knows(story: Dict[str, Any], char_id: str) -> List[Dict[str, Any]]:
    return [b for b in story["beats"] if char_id in b.get("witnessed_by", [])]


def blind(story: Dict[str, Any], char_id: str) -> List[Dict[str, Any]]:
    """Every beat the character did not witness. Fail closed — see module docstring."""
    return [b for b in story["beats"] if char_id not in b.get("witnessed_by", [])]


def explicitly_hidden(story: Dict[str, Any], char_id: str) -> List[Dict[str, Any]]:
    """
    The subset of `blind` that an author actively marked.

    Prompt emphasis only. Absence from this list is not permission: the omissions
    are not random — they skew toward the beats whoever wrote the sheet had in mind
    — so it can sharpen a prohibition but must never shorten one.
    """
    return [b for b in story["beats"] if char_id in b.get("hidden_from", [])]


def present_not_witnessed(story: Dict[str, Any], char_id: str) -> List[Dict[str, Any]]:
    """
    In the room, did not register.

    Deliberate in the delivered data (b006, b009, b014, b025) and the richest thing
    in it: a character standing next to the moment that undoes them, not taking it
    in. Empty for some characters — render nothing rather than an empty heading.
    """
    return [b for b in story["beats"]
            if char_id in b.get("present", []) and char_id not in b.get("witnessed_by", [])]


def gaps(story: Dict[str, Any], char_id: str) -> List[Dict[str, Any]]:
    """
    Runs of consecutive beats the character does not witness.

    This is the writable space: canon says nothing about where they were, so nothing
    they do there can contradict it.

    Deliberately counted in beats, not time. CLAUDE.md calls gaps "time windows" and
    that cannot be implemented — `world_time` is a different unparseable scheme in
    each story ("M1-D04 13:30", "Y1 M8 D0, morning", "Chait, pay-out day",
    "same, minutes later"). Any parser works on story1 and produces silent nonsense
    on story3. The strings are carried through as labels and never compared.
    """
    out: List[Dict[str, Any]] = []
    run: List[Dict[str, Any]] = []
    beats = story["beats"]

    def flush(before: Optional[Dict[str, Any]]) -> None:
        if not run:
            return
        out.append({
            "after_beat": run[0].get("_prev"),
            "before_beat": before["beat_id"] if before else None,
            "beat_ids": [b["beat_id"] for b in run],
            "eps": sorted({b["ep"] for b in run}),
            "from_world_time": run[0].get("world_time"),
            "to_world_time": run[-1].get("world_time"),
            "span": len(run),
        })
        run.clear()

    prev_witnessed: Optional[str] = None
    for beat in beats:
        if char_id in beat.get("witnessed_by", []):
            flush(beat)
            prev_witnessed = beat["beat_id"]
        else:
            if not run:
                beat = dict(beat, _prev=prev_witnessed)
            run.append(beat)
    flush(None)
    return out


# ---------------------------------------------------------------------------
# ANCHORS — the moment an episode is built on
# ---------------------------------------------------------------------------

def _entity_is(entity: str, char_id: str) -> bool:
    """`state_changes.entity` is sometimes possessive: "ratnamma's marriage"."""
    return entity == char_id or entity.startswith((f"{char_id}'s", f"{char_id}."))


def anchors(story: Dict[str, Any], char_id: str, limit: int = 3) -> List[Dict[str, Any]]:
    """
    The beats where the most happens to this character, ranked.

    Each carries `kind`, and nothing is filtered out:

      witnessed — they are in `witnessed_by`. The episode *is* this moment and its
                  objective facts are fixed.
      offscreen — they are not. The episode is set adjacent to it and must not
                  reveal it.

    Both are offered because for the demo character both of her largest moments are
    offscreen: b032 recognises her as the appointee's widow (+5) and b031 documents
    her marriage for the first time (+4), and she is in the `hidden_from` list of
    each. The one beat she is present for is her giving the claim up. That is the
    story's architecture, not an edge case.

    They are labelled rather than filtered because the *writer* can handle either
    job well — it just cannot guess which one you meant. A brief that says "write
    this moment" about a beat that is also on the prohibition list makes the model
    choose, and it chooses differently on different runs.
    """
    found: List[Dict[str, Any]] = []
    for beat in story["beats"]:
        for change in beat.get("state_changes", []):
            if not _entity_is(change.get("entity", ""), char_id):
                continue
            witnessed = char_id in beat.get("witnessed_by", [])
            found.append({
                "beat_id": beat["beat_id"], "ep": beat["ep"], "seq": beat["seq"],
                "world_time": beat.get("world_time"), "location": beat.get("location"),
                "what_happened": beat["what_happened"],
                "fact": change.get("fact", ""), "valence": change.get("valence", 0),
                "n_present": len(beat.get("present", [])),
                "kind": "witnessed" if witnessed else "offscreen",
            })

    # Witnessed first within the same magnitude — the writable one leads. Then
    # earliest, so ties are stable across runs.
    found.sort(key=lambda a: (-abs(a["valence"]), a["kind"] != "witnessed",
                              a["ep"], a["seq"]))

    focused = [a for a in found if a["n_present"] <= MAX_PRESENT_FOR_ANCHOR]
    if not focused and found:
        log(f"{char_id}: every anchor is a crowd scene — offering them unfiltered", "warn")
        focused = found
    return focused[:limit]


def crossing_points(story: Dict[str, Any], char_id: str,
                    anchor: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Beats the spinoff shares with the mainline, for the episode built on `anchor`.

    Only witnessed beats can cross: a beat the character is blind to cannot appear
    in their episode at all. Bounded to the anchor's episode and the one before it,
    because a crossing point the episode never reaches is noise in the prompt.
    """
    if anchor["kind"] != "witnessed":
        return []
    lo, hi = anchor["ep"] - 1, anchor["ep"]
    return [
        {"beat_id": b["beat_id"], "ep": b["ep"], "world_time": b.get("world_time"),
         "location": b.get("location"), "what_happened": b["what_happened"]}
        for b in knows(story, char_id) if lo <= b["ep"] <= hi
    ]


# ---------------------------------------------------------------------------
# VOICE
# ---------------------------------------------------------------------------

def voice_samples(story: Dict[str, Any], char_id: str, limit: int = 12) -> List[str]:
    """
    The character's own lines, verbatim from the delivered scripts.

    Free, and worth more than anything a model would invent for them — this is what
    makes a spinoff sound like the same show. Every episode is scanned rather than
    only the ones they hold a beat in, because walk-on lines are still their voice
    and reading 14 small files costs two milliseconds.

    Raises on zero. An empty voice block is worse than a missing one: it teaches the
    model the character has no particular way of speaking.
    """
    name = store.get_char(story, char_id).get("name", char_id)
    token = store.speaker_token(name)
    lines: List[str] = []
    for ep in store.episode_numbers(story):
        for speaker, body in _SPEAKER_RE.findall(store.episode_text(story, ep)):
            if speaker == token:
                lines.append(body.strip())

    if not lines:
        raise RuntimeError(
            f"{char_id} ({name}) speaks no lines in {story['story_id']} — "
            f"expected the script token {token}:. A character with no voice cannot "
            "carry a serial; pick another, or fix the name-to-speaker mapping."
        )

    # Longest first: the short ones are "Yes." and carry no voice.
    return sorted(lines, key=len, reverse=True)[:limit]


# ---------------------------------------------------------------------------
# THE ROSTER
# ---------------------------------------------------------------------------

def promotable(story: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    The whole cast with their counts, each flagged promotable or not.

    Returns everyone, not just the passers — the roster screen wants the mainline
    lead visible and greyed out at 43 known of 46, because that contrast is the
    idea. The rule is `serial_writer.md:129-131`: at least three witnessed beats,
    and excluded from more than they appear in. No separate "not the protagonist"
    clause; the lead fails this naturally and two rules would eventually disagree.
    """
    total = len(story["beats"])
    rows = []
    for char in story["cast"]:
        cid = char["char_id"]
        n = len(knows(story, cid))
        rows.append({
            "char_id": cid, "name": char.get("name", cid), "role": char.get("role", ""),
            "want": char.get("want", ""),
            "witnessed": n, "blind": total - n,
            "promotable": n >= MIN_WITNESSED_FOR_PROMOTION and (total - n) > n,
        })
    rows.sort(key=lambda r: (not r["promotable"], -r["witnessed"]))
    return rows


def character_view(story: Dict[str, Any], char_id: str) -> Dict[str, Any]:
    """Everything downstream needs about one character, in one dict."""
    char = store.get_char(story, char_id)
    return {
        "story_id": story["story_id"], "char_id": char_id,
        "name": char.get("name", char_id), "role": char.get("role", ""),
        "want": char.get("want", ""), "maps_to": char.get("maps_to", ""),
        "composite": char.get("composite", False),
        "n_beats": len(story["beats"]),
        "knows": knows(story, char_id),
        "blind": blind(story, char_id),
        "explicitly_hidden": explicitly_hidden(story, char_id),
        "present_not_witnessed": present_not_witnessed(story, char_id),
        "gaps": gaps(story, char_id),
        "anchors": anchors(story, char_id),
        "voice_samples": voice_samples(story, char_id),
    }


# ---------------------------------------------------------------------------
# THE CONSTRAINT SET
# ---------------------------------------------------------------------------

def forbidden_facts(story: Dict[str, Any], char_id: str) -> Dict[str, Any]:
    """
    The payload the writer is constrained by and the validator checks against.

    Both sides live in one object on purpose. The leakage check needs the forbidden
    list; the crossing check needs the allowed list with `what_happened` verbatim.
    Computed separately they could be built for different characters and nothing
    would notice.

    `brief.py` and `validation/checks.py` both import this rather than deriving it,
    so the fail-closed rule exists in exactly one place — `blind()`, above.
    """
    hidden_ids = {b["beat_id"] for b in explicitly_hidden(story, char_id)}
    forbidden = [
        {"beat_id": b["beat_id"], "ep": b["ep"], "world_time": b.get("world_time"),
         "location": b.get("location"), "fact": b["what_happened"],
         "emphasised": b["beat_id"] in hidden_ids}
        for b in blind(story, char_id)
    ]
    allowed = [
        {"beat_id": b["beat_id"], "ep": b["ep"], "world_time": b.get("world_time"),
         "location": b.get("location"), "fact": b["what_happened"]}
        for b in knows(story, char_id)
    ]
    return {
        "story_id": story["story_id"], "char_id": char_id,
        "n_beats": len(story["beats"]),
        "allowed": allowed, "forbidden": forbidden,
        "allowed_ids": [a["beat_id"] for a in allowed],
        "forbidden_ids": [f["beat_id"] for f in forbidden],
    }
