"""
Write a season from a dossier.

    python tasks.py serial --event evt_kadamballi_2022

`episode.md` is a *batched* prompt, not a one-shot one: each call writes a few
episodes and hands back the beats, the promise ledger and the calendar so the
next call can carry them. That is the whole design — batch four avoids
contradicting batch one about what month it is because batch one said so in
writing, and a character's voice holds across fourteen episodes because their
previous lines go back in every time.

Prose and beats come from the same call, which is `CLAUDE.md`'s one
non-negotiable rule for this stage. Generating prose and recovering beats from it
afterwards loses exactly the `hidden_from` information the product is sold on.

Nothing is written until the season is graded. A beat sheet with fatal problems
is worse on disk than absent: every stage downstream trusts it.
"""

import re
import sys
import json
import pathlib
import argparse
from typing import Any, Dict, List, Optional, Sequence, Tuple

from src.util import (DATA, DOSSIERS_PATH, ensure_dirs, load_env, log, read_json,
                      write_json)
from src.generation.client import call_structured
from src.generation.schemas import (batch_schema, episode_word_count,
                                   length_problems, render_script)
from src.scoring.validate import validate_output

PROMPTS = pathlib.Path(__file__).resolve().parent / "prompts"
STORIES = DATA / "stories"

# Episodes per call. Small enough that a batch fits comfortably inside the output
# ceiling, large enough that continuity is decided inside one call rather than
# negotiated across many.
BATCH_SIZE = 3

# The episode filenames persist() owns, and so the only ones it may delete.
EPISODE_FILE = re.compile(r"^ep\d+\.md$")

# `hi-en` is Hinglish. The prompt treats the choice as load-bearing rather than
# cosmetic, so it is stated once here and not guessed per batch.
DEFAULT_LANGUAGE = "en"


# ---------------------------------------------------------------------------
# INPUT BLOCKS — each one fills a heading in episode.md's <input_template>
# ---------------------------------------------------------------------------

def season_plan(dossier: Dict[str, Any]) -> str:
    lines = []
    for e in dossier.get("season", []):
        pays = e.get("pays_off")
        lines.append(
            f"ep{e.get('ep')}: turn — {e.get('turn')}\n"
            f"  ends_on: {e.get('ends_on')}\n"
            f"  hook_type: {e.get('hook_type')}  status: {e.get('status')}"
            + (f"\n  pays_off: {pays}" if pays else "")
        )
    return "\n".join(lines) or "(no season plan)"


def cast_block(dossier: Dict[str, Any]) -> str:
    rows = []
    for c in dossier.get("cast", []):
        rows.append(
            f"{c.get('char_id')} — {c.get('name')} — {c.get('role')} — "
            f"wants: {c.get('want')}"
        )
    return "\n".join(rows) or "(no cast)"


def canon_block(beats: Sequence[Dict[str, Any]]) -> str:
    """Beats already written. Truth the new batch may not contradict."""
    if not beats:
        return "(nothing yet — this is the first batch)"
    rows = []
    for b in beats:
        rows.append(
            f"{b.get('beat_id')} ep{b.get('ep')}.{b.get('seq')} "
            f"[{b.get('world_time')}] {b.get('location')}\n"
            f"  {b.get('what_happened')}\n"
            f"  present: {', '.join(b.get('present') or []) or '—'}"
            f" | witnessed: {', '.join(b.get('witnessed_by') or []) or '—'}"
            f" | hidden from: {', '.join(b.get('hidden_from') or []) or '—'}"
        )
    return "\n".join(rows)


def speaker_lines(script: str, name: str, limit: int = 4) -> List[str]:
    """
    A character's own dialogue, most recent last.

    `episode.md` requires one verbal signature per character held identical
    across episodes, and the only way the model can match a voice it wrote six
    episodes ago is to be shown it. Speaker tags are the character's name in
    caps, per the form section.
    """
    tag = re.compile(rf"^\s*{re.escape(name.upper())}\s*:\s*(.+)$", re.MULTILINE)
    found = [m.group(1).strip() for m in tag.finditer(script)]
    return found[-limit:]


def character_ledger(
    dossier: Dict[str, Any],
    beats: Sequence[Dict[str, Any]],
    scripts: Dict[int, str],
) -> str:
    """
    What each character knows, and how they talk.

    `knows` is computed from `witnessed_by` because that is what
    `character_view()` reads downstream. A character in the room who was never
    listed as witnessing has not been told either way, and the writer must not
    assume they were.
    """
    joined = "\n".join(scripts[k] for k in sorted(scripts))
    rows = []
    for c in dossier.get("cast", []):
        cid, name = c.get("char_id"), c.get("name") or ""
        knows = [b.get("what_happened") for b in beats
                 if cid in (b.get("witnessed_by") or [])]
        blind = [b.get("what_happened") for b in beats
                 if cid in (b.get("hidden_from") or [])]
        lines = speaker_lines(joined, name) if name else []

        row = [f"{cid} ({name})"]
        row.append("  knows: " + ("; ".join(knows[-6:]) if knows else "nothing yet"))
        if blind:
            row.append("  MUST NOT KNOW: " + "; ".join(blind[-6:]))
        if lines:
            row.append("  previously said: " + " / ".join(f'"{ln}"' for ln in lines))
        rows.append("\n".join(row))
    return "\n".join(rows) or "(no cast)"


def clearance_block(dossier: Dict[str, Any]) -> str:
    fic = dossier.get("fictionalization_map") or {}
    pairs = "\n".join(f"  {real} -> {fake}" for real, fake in fic.items()) or "  (none)"

    never = dossier.get("never_narrate_as_fact") or [
        f"{t.get('id')}: {t.get('what_happened')} ({t.get('confidence')})"
        for t in dossier.get("timeline", [])
        if t.get("confidence") in ("alleged", "disputed")
    ]
    real_names = [p.get("name") for p in dossier.get("people", []) if p.get("name")]

    return (
        f"Fictionalization map:\n{pairs}\n\n"
        f"Never narrate as fact (a character may assert these; the narrator may not):\n"
        + ("\n".join(f"  {n}" for n in never) or "  (none)")
        + "\n\nReal names that must never appear in a script:\n"
        + ("\n".join(f"  {n}" for n in real_names) or "  (none)")
    )


def last_lines(scripts: Dict[int, str], n: int = 3) -> str:
    if not scripts:
        return "(nothing yet — this is the first episode)"
    latest = scripts[max(scripts)]
    lines = [ln for ln in latest.splitlines() if ln.strip()]
    return "\n".join(lines[-n:])


def build_user_prompt(
    dossier: Dict[str, Any],
    start: int,
    end: int,
    beats: Sequence[Dict[str, Any]],
    promises: Sequence[Dict[str, Any]],
    calendar: Optional[Dict[str, Any]],
    scripts: Dict[int, str],
) -> str:
    open_promises = [p for p in promises if p.get("status") == "open"]
    return "\n\n".join([
        f"## SEASON PLAN\n{season_plan(dossier)}",
        f"## THIS BATCH\nWrite episodes {start}-{end}. Their turns, hooks and "
        f"payoffs are above.",
        f"## CAST\n{cast_block(dossier)}",
        f"## CANON SO FAR\n{canon_block(beats)}",
        f"## CHARACTER LEDGER\n{character_ledger(dossier, beats, scripts)}",
        "## OPEN PROMISES\n"
        + (json.dumps(open_promises, ensure_ascii=False, indent=2)
           if open_promises else "(none open)"),
        "## CALENDAR\n"
        + (json.dumps(calendar, ensure_ascii=False, indent=2)
           if calendar else "(not started — fix the season start in this batch)"),
        f"## LAST LINES\n{last_lines(scripts)}",
        f"## CLEARANCE\n{clearance_block(dossier)}",
    ])


def system_prompt(language: str) -> str:
    text = (PROMPTS / "episode.md").read_text(encoding="utf-8")
    return text.replace("{{language_mode}}", language)


# ---------------------------------------------------------------------------
# ORCHESTRATION
# ---------------------------------------------------------------------------

def batches(episodes: Sequence[int], size: int = BATCH_SIZE) -> List[Tuple[int, int]]:
    ordered = sorted(set(episodes))
    return [(ordered[i], ordered[min(i + size, len(ordered)) - 1])
            for i in range(0, len(ordered), size)]


def write_season(
    dossier: Dict[str, Any],
    story_id: str,
    language: str = DEFAULT_LANGUAGE,
    batch_size: int = BATCH_SIZE,
    client: Any = None,
    on_progress: Any = None,
) -> Dict[str, Any]:
    """
    Walk the plan in batches, carrying state forward. Returns the season.

    Raises rather than returning half a season: a partial write leaves a beat
    sheet that every downstream stage will treat as complete.
    """
    plan = dossier.get("season") or []
    if not plan:
        raise RuntimeError(
            f"{story_id} has no season plan — run `python tasks.py score` first, "
            "since the plan is what tells the writer what happens in each episode."
        )

    beats: List[Dict[str, Any]] = []
    promises: List[Dict[str, Any]] = []
    calendar: Optional[Dict[str, Any]] = None
    scripts: Dict[int, str] = {}
    lines: Dict[int, list] = {}
    titles: Dict[int, str] = {}
    flags: List[str] = []

    system = system_prompt(language)
    eps = [e.get("ep") for e in plan if isinstance(e.get("ep"), int)]
    spans = batches(eps, batch_size)

    def report(**fields: Any) -> None:
        """
        Progress is reported per batch because that is the only granularity that
        exists — a batch is one call, and nothing comes back until it returns.
        Claiming per-episode progress inside one would be inventing it.
        """
        if on_progress:
            on_progress(dict(total=len(eps), written=len(scripts),
                             batches=len(spans), **fields))

    for index, (start, end) in enumerate(spans, start=1):
        log(f"{story_id}: writing episodes {start}-{end}")
        report(batch=index, from_ep=start, to_ep=end)
        user = build_user_prompt(dossier, start, end, beats, promises, calendar, scripts)

        result = call_structured(
            stage=f"serial_{story_id}_{start:02d}_{end:02d}",
            system=system,
            user=user,
            schema=batch_schema(),
            schema_name="episode_batch",
            client=client,
        )

        written = result.get("episodes") or []
        if not written:
            raise RuntimeError(
                f"{story_id}: batch {start}-{end} returned no episodes. Nothing "
                "is written; rerun rather than accepting a season with a hole."
            )
        for e in written:
            # The writer returns lines; the readable script is rendered from
            # them. Nothing downstream parses prose back into structure.
            lines[e["ep"]] = e.get("lines") or []
            scripts[e["ep"]] = render_script(e)
            titles[e["ep"]] = e.get("title", "")

        beats.extend(result.get("beat_sheet") or [])
        # The ledger is returned whole each time, inherited entries included, so
        # it replaces rather than accumulates. Appending would duplicate every
        # promise once per remaining batch.
        promises = result.get("promise_ledger") or promises
        calendar = result.get("calendar") or calendar

        for f in result.get("flags") or []:
            flags.append(f"ep{start}-{end}: {f}")
        for p in length_problems(written):
            flags.append(f"length — {p}")

        # After the merge, so `written` counts episodes actually in hand.
        report(batch=index, from_ep=start, to_ep=end)

    return {
        "story_id": story_id,
        "event_id": dossier.get("event_id"),
        "title": dossier.get("title"),
        "scripts": scripts,
        "titles": titles,
        "lines": lines,
        "beats": beats,
        "promises": promises,
        "calendar": calendar,
        "flags": flags,
    }


def persist(season: Dict[str, Any], dossier: Dict[str, Any]) -> pathlib.Path:
    """
    Write the season where the Slate screen and the validator read from.

    Writing is not enough: the directory has to be left holding *this* season and
    nothing else. A story re-commissioned shorter keeps the earlier run's surplus
    `epNN.md` files otherwise, and since every screen lists the directory rather
    than the season plan, it shows fourteen episodes for a three-episode season —
    the last eleven starring a cast the current dossier has never heard of. The
    same argument applies to `calendar.json`: a stale one dates a story that no
    longer exists.

    Only the two names this function writes are ever removed, and only inside
    `data/stories/<story_id>/`. Everything else under there belongs to another
    stage — `audio/`, a handoff note — and is none of persist's business.
    """
    story_dir = STORIES / season["story_id"]
    episodes_dir = story_dir / "episodes"
    episodes_dir.mkdir(parents=True, exist_ok=True)

    written = set()
    for ep, script in sorted(season["scripts"].items()):
        # `render_script` already writes the heading. Adding one here printed the
        # title twice at the top of every episode file.
        path = episodes_dir / f"ep{ep:02d}.md"
        path.write_text(script.rstrip() + "\n", encoding="utf-8")
        written.add(path.name)

    for stale in sorted(episodes_dir.iterdir()):
        if stale.is_file() and EPISODE_FILE.match(stale.name) and stale.name not in written:
            stale.unlink()
            log(f"{season['story_id']}: removed stale {stale.name} "
                f"— not in this {len(written)}-episode season", "warn")

    write_json(story_dir / "dossier.json", dossier)
    write_json(story_dir / "beats.json", {
        "story_id": season["story_id"],
        "event_id": season["event_id"],
        "beats": season["beats"],
    })
    # The lines as the writer structured them, keyed by episode. The audio stage
    # reads these; the .md files beside them are for people. Nothing downstream
    # parses prose back into structure any more.
    write_json(story_dir / "lines.json",
               {str(ep): rows for ep, rows in sorted(season.get("lines", {}).items())})
    write_json(story_dir / "promises.json", {
        "story_id": season["story_id"],
        "open_count": sum(1 for p in season["promises"] if p.get("status") == "open"),
        "promises": season["promises"],
    })
    calendar_path = story_dir / "calendar.json"
    if season["calendar"]:
        write_json(calendar_path, season["calendar"])
    elif calendar_path.exists():
        calendar_path.unlink()
        log(f"{season['story_id']}: removed stale calendar.json "
            f"— this season fixed no dates", "warn")
    return story_dir


def load_dossier(event_id: str) -> Dict[str, Any]:
    if not DOSSIERS_PATH.exists():
        raise RuntimeError(
            f"no dossiers at {DOSSIERS_PATH} — run `python tasks.py score` first"
        )
    for d in read_json(DOSSIERS_PATH):
        if d.get("event_id") == event_id:
            return d
    known = ", ".join(d.get("event_id", "?") for d in read_json(DOSSIERS_PATH))
    raise RuntimeError(f"no dossier for {event_id!r}. Available: {known}")


def produce(
    event_id: str,
    story_id: Optional[str] = None,
    language: str = DEFAULT_LANGUAGE,
    batch_size: int = BATCH_SIZE,
    on_progress: Any = None,
    client: Any = None,
) -> Dict[str, Any]:
    """
    Write, grade, and only then save. Raises rather than returning a code.

    Separate from `main()` so a caller that wants progress — the console does —
    can pass a callback without reimplementing the grading and the refusal to
    persist a broken season.
    """
    dossier = load_dossier(event_id)
    season = write_season(
        dossier,
        story_id=story_id or event_id,
        language=language,
        batch_size=batch_size,
        on_progress=on_progress,
        client=client,
    )

    # Graded before it is written. A season with fatal problems on disk is worse
    # than no season: `character_view()` cannot tell a corrupt beat sheet from a
    # sound one, and neither can the screen built on top of it.
    fatal, advisory = validate_output(dossier, season["beats"])
    for note in advisory:
        log(f"advisory {note}", "warn")
    for note in season["flags"]:
        log(f"flag {note}", "warn")

    if fatal:
        for note in fatal:
            log(f"FATAL {note}", "error")
        raise RuntimeError(
            f"the season was written but failed {len(fatal)} check"
            f"{'' if len(fatal) == 1 else 's'} and was not saved: {fatal[0]}"
        )

    story_dir = persist(season, dossier)
    words = sum(episode_word_count(s) for s in season["scripts"].values())
    log(f"{season['story_id']}: {len(season['scripts'])} episodes, "
        f"{len(season['beats'])} beats, {words:,} words -> {story_dir}")
    return {"season": season, "story_dir": story_dir, "advisory": advisory}


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        prog="tasks.py serial",
        description="Write a season of scripts from an expanded dossier.",
    )
    parser.add_argument("--event", required=True, help="dossier event_id")
    parser.add_argument("--story", default=None,
                        help="directory name under data/stories. Defaults to the event id.")
    parser.add_argument("--language", default=DEFAULT_LANGUAGE, choices=["en", "hi-en"])
    parser.add_argument("--batch", type=int, default=BATCH_SIZE,
                        help=f"episodes per call (default {BATCH_SIZE})")
    args = parser.parse_args(argv)

    load_env()
    ensure_dirs()

    try:
        produce(args.event, args.story, args.language, args.batch)
    except (RuntimeError, ValueError, KeyError, json.JSONDecodeError) as exc:
        log(str(exc), "error")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
