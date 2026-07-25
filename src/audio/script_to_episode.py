"""
Turn a written episode into the TTS pipeline's `episode.json`.

    python -m src.audio.script_to_episode --story story1_denied_identity --ep 1

The voice pipeline (SandhiyaGiri/PocketFmTtsPipeline) validates
`schemas/episode_schema.json` before it spends a credit, so everything it needs
has to be right here or the run fails free — which is the good case.

What this module can do mechanically: split SFX from dialogue, resolve speaker
labels to `char_id`s, carry the cast across, number the lines. What it cannot do
is decide `emotion` and `intensity`; those are authorial, and inferring them from
finished prose is the lossy direction. The writer should emit them — see the
`lines` block in `src/generation/prompts/episode.md`. Until it does, this fills
neutral defaults and says how many lines are untagged, so nobody mistakes a
flat read for a tagged one.
"""

import re
import sys
import json
import pathlib
import argparse
from typing import Any, Dict, List

from src.util import DATA, log, read_json, write_json
from src.audio.language import DEFAULT as DEFAULT_LANGUAGE, LINE_LANGUAGES

STORIES = DATA / "stories"

# The pipeline's enum. Anything outside it fails validation before synthesis.
EMOTIONS = ("neutral", "joy", "sorrow", "hurt_anger", "fear", "tenderness",
            "tension", "sarcasm", "hesitation", "urgency", "reflective",
            "relief", "longing")
PACES = ("slow", "normal", "clipped", "fast")

SPEAKER = re.compile(r"^([A-Z][A-Z' ]+):\s*(.+)$")
SFX = re.compile(r"^SFX:\s*(.+)$", re.IGNORECASE)
PARENTHETICAL = re.compile(r"^\((.*?)\)\s*")


def parse_script(text: str) -> List[Dict[str, str]]:
    """
    Markdown script to ordered utterances.

    An `SFX:` line is not a line of its own — the pipeline carries sound as an
    `sfx_cue` on the line that follows, so a cue is held and attached to the next
    spoken line. A cue with nothing after it is dropped, which is correct: the
    episode ends on a spoken button by construction.
    """
    out: List[Dict[str, str]] = []
    pending_sfx = None

    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue

        sfx = SFX.match(line)
        if sfx:
            pending_sfx = sfx.group(1).strip()
            continue

        m = SPEAKER.match(line)
        if not m:
            continue

        speaker, said = m.group(1).strip(), m.group(2).strip()
        note = ""
        paren = PARENTHETICAL.match(said)
        if paren:
            note, said = paren.group(1).strip(), said[paren.end():].strip()
        if not said:
            continue

        out.append({"speaker": speaker, "text": said,
                    "direction": note, "sfx_cue": pending_sfx or ""})
        pending_sfx = None

    return out


def _authored_lines(story_dir: pathlib.Path, ep: int) -> List[Dict[str, Any]]:
    """
    The writer's own lines for this episode.

    `serial.py` writes these to `lines.json` alongside `beats.json`, because the
    writer now returns structure rather than a script string. Parsing prose back
    apart was the old path, and a speaker label the regex did not recognise — a
    hyphenated role, a markdown bold, a title-case name — vanished from the audio
    with no warning.

    Empty for the four stories written before the schema changed; those still
    fall back to parsing their markdown.
    """
    path = story_dir / "lines.json"
    if not path.exists():
        return []
    doc = read_json(path)
    per_ep = doc.get(str(ep)) or doc.get(ep) if isinstance(doc, dict) else None
    if per_ep is not None:
        return per_ep
    lines = doc.get("lines", doc) if isinstance(doc, dict) else doc
    return [l for l in lines if int(l.get("ep", 0)) == ep]


def _from_authored(dossier: Dict[str, Any], ep: int,
                   authored: List[Dict[str, Any]], language: str) -> Dict[str, Any]:
    """Pass the writer's direction through rather than re-deriving it."""
    by_id = {c["char_id"]: c for c in dossier["cast"]}

    speaking, characters = [], []
    for line in authored:
        cid = line["speaker"]
        if cid in speaking:
            continue
        speaking.append(cid)
        if cid == "narrator":
            characters.append({"id": "narrator", "gender": "neutral",
                               "age_range": "40s",
                               "persona": "storyteller, withholding"})
        elif cid in by_id:
            characters.append({"id": cid, **_voice_hint(by_id[cid])})
        else:
            log(f"speaker '{cid}' is not in the cast — walk-on", "warn")
            characters.append({"id": cid, "persona": "minor role, one scene"})

    lines = []
    for i, l in enumerate(authored, start=1):
        line = {k: l[k] for k in ("speaker", "text", "emotion", "intensity", "pace")
                if k in l}
        line["line_id"] = l.get("line_id") or f"l{i:03d}"
        line["language"] = l.get("language") or language
        line.setdefault("emotion", "neutral")
        line.setdefault("intensity", 0.5)
        for optional in ("bgm_cue", "sfx_cue", "pause_after_ms"):
            if l.get(optional):
                line[optional] = l[optional]
        lines.append(line)

    return {
        "episode_id": f"{dossier['event_id']}_ep{ep:02d}",
        "series_id": dossier["event_id"],
        "title": f"{dossier['title']} — Episode {ep}",
        "characters": characters,
        "lines": lines,
    }


def _voice_hint(cast: Dict[str, Any]) -> Dict[str, str]:
    """
    What the casting resolver scores on.

    `gender` first — it is the strongest signal and the resolver will happily
    return a confident 1.0 without it, having matched persona prose and cast a
    young woman as a man. If the dossier does not carry one, say so loudly
    rather than guessing from a role description.
    """
    hint = {"persona": cast.get("role", "")[:80]}
    if cast.get("gender"):
        hint["gender"] = cast["gender"]
    else:
        log(f"cast '{cast.get('char_id')}' has no gender — casting will guess, "
            f"and casting locks for the whole series", "warn")
    if cast.get("age_range"):
        hint["age_range"] = cast["age_range"]
    return hint


def build(story: str, ep: int, language: str = None,
          previous: Dict[str, Any] = None) -> Dict[str, Any]:
    story_dir = STORIES / story
    dossier = read_json(story_dir / "dossier.json")

    # A language variant is a different script, not a translation of one — the
    # code-switching decides which half of each line is Hindi, and that is
    # writing, not conversion. `ep01.hi-en.md` beside `ep01.md` when it exists.
    variant = story_dir / "episodes" / f"ep{ep:02d}.{language}.md" if language else None
    source = variant if variant and variant.exists() else \
        story_dir / "episodes" / f"ep{ep:02d}.md"
    if variant and variant.exists():
        log(f"using the {language} script")
    script = source.read_text(encoding="utf-8")

    # The story's own language, not the shell's. An explicit --language overrides
    # it; nothing else does.
    language = language or dossier.get("language") or DEFAULT_LANGUAGE

    # The writer emits `lines` alongside the script — the same episode with its
    # direction, chosen while writing rather than inferred from the result. When
    # it is there it wins: re-parsing the markdown would throw away the writer's
    # own marks and hand a director a blank script.
    authored = _authored_lines(story_dir, ep)
    if authored:
        log(f"using {len(authored)} lines the writer directed")
        return _from_authored(dossier, ep, authored, language)

    # Emotion tagging is expensive human or model work. Rebuilding the file
    # because a line of prose changed must not silently discard it.
    kept = {l["line_id"]: l for l in (previous or {}).get("lines", [])}

    by_id = {c["char_id"]: c for c in dossier["cast"]}
    utterances = parse_script(script)

    # Only the characters who actually speak, plus the narrator. Casting is
    # resolved once per character and locked, so declaring the whole cast for
    # every episode pins voices for people who never appear.
    speaking = []
    for u in utterances:
        cid = u["speaker"].lower().replace(" ", "_")
        if cid not in speaking:
            speaking.append(cid)

    characters = []
    for cid in speaking:
        if cid == "narrator":
            characters.append({"id": "narrator", "gender": "neutral",
                               "age_range": "40s", "persona": "storyteller, withholding"})
            continue
        cast = by_id.get(cid)
        if not cast:
            log(f"speaker '{cid}' is not in the cast — walk-on, given a neutral voice", "warn")
            characters.append({"id": cid, "persona": "minor role, one scene"})
            continue
        characters.append({"id": cid, **_voice_hint(cast)})

    lines = []
    for i, u in enumerate(utterances, start=1):
        line = {
            "line_id": f"l{i:03d}",
            "speaker": u["speaker"].lower().replace(" ", "_"),
            "text": u["text"],
            # Story-level default. The writer may override per line — an English
            # rule quoted inside a Hindi scene is `en` even in a hi-en story, and
            # tagging it honestly is what keeps the accent from shifting.
            "language": u.get("language") or language,
            "emotion": "neutral",
            "intensity": 0.5,
        }
        if u["sfx_cue"]:
            line["sfx_cue"] = u["sfx_cue"]
        if u["direction"]:
            # Kept so a human tagging pass has the writer's own note to work from.
            line["_direction"] = u["direction"]

        # Carry forward tagging for any line whose text is unchanged. A line that
        # was rewritten loses its tags, which is correct — the register may have
        # changed with the words.
        old = kept.get(line["line_id"])
        if old and old.get("text") == line["text"]:
            for field in ("emotion", "intensity", "pace", "bgm_cue", "pause_after_ms"):
                if field in old:
                    line[field] = old[field]

        lines.append(line)

    suffix = f"_{language}" if language and language != dossier.get("language", "en") else ""
    return {
        "episode_id": f"{dossier['event_id']}_ep{ep:02d}{suffix}",
        # Namespaces casting. A spinoff MUST reuse the mainline series_id or the
        # same character is cast twice and speaks in two different voices — and
        # a language variant reuses it deliberately, so the same listener hears
        # the same chaitra in both.
        "series_id": dossier["event_id"],
        "title": f"{dossier['title']} — Episode {ep}",
        "characters": characters,
        "lines": lines,
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--story", required=True)
    ap.add_argument("--ep", type=int, default=1)
    ap.add_argument("--language", default=None, choices=LINE_LANGUAGES,
                    help="override the story's own language; rarely correct")
    ap.add_argument("--out", default=None)
    args = ap.parse_args()

    out = pathlib.Path(args.out) if args.out else (
        STORIES / args.story / "audio" / f"ep{args.ep:02d}.json")
    previous = read_json(out) if out.exists() else None

    episode = build(args.story, args.ep, args.language, previous)
    write_json(out, episode)

    untagged = sum(1 for l in episode["lines"] if l["emotion"] == "neutral")
    carried = sum(1 for l in episode["lines"] if l["emotion"] != "neutral")
    log(f"{len(episode['lines'])} lines, {len(episode['characters'])} voices, "
        f"language {episode['lines'][0]['language']}")
    if carried:
        log(f"carried {carried} existing emotion tags forward")
    if untagged:
        log(f"{untagged} lines are untagged neutral — they will read flat. "
            f"Emotion belongs to the writer, not to this converter.", "warn")
    return 0


if __name__ == "__main__":
    sys.exit(main())
