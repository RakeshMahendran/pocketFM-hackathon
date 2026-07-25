"""
Commission a story: season plan, then scripts.

    python tasks.py commission --event evt_poyais_1822

Two stages that always run together. `score` turns a candidate into a season
plan; `serial` writes the episodes from it. Separately they are two commands an
editor has to know the order of, which is not a thing an editor should have to
know.

Progress is written to `data/commissions/<event_id>.json` after every step. The
console reads that file rather than holding a request open for the several
minutes this takes — a button that blocks until a dozen model calls finish is a
button that appears broken.
"""

import sys
import json
import datetime as dt
import argparse
import traceback
from typing import Any, Dict, Optional, Sequence

from src.util import DATA, ensure_dirs, load_env, log

COMMISSIONS = DATA / "commissions"

# Ordered, because the second reads what the first writes.
STEPS = [
    ("planning", "Working out the season"),
    ("writing", "Writing the episodes"),
]


def status_path(event_id: str):
    return COMMISSIONS / f"{event_id}.json"


def read_status(event_id: str) -> Optional[Dict[str, Any]]:
    path = status_path(event_id)
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        # A half-written status file is not a reason to lose the run; the next
        # write replaces it.
        return None


def write_status(event_id: str, **fields: Any) -> Dict[str, Any]:
    COMMISSIONS.mkdir(parents=True, exist_ok=True)
    state = read_status(event_id) or {"event_id": event_id, "history": []}
    state.update(fields)
    state["updated_at"] = dt.datetime.now(dt.timezone.utc).isoformat()
    status_path(event_id).write_text(
        json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return state


def run(event_id: str, story_id: Optional[str] = None,
        language: str = "en", episodes: Optional[int] = None) -> int:
    """
    Plan then write. Returns a process exit code.

    Each stage is invoked through its own `main()` rather than a subprocess, so
    a failure arrives as an exception with a message rather than an exit code
    with none.
    """
    from src.scoring import run as scoring
    from src.generation import serial as generation

    story = story_id or event_id
    write_status(
        event_id,
        state="running",
        step="planning",
        label=dict(STEPS)["planning"],
        story_id=story,
        started_at=dt.datetime.now(dt.timezone.utc).isoformat(),
        error=None,
    )

    try:
        log(f"commission {event_id}: working out the season")
        plan_argv = ["--event", event_id]
        if episodes is not None:
            plan_argv += ["--episodes", str(episodes)]
        if scoring.main(plan_argv) != 0:
            raise RuntimeError(
                "the season plan could not be written — see the log above for "
                "which check refused it"
            )

        # The id that arrives here identifies a *corpus row* — a hash of its
        # source URL. The planner mints its own `event_id` for the dossier it
        # writes, and that is what the writer looks the dossier up by. Passing
        # the corpus id straight through finds nothing.
        from src.util import DOSSIERS_PATH, read_json

        written = read_json(DOSSIERS_PATH)
        if not written:
            raise RuntimeError("the planner wrote no season plan to work from")
        dossier_event = written[-1].get("event_id")
        if not dossier_event:
            raise RuntimeError("the season plan has no event id to write against")
        planned = len(written[-1].get("season") or [])
        write_status(
            event_id,
            dossier_event_id=dossier_event,
            step="writing",
            label=dict(STEPS)["writing"],
            # Known as soon as the plan exists, so the screen can say "of 14"
            # from the moment writing starts rather than counting up blind.
            total_episodes=planned,
            progress=None,
        )

        log(f"commission {event_id}: writing {planned} episodes")

        def on_progress(info: Dict[str, Any]) -> None:
            write_status(event_id, progress=info)

        generation.produce(
            dossier_event, story_id=story, language=language,
            on_progress=on_progress,
        )

    except Exception as exc:  # noqa: BLE001 - the message is the product here
        # The reader is an editor watching a progress screen, so the message has
        # to survive to them. The traceback goes to the log for whoever runs it.
        log(traceback.format_exc(), "debug")
        write_status(event_id, state="failed", error=str(exc))
        log(f"commission {event_id} failed: {exc}", "error")
        return 1

    write_status(
        event_id,
        state="done",
        step="done",
        label="Ready",
        finished_at=dt.datetime.now(dt.timezone.utc).isoformat(),
    )
    log(f"commission {event_id}: done -> data/stories/{story}")
    return 0


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        prog="tasks.py commission",
        description="Turn a cleared story into a written season.",
    )
    parser.add_argument("--event", required=True, help="corpus item id or title fragment")
    parser.add_argument("--story", default=None, help="directory under data/stories")
    parser.add_argument("--language", default="en", choices=["en", "hi-en"])
    parser.add_argument("--episodes", type=int, default=None, metavar="N",
                        help="how many episodes to order (default 14)")
    args = parser.parse_args(argv)

    load_env()
    ensure_dirs()
    return run(args.event, args.story, args.language, args.episodes)


if __name__ == "__main__":
    sys.exit(main())
