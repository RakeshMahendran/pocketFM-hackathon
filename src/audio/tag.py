"""
Direct the performance: emotion, intensity, pace and bed, per line.

    python -m src.audio.tag --story story1_denied_identity --ep 2

Untagged lines synthesise at `neutral 0.5`, which is not neutral — it is flat.
The same number drives the read, the music bed and the line's own level in the
mix, so an untagged episode goes slack in all three at once.

Tagging belongs at authoring time, with the writer that chose the register. This
stage exists because fourteen episodes were written before the writer emitted
tags, and regenerating them to add two fields would rewrite the prose. For new
work, prefer the `lines` block in `src/generation/prompts/episode.md`.
"""

import os
import sys
import json
import pathlib
import argparse
from typing import Any, Dict, List

from src.util import DATA, log, read_json, write_json
from src.discovery.cache import save_raw

STORIES = DATA / "stories"
PROMPTS = pathlib.Path(__file__).resolve().parent / "prompts"

EMOTIONS = ["neutral", "joy", "sorrow", "hurt_anger", "fear", "tenderness",
            "tension", "sarcasm", "hesitation", "urgency", "reflective",
            "relief", "longing"]
PACES = ["slow", "normal", "clipped", "fast"]

TAG_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["lines"],
    "properties": {
        "lines": {"type": "array", "items": {
            "type": "object",
            "additionalProperties": False,
            "required": ["line_id", "emotion", "intensity", "pace", "bgm_cue"],
            "properties": {
                "line_id": {"type": "string"},
                "emotion": {"type": "string", "enum": EMOTIONS},
                "intensity": {"type": "number"},
                "pace": {"type": "string", "enum": PACES},
                "bgm_cue": {"type": "string", "enum": EMOTIONS},
            }}},
    },
}


def _model() -> str:
    return (os.environ.get("OPENAI_MODEL_WRITER")
            or os.environ.get("OPENAI_MODEL_SCORER")
            or "gpt-5.6-sol")


def _script_for(episode: Dict[str, Any]) -> str:
    """The lines as the director reads them: who speaks, and what they say."""
    return "\n".join(
        f"{l['line_id']}  {l['speaker'].upper()}: {l['text']}"
        for l in episode["lines"])


def direct(episode: Dict[str, Any], client: Any = None) -> Dict[str, Dict[str, Any]]:
    if client is None:
        from openai import OpenAI
        client = OpenAI()

    system = (PROMPTS / "tag.md").read_text(encoding="utf-8")
    user = (f"Episode: {episode.get('title', '?')}\n\n"
            f"{_script_for(episode)}")

    response = client.responses.create(
        model=_model(),
        input=[{"role": "system", "content": system},
               {"role": "user", "content": user}],
        text={"format": {"type": "json_schema", "name": "tags",
                         "schema": TAG_SCHEMA, "strict": True}},
    )
    save_raw("tag", system + user, response)

    text = getattr(response, "output_text", "") or ""
    if not text.strip():
        raise RuntimeError(
            f"director returned nothing (status={getattr(response, 'status', '?')})")

    return {t["line_id"]: t for t in json.loads(text)["lines"]}


def check(episode: Dict[str, Any]) -> List[str]:
    """
    The failures that make an episode measure flat. Each one was seen for real:
    a bed that changed 19 times in 26 lines, and a first pass where every line
    came back 0.5.
    """
    lines = episode["lines"]
    problems = []

    intensities = [l.get("intensity", 0.5) for l in lines]
    if max(intensities) - min(intensities) < 0.4:
        problems.append(
            f"intensity spans only {min(intensities):.2f}-{max(intensities):.2f} "
            f"— the mix will be flat")

    neutral = sum(1 for l in lines if l.get("emotion") == "neutral")
    if neutral > len(lines) / 2:
        problems.append(f"{neutral} of {len(lines)} lines are neutral — undirected")

    beds = [l.get("bgm_cue") for l in lines if l.get("bgm_cue")]
    changes = sum(1 for a, b in zip(beds, beds[1:]) if a != b)
    if changes > 4:
        problems.append(f"the bed changes {changes} times — that is a slideshow, "
                        f"not a score")

    return problems


def apply(story: str, ep: int, force: bool = False) -> pathlib.Path:
    path = STORIES / story / "audio" / f"ep{ep:02d}.json"
    if not path.exists():
        raise RuntimeError(
            f"no {path.name} — run `python -m src.audio.script_to_episode "
            f"--story {story} --ep {ep}` first")

    episode = read_json(path)
    already = sum(1 for l in episode["lines"] if l.get("emotion") != "neutral")
    if already and not force:
        log(f"{already} lines already directed — pass --force to redo", "warn")
        return path

    tags = direct(episode)
    missing = [l["line_id"] for l in episode["lines"] if l["line_id"] not in tags]
    if missing:
        raise RuntimeError(f"director skipped {len(missing)} lines: {missing[:5]}")

    for line in episode["lines"]:
        t = tags[line["line_id"]]
        line["emotion"] = t["emotion"]
        line["intensity"] = round(min(1.0, max(0.0, float(t["intensity"]))), 2)
        line["pace"] = t["pace"]
        line["bgm_cue"] = t["bgm_cue"]

    for problem in check(episode):
        log(problem, "warn")

    write_json(path, episode)
    log(f"directed {len(episode['lines'])} lines")
    return path


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--story", required=True)
    ap.add_argument("--ep", type=int, default=1)
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    from src.util import load_env
    load_env()
    try:
        apply(args.story, args.ep, args.force)
    except RuntimeError as exc:
        log(str(exc), "error")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
