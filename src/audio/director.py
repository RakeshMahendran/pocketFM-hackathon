"""
Review the performance before it is recorded.

    python -m src.audio.director --story story1_denied_identity --ep 1

The writer returns `{speaker, text, sfx_cue}`. How a line is PERFORMED is not
its call: it would be tagging line 3 before writing line 26, unable to calibrate
an opening against an ending it has not reached. So emotion, intensity, pace,
bed and pause are decided here, with the finished episode in hand.

That makes this stage the only source of direction, not a second opinion. An
episode that reaches synthesis without it is `neutral 0.5` on every line, which
is not neutral — it is flat, and the same number drives the read, the bed and
the line's own level in the mix.

Seasons written before the writer's schema changed carry their own tags. Those
are reviewed rather than authored, and every change comes back with a reason.
"""

import os
import re
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
            "required": ["line_id", "spoken", "emotion", "intensity", "pace",
                         "bgm_cue", "music_cue", "pause_after_ms",
                         "changed_because"],
            "properties": {
                "line_id": {"type": "string"},
                # The line as it should be performed. bulbul:v3 infers emotion
                # from the text and has no parameter that carries it, so this is
                # the only channel that reaches the read. Same words, always —
                # `_rewords` rejects anything else.
                "spoken": {"type": "string"},
                "emotion": {"type": "string", "enum": EMOTIONS},
                "intensity": {"type": "number"},
                "pace": {"type": "string", "enum": PACES},
                "bgm_cue": {"type": "string", "enum": EMOTIONS},
                # The hits the bed cannot make. Empty on almost every line —
                # see src/audio/music.py.
                "music_cue": {"type": "string",
                              "enum": ["", "sting", "drop", "swell", "button"]},
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


# Fillers the director may insert. Sarvam's guidance names them as the thing
# that makes a read conversational rather than recited, and they carry no
# meaning a listener could contradict the script with.
FILLERS = {"um", "uh", "hmm", "mm", "arre", "achha", "haan", "na", "matlab", "toh"}

# Apostrophes are part of the word. Splitting `Don't` into `don` + `t` makes a
# stammer two tokens long, and the repeated-word rule below then reads
# "Don't… don't" as a rewrite.
_WORD = re.compile(r"[^\W\d_]+(?:['’][^\W\d_]+)*", re.UNICODE)


def _words(text: str) -> List[str]:
    return [w for w in _WORD.findall(text.lower()) if w not in FILLERS]


def _rewords(original: str, spoken: str) -> bool:
    """
    True when `spoken` says something other than `original`.

    Punctuation, casing and inserted fillers are free — they are how prosody is
    controlled on a model that has no emotion parameter. So is a stammer: "I did
    not… I did not die near any canal" repeats a phrase the writer already wrote,
    which is a performance, not a rewrite.

    Everything else is refused. Dropping a clause, adding one, swapping a word or
    reordering two are all changes to what the character says, and the script and
    the canon beats would no longer agree with the audio.
    """
    from difflib import SequenceMatcher

    a, b = _words(original), _words(spoken)
    for op, i1, i2, j1, j2 in SequenceMatcher(None, a, b, autojunk=False).get_opcodes():
        if op == "equal":
            continue
        if op != "insert":
            # replace and delete both lose or alter the writer's words.
            return True
        # An insertion is allowed only when it repeats the words either side of
        # it — that is a stammer. Anything else is new material.
        added = b[j1:j2]
        n = len(added)
        if b[j1 - n:j1] != added and b[j2:j2 + n] != added:
            return True
    return False


def apply(story: str, ep: int, force: bool = False) -> pathlib.Path:
    path = STORIES / story / "audio" / f"ep{ep:02d}.json"
    if not path.exists():
        raise RuntimeError(f"no {path.name} — convert the script first")

    episode = read_json(path)
    if episode.get(DIRECTED) and not force:
        log("already directed — pass --force to review again", "warn")
        return path

    directed = review(episode, story, ep)
    missing = [l["line_id"] for l in episode["lines"] if l["line_id"] not in directed]
    if missing:
        raise RuntimeError(f"director skipped {len(missing)} lines: {missing[:5]}")

    changes, decided, reshaped, refused, scored = [], 0, 0, [], 0
    for line in episode["lines"]:
        d = directed[line["line_id"]]

        spoken = (d.get("spoken") or "").strip()
        if spoken and not _rewords(line["text"], spoken):
            if spoken != line["text"]:
                reshaped += 1
            line["spoken"] = spoken
        elif spoken:
            # The words are the writer's. A director quietly rewriting them
            # would drift the audio away from lines.json and from the beats,
            # and nothing downstream compares the two.
            refused.append(line["line_id"])

        was = (line.get("emotion"), line.get("intensity"), line.get("pace"))
        line["emotion"] = d["emotion"]
        line["intensity"] = round(min(1.0, max(0.0, float(d["intensity"]))), 2)
        line["pace"] = d["pace"]
        line["bgm_cue"] = d["bgm_cue"]
        if d.get("music_cue"):
            line["music_cue"] = d["music_cue"]
            scored += 1
        if d.get("pause_after_ms"):
            line["pause_after_ms"] = int(d["pause_after_ms"])
        now = (line["emotion"], line["intensity"], line["pace"])
        if was != now:
            decided += 1
            if d.get("changed_because"):
                changes.append(f"  {line['line_id']}  {was[0]} {was[1]} -> "
                               f"{now[0]} {now[1]}  ({d['changed_because']})")

    episode[DIRECTED] = True
    write_json(path, episode)

    # Two different numbers. Most lines arrive at the default `neutral 0.5`, and
    # setting one is authoring, which carries no `changed_because` — counting
    # only explained overrides reported 0 on an episode where 55 lines moved.
    log(f"directed {decided} of {len(episode['lines'])} lines, "
        f"{len(changes)} with a stated reason, {reshaped} re-punctuated, "
        f"{scored} scored")
    if refused:
        log(f"{len(refused)} rewordings refused — the words are the writer's: "
            f"{', '.join(refused[:6])}", "warn")
    for c in changes[:12]:
        log(c)
    if not decided and not reshaped:
        log("the director left every line as it arrived — on an undirected "
            "episode that is not a choice, it is a no-op", "warn")
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
