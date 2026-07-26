"""
Put a season in front of listeners, or refuse to.

    python tasks.py publish --story a3c321dba0a7 --by priya
    python tasks.py publish --story a3c321dba0a7 --episode 3 --by priya

Writing a season and deciding it can go out are different acts, and only the
second one is a person's. Until this existed there was no difference on disk
between what the machine produced and what an editor had stood behind.

The refusal is the point. A season whose beat sheet has fatal problems cannot be
published — not by an editor, not by anyone — for the same reason a `blocked`
story cannot be commissioned: continuity is the thing this product sells, and a
guarantee that can be waived under deadline is not a guarantee. Advisories are
shown and do not block, because they are the ones only a human reading the prose
can settle.

Two decisions, not one, because the platform earns per unlocked episode. A show
going live means it exists for listeners at all; an episode going out is the
thing that actually earns. A show can be live with nothing released yet — that
is a real pre-launch state, not a broken one.

Episodes release in order and are pulled from the end. A serial with episode 7
out and episode 3 held is not a state anyone can listen to, so it is not a state
this can be put into: releasing requires the one before it to be out already,
and pulling one pulls everything after it.

There is no Pocket FM API to push to. This records the decision and flips the
state; it does not put anything in an app, and the console says so rather than
implying otherwise.
"""

import re
import sys
import json
import pathlib
import argparse
import datetime as dt
from typing import Any, Dict, List, Optional, Sequence, Tuple

from src.util import DATA, log
from src.scoring.validate import load_story, validate_output

STORIES = DATA / "stories"

EPISODE_FILE = re.compile(r"^ep(\d+)\.md$")


def _now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


def _write_state(story_id: str, state: Dict[str, Any]) -> Dict[str, Any]:
    path = state_path(story_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
    return state


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


def episode_numbers(story_id: str) -> set:
    """
    Which episodes exist on disk, by number.

    The numbers rather than the count, because the two disagree the moment a
    season has a hole in it — and a count would then refuse to release an
    episode whose script is sitting right there.
    """
    episodes = STORIES / story_id / "episodes"
    if not episodes.is_dir():
        return set()
    found = set()
    for p in episodes.iterdir():
        match = EPISODE_FILE.match(p.name) if p.is_file() else None
        if match:
            found.add(int(match.group(1)))
    return found


def episode_count(story_id: str) -> int:
    """How many episodes were actually written, counted off disk."""
    return len(episode_numbers(story_id))


def released(state: Optional[Dict[str, Any]]) -> Dict[int, Dict[str, Any]]:
    """The per-episode records, keyed by episode number rather than by string."""
    return _split_episodes(state)[0]


def _split_episodes(
    state: Optional[Dict[str, Any]],
) -> Tuple[Dict[int, Dict[str, Any]], Dict[str, Any]]:
    """
    The episode records, and anything else that was in there.

    A key that is not an episode number is somebody's hand edit. It is skipped
    rather than failing the whole read — the file is a record of decisions, and
    losing all of them to one bad key is worse. It is also carried back out to
    the writer, because a read that tolerates something and a write that then
    deletes it is not tolerance, only a delayed loss.
    """
    if not state:
        return {}, {}
    raw = state.get("episodes")
    if not isinstance(raw, dict):
        return {}, {}
    out: Dict[int, Dict[str, Any]] = {}
    extra: Dict[str, Any] = {}
    for key, value in raw.items():
        try:
            out[int(key)] = value if isinstance(value, dict) else {}
        except (TypeError, ValueError):
            extra[str(key)] = value
    return out, extra


def _episodes_field(
    episodes: Dict[int, Dict[str, Any]], extra: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """Episode records back into their on-disk shape, keeping what we don't parse."""
    field: Dict[str, Any] = {str(k): v for k, v in sorted(episodes.items())}
    field.update(extra or {})
    return field


def released_through(state: Optional[Dict[str, Any]]) -> int:
    """
    The last episode a listener can reach.

    Counts the unbroken run from episode 1, so a hole punched into the file by
    hand reads as "released up to the hole" rather than silently offering an
    episode nobody can get to.
    """
    out = released(state)
    n = 0
    while (n + 1) in out:
        n += 1
    return n


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

    # Episodes already out survive a re-publish. Standing behind the season a
    # second time is not a reason to pull what listeners already have.
    existing, extra = _split_episodes(read_state(story_id))

    # ...but only the ones that still exist. Re-commissioning a 14-episode
    # season as a 3-episode taster makes `persist()` delete the surplus scripts,
    # and a release record outliving its script reported "14 of 3 episodes out"
    # while offering listeners episodes whose files were gone. Dropped here
    # rather than in `released()`, because the record should only be discarded
    # at the moment someone re-publishes and the season on disk is authoritative.
    written = episode_numbers(story_id)
    orphaned = sorted(ep for ep in existing if ep not in written)
    for ep in orphaned:
        existing.pop(ep, None)
    if orphaned:
        log(f"{story_id}: {len(orphaned)} released episode"
            f"{'' if len(orphaned) == 1 else 's'} no longer written "
            f"({', '.join(str(e) for e in orphaned)}) — dropped from what is out",
            "warn")

    state = {
        "story_id": story_id,
        "state": "live",
        "by": by,
        "at": _now(),
        # Kept with the decision: what was known about the season at the moment
        # someone stood behind it.
        "advisory_at_publish": advisory,
        "episodes": _episodes_field(existing, extra),
    }
    _write_state(story_id, state)
    log(f"{story_id} is live" + (f", published by {by}" if by else ""))
    return state


def publish_episode(story_id: str, ep: int, by: Optional[str] = None) -> Dict[str, Any]:
    """
    Put one episode in front of listeners, or raise saying why not.

    Re-runs the season's checks rather than trusting the verdict recorded when
    the show went live: episodes go out days apart, and the beat sheet can be
    edited in between. The gate that stops a broken season shipping has to stop
    a broken episode too, or it is only a gate on the first one.
    """
    state = read_state(story_id)
    if not state or state.get("state") != "live":
        raise RuntimeError(
            f"{story_id} is not live, so episode {ep} cannot go out. "
            f"Publish the show first."
        )

    written = episode_numbers(story_id)
    if not written:
        raise RuntimeError(f"{story_id} has no written episodes")
    if ep not in written:
        total = len(written)
        raise RuntimeError(
            f"{story_id} has {total} episode{'' if total == 1 else 's'} written; "
            f"there is no episode {ep}"
        )

    out, extra = _split_episodes(state)
    if ep in out:
        return state

    if ep > 1 and (ep - 1) not in out:
        raise RuntimeError(
            f"episode {ep - 1} is not out yet, so episode {ep} cannot be. "
            f"A serial is listened to in order."
        )

    fatal, advisory = check(story_id)
    if fatal:
        for note in fatal:
            log(f"FATAL {note}", "error")
        raise RuntimeError(
            f"episode {ep} of {story_id} cannot go out: {len(fatal)} continuity "
            f"problem{'' if len(fatal) == 1 else 's'} in the season. {fatal[0]}"
        )

    # The check is re-run here to catch drift since launch, so throwing away
    # what it found would defeat the point of running it. The editor releasing
    # this episode is the only person in a position to settle an advisory, and
    # the season-level list was written before these ones existed.
    for note in advisory:
        log(f"advisory {note}", "warn")

    out[ep] = {"by": by, "at": _now(), "advisory_at_release": advisory}
    state["episodes"] = _episodes_field(out, extra)
    _write_state(story_id, state)
    log(f"{story_id} episode {ep} is out" + (f", released by {by}" if by else ""))
    return state


def unpublish_episode(story_id: str, ep: int) -> Dict[str, Any]:
    """
    Pull one episode, and everything after it.

    Pulling is never gated — only shipping is. But pulling episode 3 of a season
    that has 7 out would leave a hole a listener cannot get past, so the tail
    comes with it.
    """
    state = read_state(story_id)
    if not state:
        raise RuntimeError(f"{story_id} is not live")

    out, extra = _split_episodes(state)
    pulled = sorted(n for n in out if n >= ep)
    for n in pulled:
        out.pop(n, None)

    state["episodes"] = _episodes_field(out, extra)
    _write_state(story_id, state)
    if pulled:
        tail = "" if len(pulled) == 1 else f" (and {len(pulled) - 1} after it)"
        log(f"{story_id} episode {ep} pulled{tail}")
    return state


def unpublish(story_id: str) -> None:
    """
    Back to draft, episodes and all. Pulling is never gated — only shipping is.
    """
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
    parser.add_argument("--episode", type=int, default=None, metavar="N",
                        help="release one episode; with --unpublish, pull it "
                             "and everything after it")
    parser.add_argument("--status", action="store_true",
                        help="what is live and how many episodes are out")
    args = parser.parse_args(argv)

    try:
        if args.status:
            state = read_state(args.story)
            total = episode_count(args.story)
            if not state or state.get("state") != "live":
                log(f"{args.story}: not live, {total} episodes written")
                return 0
            through = released_through(state)
            log(f"{args.story}: live, {through} of {total} episodes out")
            for ep, rec in sorted(released(state).items()):
                log(f"  ep{ep:02d} out"
                    + (f" — {rec.get('by')}" if rec.get("by") else ""))
            return 0

        if args.unpublish:
            if args.episode is not None:
                unpublish_episode(args.story, args.episode)
            else:
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

        if args.episode is not None:
            publish_episode(args.story, args.episode, args.by)
            return 0

        publish(args.story, args.by)
    except (RuntimeError, ValueError, KeyError, json.JSONDecodeError) as exc:
        log(str(exc), "error")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
