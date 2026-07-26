"""
Give one character their own show: work them up, write it, check it.

    python tasks.py spinoff_run --story story1_denied_identity --char ratnamma

Three stages an editor should not have to know the order of. `promote` turns a
character stub into a bible, `spinoff` writes an episode against what that
character knows, and the validator panel reads the result back looking for the
one thing that must never happen — the character demonstrating knowledge of a
beat they are blind to.

Progress is written to `data/spinoff_runs/<story>__<char>.json` after every
step, for the same reason `src/commission.py` does it: this takes minutes and a
button that blocks until a dozen model calls finish is a button that looks
broken. The console polls the file.

Promotion is skipped when a bible already exists. CLAUDE.md calls it "the one
expensive LLM call", and paying it again to produce a document already on disk
is the kind of thing that turns a demo into a bill.

Each stage runs as a subprocess rather than an imported `main()`. The three
modules belong to other tracks and parse `sys.argv` directly, so calling them
in-process would mean rewriting their entry points to accept an argv list —
a change to someone else's module to save a fork here is the wrong trade.
"""

import os
import re
import sys
import json
import time
import argparse
import datetime as dt
import subprocess
from typing import Any, Dict, List, Optional, Sequence, Tuple

from src.util import DATA, ROOT, ensure_dirs, load_env, log

RUNS = DATA / "spinoff_runs"

# Ordered, because each stage reads what the one before it wrote.
STEPS = [
    ("promoting", "Working the character up"),
    ("writing", "Writing their episode"),
    ("checking", "Checking it against the main show"),
]

# Ids are used to build a filename, so anything that could climb out of the
# directory is refused rather than sanitised. Silently rewriting an id would
# point the console at a run that is not the one it asked for.
SAFE_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")


def _key(story_id: str, char_id: str) -> str:
    """
    The filename stem for one run.

    `__` is refused inside either id, not just the path separators. It is the
    separator between them, so `("a__b", "c")` and `("a", "b__c")` would
    otherwise name the same file — one run silently reporting another's
    progress. Real ids use single underscores (`story1_denied_identity`), so
    nothing legitimate is turned away.
    """
    for value, what in ((story_id, "story"), (char_id, "character")):
        if not SAFE_ID.match(value or ""):
            raise ValueError(f"{what} id is not usable in a filename: {value!r}")
        if "__" in value:
            raise ValueError(f"{what} id may not contain '__': {value!r}")
    return f"{story_id}__{char_id}"


def status_path(story_id: str, char_id: str):
    return RUNS / f"{_key(story_id, char_id)}.json"


def read_status(story_id: str, char_id: str) -> Optional[Dict[str, Any]]:
    try:
        path = status_path(story_id, char_id)
    except ValueError:
        return None
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        # A half-written file is not a reason to lose the run. The next write
        # replaces it wholesale.
        return None


def write_status(story_id: str, char_id: str, **fields: Any) -> Dict[str, Any]:
    """Merge fields into the run's status file and stamp it."""
    ensure_dirs()
    RUNS.mkdir(parents=True, exist_ok=True)
    state = read_status(story_id, char_id) or {
        "story_id": story_id,
        "char_id": char_id,
    }
    state.update(fields)
    state["updated_at"] = dt.datetime.now(dt.timezone.utc).isoformat()
    status_path(story_id, char_id).write_text(
        json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return state


def has_bible(story_id: str, char_id: str) -> bool:
    return (DATA / "spinoffs" / f"{story_id}__{char_id}__bible.json").exists()


def _stage(argv: List[str]) -> Tuple[int, str]:
    """
    Run one stage. Returns its exit code and whatever it said.

    stderr is captured rather than inherited because the message on a failure is
    the only useful thing the console can show — an exit code alone tells an
    editor nothing they can act on.
    """
    env = dict(os.environ)
    # Without this the child encodes stderr in the Windows console codepage and
    # every em dash in a message arrives as a replacement character.
    env.setdefault("PYTHONIOENCODING", "utf-8")
    proc = subprocess.run(
        [sys.executable, "-m"] + argv,
        cwd=str(ROOT), env=env,
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    said = ((proc.stdout or "") + "\n" + (proc.stderr or "")).strip()
    return proc.returncode, said


def _last_error(said: str) -> str:
    """The most useful line of a failed stage's output."""
    lines = [ln.strip() for ln in said.splitlines() if ln.strip()]
    for line in reversed(lines):
        if "ERROR" in line:
            return line.split("ERROR", 1)[1].strip() or line
    return lines[-1] if lines else "the stage failed without saying why"


def existing_anchors(story_id: str, char_id: str) -> List[str]:
    """Anchors this character already has a constrained episode for, earliest first."""
    made = DATA / "spinoffs"
    if not made.is_dir():
        return []
    prefix = f"{story_id}__{char_id}__"
    found = []
    for path in made.iterdir():
        name = path.name
        if not name.startswith(prefix) or not name.endswith(".json"):
            continue
        rest = name[len(prefix):-len(".json")]
        # The leak twin, its verdict, the constrained verdict and the bible all
        # share the prefix. Only the bare anchor is an episode.
        if rest and "__" not in rest and rest != "bible":
            found.append(rest)
    return sorted(found)


def replay(story_id: str, char_id: str, anchor: Optional[str] = None,
           pause: float = 0.7) -> int:
    """
    Walk the three stages against work already on disk, without generating.

    For showing the pipeline without paying for it or waiting on it. The stages
    are the real ones and the episode at the end is the real committed one with
    its real verdict — nothing is invented and nothing is written.

    It refuses when there is no episode to replay rather than miming one. A
    progress bar over nothing is the only thing here that would actually be a
    lie, and this product is sold on not telling that kind.

    The status carries `replayed: true` so the console can say so. Callers must
    not present this as generation.
    """
    have = existing_anchors(story_id, char_id)
    if not have:
        write_status(
            story_id, char_id, state="failed", step="writing",
            replayed=True,
            error=("There is no episode on disk for this character, so there is "
                   "nothing to replay. Writing a new one is the button that "
                   "costs money."),
            finished_at=dt.datetime.now(dt.timezone.utc).isoformat(),
        )
        log(f"nothing to replay for {story_id}/{char_id}", "error")
        return 1

    target = anchor if anchor in have else have[0]
    labels = dict(STEPS)
    write_status(
        story_id, char_id,
        state="running", step="promoting", label=labels["promoting"],
        anchor=target, replayed=True, error=None,
        promotion_skipped=has_bible(story_id, char_id),
        started_at=dt.datetime.now(dt.timezone.utc).isoformat(),
    )
    for step in ("writing", "checking"):
        time.sleep(pause)
        write_status(story_id, char_id, step=step, label=labels[step])
    time.sleep(pause)
    write_status(
        story_id, char_id, state="done", step="done", label="Done",
        finished_at=dt.datetime.now(dt.timezone.utc).isoformat(),
    )
    log(f"replayed {story_id}/{char_id} at {target} — nothing was generated")
    return 0


def run(story_id: str, char_id: str, anchor: Optional[str] = None,
        episodes: Optional[int] = None) -> int:
    """Work the character up, write their episode, check it. Returns an exit code."""
    labels = dict(STEPS)
    started = dt.datetime.now(dt.timezone.utc).isoformat()

    skip_promotion = has_bible(story_id, char_id)
    write_status(
        story_id, char_id,
        state="running",
        step="writing" if skip_promotion else "promoting",
        label=labels["writing" if skip_promotion else "promoting"],
        anchor=anchor,
        started_at=started,
        error=None,
        # So the screen can say "already worked up" rather than implying a stage
        # was skipped because something went wrong.
        promotion_skipped=skip_promotion,
    )

    try:
        if not skip_promotion:
            log(f"spinoff {story_id}/{char_id}: working the character up")
            argv = ["src.generation.promote", "--story", story_id, "--char", char_id]
            if episodes is not None:
                argv += ["--episodes", str(episodes)]
            code, said = _stage(argv)
            if code != 0:
                raise RuntimeError(_last_error(said))

        write_status(story_id, char_id, step="writing", label=labels["writing"])
        log(f"spinoff {story_id}/{char_id}: writing their episode")
        argv = ["src.generation.spinoff", "--story", story_id, "--char", char_id]
        if anchor:
            argv += ["--anchor", anchor]
        code, said = _stage(argv)
        if code != 0:
            raise RuntimeError(_last_error(said))

        write_status(story_id, char_id, step="checking", label=labels["checking"])
        log(f"spinoff {story_id}/{char_id}: checking it against the main show")
        argv = ["src.validation.run", "--story", story_id, "--char", char_id]
        if anchor:
            argv += ["--anchor", anchor]
        # The panel exits non-zero when it FINDS something. That is the checker
        # working, not the run failing — a spinoff with a violation still has an
        # episode and a verdict to show, and hiding it behind an error page
        # would hide the one result this product exists to produce.
        code, said = _stage(argv)
        if code not in (0, 1):
            raise RuntimeError(_last_error(said))

        write_status(
            story_id, char_id,
            state="done", step="done", label="Done",
            finished_at=dt.datetime.now(dt.timezone.utc).isoformat(),
        )
        log(f"spinoff {story_id}/{char_id}: done")
        return 0

    except (RuntimeError, OSError, ValueError) as exc:
        write_status(
            story_id, char_id,
            state="failed",
            error=str(exc),
            finished_at=dt.datetime.now(dt.timezone.utc).isoformat(),
        )
        log(str(exc), "error")
        return 1


def main(argv: Optional[Sequence[str]] = None) -> int:
    load_env()
    parser = argparse.ArgumentParser(
        prog="tasks.py spinoff_run",
        description="Work a character up, write their episode, and check it.",
    )
    parser.add_argument("--story", required=True)
    parser.add_argument("--char", required=True)
    parser.add_argument("--anchor", default=None,
                        help="beat to start from; default is their top moment")
    parser.add_argument("--episodes", type=int, default=None)
    parser.add_argument("--replay", action="store_true",
                        help="walk the stages against an episode already on "
                             "disk, generating nothing. For showing the "
                             "pipeline without paying for it.")
    args = parser.parse_args(argv)
    if args.replay:
        return replay(args.story, args.char, args.anchor)
    return run(args.story, args.char, args.anchor, args.episodes)


if __name__ == "__main__":
    sys.exit(main())
