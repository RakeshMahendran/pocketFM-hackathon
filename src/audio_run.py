"""
Record one episode, and say how far it has got.

    python tasks.py audio_run --story story1_denied_identity --ep 1

`src/audio/build.py` already does the work — convert, direct, synthesise, spot
effects, master. What it does not do is report progress anywhere a web page can
read, and recording an episode takes minutes. The console needs the same thing
`src/commission.py` and `src/spinoff_run.py` needed: a status file to poll, so a
button does not sit there looking broken.

Progress is inferred from what `build` actually logs, not from a schedule
invented here. It prints little — a line when the dialogue is mixed, a line when
the file is written — so the steps below are coarse on purpose. Three honest
stages beat five fictional ones: a bar that claims to know it is 60% done, when
nothing measured that, is a worse lie than a bar that says "voicing".

The last line the build logged is carried on the status as `detail`, so a run
that stalls shows where rather than just spinning.
"""

import os
import re
import sys
import json
import time
import argparse
import datetime as dt
import subprocess
from typing import Any, Dict, Optional, Sequence

from src.util import DATA, ROOT, ensure_dirs, load_env, log

RUNS = DATA / "audio_runs"

# Ordered. `converting` covers everything up to the first clip being asked for,
# which includes the director; the model call is inside it and it is quick
# relative to synthesis.
STEPS = [
    ("converting", "Reading the script and deciding the performance"),
    ("voicing", "Recording the lines"),
    ("mastering", "Laying the effects and levelling it"),
]

# What a log line means, in the order we look for it. `build` writes these; if
# it stops writing them the run still completes, it just reports one stage.
MARKERS = (
    (re.compile(r"dialogue mixed", re.I), "mastering"),
    (re.compile(r"synthesis|voicing|clip|line\s+\d+", re.I), "voicing"),
)

SAFE_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")


def _key(story_id: str, ep: int) -> str:
    if not SAFE_ID.match(story_id or "") or "__" in story_id:
        raise ValueError(f"story id is not usable in a filename: {story_id!r}")
    if ep < 1:
        raise ValueError(f"there is no episode {ep}")
    return f"{story_id}__ep{ep:02d}"


def status_path(story_id: str, ep: int):
    return RUNS / f"{_key(story_id, ep)}.json"


def read_status(story_id: str, ep: int) -> Optional[Dict[str, Any]]:
    try:
        path = status_path(story_id, ep)
    except ValueError:
        return None
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def write_status(story_id: str, ep: int, **fields: Any) -> Dict[str, Any]:
    ensure_dirs()
    RUNS.mkdir(parents=True, exist_ok=True)
    state = read_status(story_id, ep) or {"story_id": story_id, "ep": ep}
    state.update(fields)
    state["updated_at"] = dt.datetime.now(dt.timezone.utc).isoformat()
    status_path(story_id, ep).write_text(
        json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return state


def recordings(story_id: str, ep: int) -> list:
    """The mp3s already on disk for this episode, if any."""
    audio = DATA / "stories" / story_id / "audio"
    if not audio.is_dir():
        return []
    tail = f"_ep{ep:02d}"
    return sorted(
        p.name for p in audio.iterdir()
        if p.is_file() and p.suffix == ".mp3"
        and (p.stem.endswith(tail) or f"{tail}_" in p.stem)
    )


def replay(story_id: str, ep: int, language: Optional[str] = None,
           pause: float = 0.7) -> int:
    """
    Walk the three stages against a recording already on disk, synthesising
    nothing.

    Recording an episode is minutes of synthesis and real credits. Doing that to
    arrive at a file that is already there is waste anywhere and dead air on a
    stage. Nothing is generated, nothing is written, and the mp3 at the end is
    the one that was always there.

    It refuses when there is no recording rather than miming one — a progress
    bar over nothing is the only thing here that would be a lie.
    """
    have = recordings(story_id, ep)
    if not have:
        write_status(
            story_id, ep, state="failed", step="voicing", replayed=True,
            error=("This episode has not been recorded, so there is nothing to "
                   "replay. Recording it is the button that costs credits."),
            finished_at=dt.datetime.now(dt.timezone.utc).isoformat(),
        )
        log(f"nothing to replay for {story_id} ep{ep}", "error")
        return 1

    labels = dict(STEPS)
    write_status(
        story_id, ep, state="running", step="converting",
        label=labels["converting"], language=language, replayed=True,
        detail=None, error=None,
        started_at=dt.datetime.now(dt.timezone.utc).isoformat(),
    )
    for step in ("voicing", "mastering"):
        time.sleep(pause)
        write_status(story_id, ep, step=step, label=labels[step])
    time.sleep(pause)
    write_status(
        story_id, ep, state="done", step="done", label="Recorded",
        detail=f"already recorded: {have[0]}",
        finished_at=dt.datetime.now(dt.timezone.utc).isoformat(),
    )
    log(f"replayed {story_id} ep{ep} — nothing was synthesised")
    return 0


def run(story_id: str, ep: int, language: Optional[str] = None) -> int:
    """Record one episode, writing progress as it goes. Returns an exit code."""
    labels = dict(STEPS)
    write_status(
        story_id, ep,
        state="running", step="converting", label=labels["converting"],
        language=language, detail=None, error=None,
        started_at=dt.datetime.now(dt.timezone.utc).isoformat(),
    )

    argv = [sys.executable, "-m", "src.audio.build", "--story", story_id,
            "--ep", str(ep)]
    if language:
        argv += ["--language", language]

    env = dict(os.environ)
    # Without this the child encodes stderr in the Windows console codepage and
    # every em dash in a message arrives as a replacement character.
    env.setdefault("PYTHONIOENCODING", "utf-8")

    tail: list = []
    step = "converting"
    try:
        proc = subprocess.Popen(
            argv, cwd=str(ROOT), env=env,
            stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
            text=True, encoding="utf-8", errors="replace", bufsize=1,
        )
        # Read as it goes rather than after it ends: the whole point of the file
        # is that somebody is watching while this runs.
        for raw in proc.stderr or ():
            line = raw.rstrip()
            if not line:
                continue
            tail.append(line)
            del tail[:-40]
            for pattern, name in MARKERS:
                if pattern.search(line) and name != step:
                    step = name
                    write_status(story_id, ep, step=step, label=labels[step])
                    break
            write_status(story_id, ep, detail=_said(line))
        code = proc.wait()
    except OSError as exc:
        write_status(story_id, ep, state="failed", error=str(exc),
                     finished_at=dt.datetime.now(dt.timezone.utc).isoformat())
        log(str(exc), "error")
        return 1

    if code != 0:
        write_status(
            story_id, ep, state="failed", error=_last_error(tail),
            finished_at=dt.datetime.now(dt.timezone.utc).isoformat(),
        )
        log(f"recording episode {ep} of {story_id} failed", "error")
        return 1

    write_status(
        story_id, ep, state="done", step="done", label="Recorded",
        finished_at=dt.datetime.now(dt.timezone.utc).isoformat(),
    )
    log(f"{story_id} episode {ep} recorded")
    return 0


def _said(line: str) -> str:
    """A log line without the timestamp and level a producer has no use for."""
    return re.sub(r"^\[[\d:]+\]\s*\w+\s+", "", line).strip()


def _last_error(tail: Sequence[str]) -> str:
    for line in reversed(list(tail)):
        if "ERROR" in line:
            return _said(line)
    return _said(tail[-1]) if tail else "the recording stopped without saying why"


def main(argv: Optional[Sequence[str]] = None) -> int:
    load_env()
    parser = argparse.ArgumentParser(
        prog="tasks.py audio_run",
        description="Record one episode and report progress to the console.",
    )
    parser.add_argument("--story", required=True)
    parser.add_argument("--ep", type=int, default=1)
    parser.add_argument("--language", default=None,
                        choices=["en", "hi-en", "hi", "ta", "ta-en"])
    parser.add_argument("--replay", action="store_true",
                        help="walk the stages against a recording already on "
                             "disk, synthesising nothing")
    args = parser.parse_args(argv)
    if args.replay:
        return replay(args.story, args.ep, args.language)
    return run(args.story, args.ep, args.language)


if __name__ == "__main__":
    sys.exit(main())
