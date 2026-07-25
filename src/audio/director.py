"""
Review the performance before it is recorded.

    python -m src.audio.director --story story1_denied_identity --ep 1

The writer marks how each line should be said while it writes — it knows, because
it chose. But it tags line 3 before it has written line 26, so it cannot
calibrate an opening against an ending it has not reached.

The director can. It reads the finished episode and the writer's marks together,
and changes what the whole-episode view says is wrong. That is review, not a
second guess: working from finished prose with no access to intent is the lossy
direction, and this stage is given both.

Every change comes back with a reason, so what the second pass was worth is
inspectable rather than assumed.
"""

import os
import sys
import json
import pathlib
import argparse
from typing import Any, Dict, List

from src.util import DATA, log, read_json, write_json
from src.discovery.cache import save_raw
from src.audio.tag import EMOTIONS, PACES, check

STORIES = DATA / "stories"
PROMPTS = pathlib.Path(__file__).resolve().parent / "prompts"

DIRECTION_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["lines"],
    "properties": {
        "lines": {"type": "array", "items": {
            "type": "object",
            "additionalProperties": False,
            "required": ["line_id", "emotion", "intensity", "pace", "bgm_cue",
                         "pause_after_ms", "changed_because"],
            "properties": {
                "line_id": {"type": "string"},
                "emotion": {"type": "string", "enum": EMOTIONS},
                "intensity": {"type": "number"},
                "pace": {"type": "string", "enum": PACES},
                "bgm_cue": {"type": "string", "enum": EMOTIONS},
                # Read by audio_post and set by no other stage.
                "pause_after_ms": {"type": "integer"},
                # Empty when the writer's mark was left alone. The record of what
                # a second pass bought.
                "changed_because": {"type": "string"},
            }}},
    },
}

DIRECTED = "directed"


def _model() -> str:
    return (os.environ.get("OPENAI_MODEL_WRITER")
            or os.environ.get("OPENAI_MODEL_SCORER")
            or "gpt-5.6-sol")


def _episode_for_review(episode: Dict[str, Any]) -> str:
    """The script and the writer's marks side by side, as a director reads them."""
    rows = []
    for l in episode["lines"]:
        rows.append(
            f"{l['line_id']}  {l['speaker'].upper():12s} "
            f"[{l.get('emotion', 'neutral')} {l.get('intensity', 0.5)} "
            f"{l.get('pace', 'normal')} | bed {l.get('bgm_cue', '-')}]\n"
            f"      {l['text']}")
    return "\n".join(rows)


def review(episode: Dict[str, Any], story: str, ep: int,
           client: Any = None) -> Dict[str, Dict[str, Any]]:
    """
    A tool loop, not a single call.

    Whether this episode is the climb, the dip or the scalp depends on the ones
    around it — and which neighbours matter depends on what the director finds
    here. That is the test for a tool: the query cannot be written in advance.
    Handing over a pre-flattened summary of the season would be guessing which
    questions it was going to ask.
    """
    if client is None:
        from openai import OpenAI
        client = OpenAI()

    from src.agent import run as run_agent
    from src.audio.season_tools import tools_for

    system = (PROMPTS / "director.md").read_text(encoding="utf-8")
    user = (f"Episode {ep} of {episode.get('title', '?')}\n"
            f"{len(episode['lines'])} lines. The writer's marks are in brackets.\n\n"
            f"{_episode_for_review(episode)}")

    result = run_agent(client, _model(), system, user, tools_for(story),
                       DIRECTION_SCHEMA, schema_name="direction")
    return {d["line_id"]: d for d in result["lines"]}


def apply(story: str, ep: int, force: bool = False) -> pathlib.Path:
    path = STORIES / story / "audio" / f"ep{ep:02d}.json"
    if not path.exists():
        raise RuntimeError(f"no {path.name} — convert the script first")

    episode = read_json(path)
    if episode.get(DIRECTED) and not force:
        log("already directed — pass --force to review again", "warn")
        return path

    untagged = sum(1 for l in episode["lines"] if l.get("emotion", "neutral") == "neutral")
    if untagged == len(episode["lines"]):
        log("nothing to review — the writer left every line neutral. Run "
            "`python -m src.audio.tag` to direct it from scratch instead.", "warn")

    directed = review(episode, story, ep)
    missing = [l["line_id"] for l in episode["lines"] if l["line_id"] not in directed]
    if missing:
        raise RuntimeError(f"director skipped {len(missing)} lines: {missing[:5]}")

    changes = []
    for line in episode["lines"]:
        d = directed[line["line_id"]]
        was = (line.get("emotion"), line.get("intensity"), line.get("pace"))
        line["emotion"] = d["emotion"]
        line["intensity"] = round(min(1.0, max(0.0, float(d["intensity"]))), 2)
        line["pace"] = d["pace"]
        line["bgm_cue"] = d["bgm_cue"]
        if d.get("pause_after_ms"):
            line["pause_after_ms"] = int(d["pause_after_ms"])
        now = (line["emotion"], line["intensity"], line["pace"])
        if was != now and d.get("changed_because"):
            changes.append(f"  {line['line_id']}  {was[0]} {was[1]} -> "
                           f"{now[0]} {now[1]}  ({d['changed_because']})")

    episode[DIRECTED] = True
    write_json(path, episode)

    log(f"reviewed {len(episode['lines'])} lines, changed {len(changes)}")
    for c in changes[:12]:
        log(c)
    if not changes:
        log("the director left every line as written — a real answer, and the "
            "cheapest one")
    for problem in check(episode):
        log(problem, "warn")

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
