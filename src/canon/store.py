"""
Loading a delivered serial.

`data/stories/<story_id>/` is frozen input produced upstream — this module reads it
and never writes it. One story is 176 KB and loads in ~2 ms including every script,
which is why there is no database, no memoisation and no index to invalidate. A
list comprehension over 46 beats is the query.

The only thing this module enforces is that a story can be *trusted* to be queried:
beat ids are unique, and beats come back in one deterministic order.
"""

import re
import pathlib
from typing import Any, Dict, List, Optional

from src.util import STORIES, log, read_json

DEFAULT_STORY = "story1_denied_identity"
DEFAULT_CHAR = "ratnamma"

_EPISODE_RE = re.compile(r"ep(\d+)\.md$")


def story_ids(root: Optional[pathlib.Path] = None) -> List[str]:
    """
    Every directory under `data/stories/` that is actually a story.

    Filtered on the contract rather than on a naming convention: intermediate
    artefacts get left in that directory during generation runs, and a half
    delivered story must not half-load.
    """
    root = pathlib.Path(root or STORIES)
    if not root.exists():
        return []
    return sorted(
        d.name for d in root.iterdir()
        if d.is_dir() and (d / "dossier.json").exists() and (d / "beats.json").exists()
    )


def load_story(story_id: str, root: Optional[pathlib.Path] = None) -> Dict[str, Any]:
    """
    A story as a plain dict: dossier, ordered beats, cast, and lookup indexes.

    Episode scripts are deliberately not read here. They are needed for exactly one
    thing — verbatim voice samples — and only for the handful of episodes a given
    character appears in. See `episode_text`.
    """
    base = pathlib.Path(root or STORIES) / story_id
    if not base.exists():
        raise RuntimeError(
            f"no story at {base}. Known stories: {', '.join(story_ids(root)) or 'none'}"
        )

    dossier = read_json(base / "dossier.json")
    beats_file = read_json(base / "beats.json")
    # The delivered file wraps the list; a hand-written fixture may not.
    beats = beats_file["beats"] if isinstance(beats_file, dict) else beats_file

    # File order is not a contract. `(ep, seq)` is the only ordering spine that
    # works across all four stories — `world_time` cannot be parsed, see views.py.
    beats = sorted(beats, key=lambda b: (b["ep"], b["seq"]))

    cast = dossier.get("cast", [])
    story = {
        "story_id": story_id,
        "path": base,
        "event_id": dossier.get("event_id", story_id),
        "dossier": dossier,
        "beats": beats,
        "cast": cast,
        "cast_index": {c["char_id"]: c for c in cast},
        "beat_index": {b["beat_id"]: b for b in beats},
    }

    _check_beat_ids(story)
    _warn_on_strays(story)
    return story


def _check_beat_ids(story: Dict[str, Any]) -> None:
    """
    A duplicate `beat_id` is fatal.

    `forbidden_facts` is a set of beat ids and the validator asks whether a citation
    is in it. If two beats share an id, one of them is invisible to that question
    and the guarantee silently stops covering it.
    """
    beats = story["beats"]
    if len(story["beat_index"]) != len(beats):
        seen, dupes = set(), []
        for b in beats:
            if b["beat_id"] in seen:
                dupes.append(b["beat_id"])
            seen.add(b["beat_id"])
        raise RuntimeError(
            f"{story['story_id']}: duplicate beat_id {sorted(set(dupes))} — "
            "character views cannot be trusted until this is fixed"
        )


def _warn_on_strays(story: Dict[str, Any]) -> None:
    """
    Ids in beat arrays that are not cast members.

    `episode.md` forbids these and says nothing downstream can detect them. Two of
    the four delivered stories carry them anyway — story2 has "the bench" and
    "two hundred candidates", story4 has "corridor queue". Fail-closed `blind`
    keeps this safe (a stray witness means nobody in the cast learned anything),
    so this warns rather than raises. It is how an operator finds out why a count
    looks wrong, and it must never be "fixed" by folding stray ids into the cast.
    """
    known = set(story["cast_index"])
    strays = set()
    for b in story["beats"]:
        for field in ("present", "witnessed_by", "hidden_from"):
            strays |= {x for x in b.get(field, []) if x not in known}
    if strays:
        log(f"{story['story_id']}: {len(strays)} id(s) in beats are not in the cast "
            f"({', '.join(sorted(strays)[:6])}{'…' if len(strays) > 6 else ''}) — "
            "they can never know anything, which is the safe reading", "warn")


def episode_text(story: Dict[str, Any], ep: int) -> str:
    """One episode script, or '' if the story shipped without it."""
    path = story["path"] / "episodes" / f"ep{ep:02d}.md"
    return path.read_text(encoding="utf-8") if path.exists() else ""


def episode_numbers(story: Dict[str, Any]) -> List[int]:
    eps = story["path"] / "episodes"
    if not eps.exists():
        return []
    return sorted(int(m.group(1)) for f in eps.iterdir()
                  if (m := _EPISODE_RE.search(f.name)))


def get_beat(story: Dict[str, Any], beat_id: str) -> Dict[str, Any]:
    beat = story["beat_index"].get(beat_id)
    if beat is None:
        known = list(story["beat_index"])
        raise RuntimeError(
            f"no beat {beat_id} in {story['story_id']} "
            f"({known[0]}…{known[-1]}, {len(known)} beats)"
        )
    return beat


def get_char(story: Dict[str, Any], char_id: str) -> Dict[str, Any]:
    char = story["cast_index"].get(char_id)
    if char is None:
        raise RuntimeError(
            f"no character {char_id} in {story['story_id']}. "
            f"Cast: {', '.join(sorted(story['cast_index']))}"
        )
    return char


def speaker_tokens(char: Dict[str, Any]) -> List[str]:
    """
    Candidate script labels for one cast member, best guess first.

    Scripts are `SPEAKER: line`. In story1 the cast carries single names and
    uppercasing is enough — 16 of 17 map exactly. A later story cast people as
    "Agnes Murray" and "Osric Bell" while the scripts say `AGNES:` and `BELL:`,
    so a single rule cannot cover both.

    Returned as candidates rather than one answer because only the caller has the
    script to check against. Kept here so the voice extractor and anything that
    follows cannot disagree about what a speaker label is.
    """
    name = char.get("name", "") or ""
    parts = name.split()
    seen, out = set(), []
    for token in (name, char.get("char_id", ""), *parts):
        upper = token.upper().strip()
        if upper and upper not in seen:
            seen.add(upper)
            out.append(upper)
    return out
