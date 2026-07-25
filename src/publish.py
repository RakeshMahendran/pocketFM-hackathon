"""
Put a season in front of listeners, or refuse to.

    python tasks.py publish --story a3c321dba0a7 --by priya

Writing a season and deciding it can go out are different acts, and only the
second one is a person's. Until this existed there was no difference on disk
between what the machine produced and what an editor had stood behind.

The refusal is the point. A season whose beat sheet has fatal problems cannot be
published — not by an editor, not by anyone — for the same reason a `blocked`
story cannot be commissioned: continuity is the thing this product sells, and a
guarantee that can be waived under deadline is not a guarantee. Advisories are
shown and do not block, because they are the ones only a human reading the prose
can settle.

There is no Pocket FM API to push to. This records the decision and flips the
state; it does not put anything in an app, and the console says so rather than
implying otherwise.
"""

import sys
import json
import pathlib
import argparse
import datetime as dt
from typing import Any, Dict, List, Optional, Sequence, Tuple

from src.util import DATA, log
from src.scoring.validate import load_story, validate_output

STORIES = DATA / "stories"


def state_path(story_id: str) -> pathlib.Path:
    return STORIES / story_id / "publish.json"


def read_state(story_id: str) -> Optional[Dict[str, Any]]:
    path = state_path(story_id)
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def check(story_id: str) -> Tuple[List[str], List[str]]:
    """Grade a season on disk. `(fatal, advisory)`, same contract as the writer's."""
    story_dir = STORIES / story_id
    if not story_dir.is_dir():
        raise RuntimeError(f"no season at {story_dir}")
    dossier, beats = load_story(story_dir)
    return validate_output(dossier, beats)


def publish(story_id: str, by: Optional[str] = None) -> Dict[str, Any]:
    """
    Publish, or raise saying why not.

    The check runs against what is on disk right now rather than trusting a
    result recorded when the season was written — a season can be edited by hand
    afterwards, and this is the last gate before listeners.
    """
    fatal, advisory = check(story_id)

    if fatal:
        for note in fatal:
            log(f"FATAL {note}", "error")
        raise RuntimeError(
            f"{story_id} cannot be published: {len(fatal)} continuity "
            f"problem{'' if len(fatal) == 1 else 's'}. {fatal[0]}"
        )

    for note in advisory:
        log(f"advisory {note}", "warn")

    state = {
        "story_id": story_id,
        "state": "live",
        "by": by,
        "at": dt.datetime.now(dt.timezone.utc).isoformat(),
        # Kept with the decision: what was known about the season at the moment
        # someone stood behind it.
        "advisory_at_publish": advisory,
    }
    path = state_path(story_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
    log(f"{story_id} is live" + (f", published by {by}" if by else ""))
    return state


def unpublish(story_id: str) -> None:
    """Back to draft. Pulling something is never gated — only shipping is."""
    path = state_path(story_id)
    if path.exists():
        path.unlink()
        log(f"{story_id} is back to draft")


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        prog="tasks.py publish",
        description="Publish a written season, if its continuity checks pass.",
    )
    parser.add_argument("--story", required=True, help="directory under data/stories")
    parser.add_argument("--by", default=None, help="who is publishing it")
    parser.add_argument("--check", action="store_true",
                        help="report the checks without publishing")
    parser.add_argument("--unpublish", action="store_true", help="return it to draft")
    args = parser.parse_args(argv)

    try:
        if args.unpublish:
            unpublish(args.story)
            return 0

        if args.check:
            fatal, advisory = check(args.story)
            for note in fatal:
                log(f"FATAL {note}", "error")
            for note in advisory:
                log(f"advisory {note}", "warn")
            log(f"{args.story}: {len(fatal)} fatal, {len(advisory)} advisory")
            return 1 if fatal else 0

        publish(args.story, args.by)
    except (RuntimeError, ValueError, KeyError, json.JSONDecodeError) as exc:
        log(str(exc), "error")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
