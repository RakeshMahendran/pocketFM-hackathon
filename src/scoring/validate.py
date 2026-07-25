"""
Grade the beat sheet the episode writer returned against the dossier it came from.

    python -m src.scoring.validate [story_dir ...]

`check()` next door grades the season *plan* — the shape of the story before a
word is written. This grades the canon that came back: whether every beat can
still be traced to a source, whether every id in the epistemic arrays is a
person, and whether anyone's ignorance was actually asserted.

Nothing here calls a model. The episode prompt already states all three rules in
its own final check (`episode.md` §final_check 4-5); four generation runs agreed
to them and then broke them anyway, which is the argument for checking outside
the model rather than inside it.

### Fatal versus advisory

Fatal problems are the ones that corrupt a *query*, so no later stage can see
them and no human will read the beat that carries them:

- **Untraceable `source_ref`** — the value is the only record of where a line
  came from. Once a season is written, an episode number in that field is
  indistinguishable from an invention that was never marked, and half the pitch
  ("which parts of this actually happened") cannot be answered by any amount of
  re-reading. There is no recovery after the fact, so it blocks the write.
- **A participant who is not cast** — `character_view()` computes a character by
  filtering beats on a `char_id`. An id that is a place or a crowd therefore
  *becomes* a character, with its own knows/blind lists, offered in the UI as a
  spinoff lead. The same mechanism turns a typo into a second, half-blind copy
  of a real character. Nothing downstream can tell either from a person.
- **A character both witnessing and hidden from one beat** — their status is
  undecidable, and hard rule 1 is enforced by exactly that decision.

Everything else is advisory, because a human reading the line is the only thing
that can settle it. An empty `hidden_from` on the last episode's public
reckoning is a legitimate authorial choice; on a two-hander it is a hole. Both
get reported, with the numbers needed to tell them apart, and neither blocks.

Following `check()`, every function returns problems rather than raising. Only
the caller decides that a fatal list is fatal.
"""

import sys
import json
import pathlib
import argparse
import collections
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

from src.util import DATA, log, read_json

FICTIONALIZED = "fictionalized"

STORIES = DATA / "stories"

# A spinoff lead's ignorance has to be stated everywhere, not sampled — the
# constraint set is built from `blind`, so an unstated beat is one the spinoff
# writer is free to assume its protagonist knows. DELIVERY_PLAN records zero
# unstated beats for Jignesh as the standard. Half is where we start shouting.
STATED_FLOOR = 0.5

# Below this the report names the character; above it, only counts. Long lists
# of "and 14 more" are how a warning stops being read.
WORST_SHOWN = 4


def _beats_of(payload: Any) -> List[Dict[str, Any]]:
    """Accept either a bare list of beats or the `{"beats": [...]}` wrapper."""
    if isinstance(payload, dict):
        return payload.get("beats", [])
    return list(payload or [])


def _cast_ids(dossier: Dict[str, Any]) -> List[str]:
    return [c.get("char_id") for c in dossier.get("cast", []) if c.get("char_id")]


def _participants(beat: Dict[str, Any]) -> Iterable[str]:
    for field in ("present", "witnessed_by", "hidden_from"):
        for who in beat.get(field) or []:
            yield who


def _where(beat_ids: Sequence[str], total: int) -> str:
    shown = ", ".join(beat_ids[:3])
    return f"{total} beats ({shown}{', …' if total > 3 else ''})"


def untraceable_beats(dossier: Dict[str, Any],
                      beats: Sequence[Dict[str, Any]]) -> List[str]:
    """
    FATAL. Beats whose `source_ref` is neither `{event_id}#{timeline_id}` nor
    the literal `"fictionalized"`.

    Those are the only two forms — `DELIVERY_PLAN.md` §0 pins it, `ipl_beats.json`
    uses it, `episode.md` spells it out. Grouped by value, because a season that
    numbered every beat by episode is one mistake made 53 times, not 53 problems.
    """
    event_id = dossier.get("event_id", "")
    timeline = {t.get("id") for t in dossier.get("timeline", [])}

    bad: Dict[str, List[str]] = collections.defaultdict(list)
    for beat in beats:
        ref = beat.get("source_ref") or ""
        if ref == FICTIONALIZED:
            continue
        prefix, sep, entry = ref.partition("#")
        if sep and prefix == event_id and entry in timeline:
            continue
        bad[ref or "(missing)"].append(str(beat.get("beat_id", "?")))

    shape = f"'{event_id}#<timeline_id>' or '{FICTIONALIZED}'"
    if len(bad) > WORST_SHOWN:
        # A season that named every beat after its episode invented one wrong
        # format, not thirty-two. Listing each value buries that.
        affected = sum(len(ids) for ids in bad.values())
        examples = ", ".join(repr(r) for r in sorted(bad)[:WORST_SHOWN])
        return [f"{len(bad)} different source_ref formats across {affected} beats, "
                f"none of them {shape}: {examples}, ..."]

    problems = []
    for ref, ids in bad.items():
        hint = ""
        if ref in timeline:
            hint = f". Timeline entry {ref!r} exists; write it as '{event_id}#{ref}'"
        elif ref.partition("#")[2] in timeline:
            hint = f". Right entry, wrong event id: this dossier is '{event_id}'"
        elif ref.lower() in ("invented", "fictionalised", "fiction", "original"):
            hint = f". Invention is marked with the literal '{FICTIONALIZED}'"
        problems.append(
            f"source_ref {ref!r} on {_where(ids, len(ids))} is not {shape}{hint}"
        )
    return sorted(problems)


def unknown_participants(dossier: Dict[str, Any],
                         beats: Sequence[Dict[str, Any]]) -> List[str]:
    """
    FATAL. Ids in `present` / `witnessed_by` / `hidden_from` that are not a cast
    `char_id`.

    Two generated seasons put places and crowds in these arrays — 'the tea shop
    bench', 'two hundred candidates', 'everyone else'. A character view is a
    filter on `char_id`, so each of those is a character the moment the store is
    queried: a bench with a knows list, promotable, in the UI, indistinguishable
    from a person to every stage after this one.
    """
    cast = set(_cast_ids(dossier))
    seen: Dict[str, List[str]] = collections.defaultdict(list)
    for beat in beats:
        for who in set(_participants(beat)):
            if who not in cast:
                seen[who].append(str(beat.get("beat_id", "?")))

    return [f"'{who}' is a participant on {_where(ids, len(ids))} "
            f"but is not a cast char_id"
            for who, ids in sorted(seen.items())]


def contradictory_beats(beats: Sequence[Dict[str, Any]]) -> List[str]:
    """
    FATAL. A character listed as both witnessing a beat and hidden from it.

    Hard rule 1 is a decision about one character and one beat; this makes that
    decision undecidable. The beat lands in `knows` and `blind` at once and the
    leakage check has no ground to stand on.
    """
    problems = []
    for beat in beats:
        both = sorted(set(beat.get("witnessed_by") or [])
                      & set(beat.get("hidden_from") or []))
        if both:
            problems.append(
                f"{beat.get('beat_id', '?')}: {both} are both witnessed_by and "
                f"hidden_from — knows and blind cannot both hold"
            )
    return problems


def unstated_ignorance(dossier: Dict[str, Any],
                       beats: Sequence[Dict[str, Any]]) -> List[str]:
    """
    ADVISORY. Beats with an empty `hidden_from`.

    Half-filling this field is the thing `CLAUDE.md` says kills the product, but
    an empty one is not automatically wrong: a finale where the whole cast stands
    in the square genuinely hides nothing. What separates the two is how much of
    the cast was in the room, so that number is reported and the judgement is
    left to a person.
    """
    cast = _cast_ids(dossier)
    problems = []
    for beat in beats:
        if beat.get("hidden_from"):
            continue
        absent = [c for c in cast if c not in set(beat.get("present") or [])]
        problems.append(
            f"{beat.get('beat_id', '?')} (ep{beat.get('ep', '?')}) asserts nobody's "
            f"ignorance: hidden_from is empty and {len(absent)} of {len(cast)} cast "
            f"members are not even present"
        )
    return problems


def present_but_unstated(beats: Sequence[Dict[str, Any]]) -> List[str]:
    """
    ADVISORY. Characters in `present` who are in neither `witnessed_by` nor
    `hidden_from`.

    The schema reads `witnessed_by` as "present, or credibly told later", so
    standing in the room and not witnessing is a claim — she was asleep, he had
    already left. It is legal, and rare in three of the four seasons (2-4 beats
    each, none in the hand-authored fixture). One season has it on 37 of 44
    beats with its own protagonist, which is not that claim: it used
    `witnessed_by` to mean "the others who found out". Those beats say nothing
    about whether the lead knows her own scene, and `character_view()` will
    answer no.
    """
    hits = [(b, sorted(set(b.get("present") or [])
                       - set(b.get("witnessed_by") or [])
                       - set(b.get("hidden_from") or [])))
            for b in beats]
    hits = [(b, who) for b, who in hits if who]
    if not hits:
        return []

    examples = "; ".join(f"{b.get('beat_id', '?')}: {', '.join(who)}"
                         for b, who in hits[:2])
    return [f"{len(hits)} of {len(beats)} beats leave someone standing in the scene "
            f"with no stated knowledge of it — present, but in neither "
            f"witnessed_by nor hidden_from ({examples})"]


def coverage(dossier: Dict[str, Any],
             beats: Sequence[Dict[str, Any]]) -> List[Tuple[str, int, int, int]]:
    """
    Per-character `(char_id, knows, blind, unstated)`, worst coverage first.

    `knows` counts `witnessed_by` rather than `present` because that is what
    `character_view()` reads — a character in the room who is not listed as
    witnessing has not been told either way, and counts as unstated here.
    """
    rows = []
    for char_id in _cast_ids(dossier):
        knows = sum(1 for b in beats if char_id in (b.get("witnessed_by") or []))
        blind = sum(1 for b in beats if char_id in (b.get("hidden_from") or []))
        rows.append((char_id, knows, blind, len(beats) - knows - blind))
    rows.sort(key=lambda r: (-r[3], r[0]))
    return rows


def thin_characters(dossier: Dict[str, Any],
                    beats: Sequence[Dict[str, Any]]) -> List[str]:
    """
    ADVISORY. Cast whose epistemic status is left unstated on most of the season.

    The three arrays are not required to partition the cast, so this is never a
    contract breach — it is a readiness number. A character with 40 unstated
    beats cannot be spun off honestly: the constraint set built from their
    `blind` list would be silent about most of the story, and silence is what the
    spinoff writer fills in.
    """
    rows = coverage(dossier, beats)
    if not rows or not beats:
        return []

    problems = []
    empty = [r[0] for r in rows if r[1] == 0 and r[2] == 0]
    if empty:
        problems.append(
            f"{len(empty)} cast members appear in no beat at all ({', '.join(empty)}) "
            f"— nothing to promote, and the character panel would offer them anyway"
        )

    thin = [r for r in rows if r[0] not in empty
            and (r[1] + r[2]) < STATED_FLOOR * len(beats)]
    if thin:
        worst = ", ".join(f"{c} ({u} unstated)" for c, _k, _b, u in thin[:WORST_SHOWN])
        problems.append(
            f"{len(thin)} of {len(rows)} cast members have their status stated on "
            f"fewer than half of {len(beats)} beats — {worst}. A spinoff lead needs "
            f"this at zero unstated"
        )
    return problems


def alleged_as_fact(dossier: Dict[str, Any],
                    beats: Sequence[Dict[str, Any]]) -> List[str]:
    """
    ADVISORY. Beats that dramatise a timeline entry tagged `alleged` or `disputed`.

    Hard rule 3 allows exactly one rendering — a character asserts it — and only
    a human reading `what_happened` can tell that from the narrator asserting it.
    So this points at the line rather than judging it.
    """
    risky = {t["id"]: t.get("confidence") for t in dossier.get("timeline", [])
             if t.get("confidence") in ("alleged", "disputed") and t.get("id")}
    problems = []
    for beat in beats:
        entry = (beat.get("source_ref") or "").partition("#")[2]
        if entry in risky:
            problems.append(
                f"{beat.get('beat_id', '?')} is sourced to {entry} ({risky[entry]}) — "
                f"hard rule 3 allows it only as something a character claims: "
                f"\"{beat.get('what_happened', '')}\""
            )
    return problems


def validate_output(dossier: Dict[str, Any],
                    beats: Sequence[Dict[str, Any]]) -> Tuple[List[str], List[str]]:
    """
    Grade one beat sheet against its dossier. Returns `(fatal, advisory)`.

    Fatal problems corrupt a query and are invisible afterwards — see the module
    docstring for the argument. Advisory problems need a human to read a line.
    Neither raises; the caller decides what a fatal list means, exactly as
    `main()` does for `unmapped_names()`.
    """
    fatal = (untraceable_beats(dossier, beats)
             + unknown_participants(dossier, beats)
             + contradictory_beats(beats))
    advisory = (unstated_ignorance(dossier, beats)
                + present_but_unstated(beats)
                + thin_characters(dossier, beats)
                + alleged_as_fact(dossier, beats))

    if not beats:
        fatal.append("the beat sheet is empty — there is no canon to query")
    return fatal, advisory


def load_beats(path: pathlib.Path) -> List[Dict[str, Any]]:
    """Read a beat sheet in either committed shape, loudly if it is neither."""
    if not path.exists():
        raise RuntimeError(f"no beat sheet at {path}")
    beats = _beats_of(read_json(path))
    if not isinstance(beats, list):
        raise RuntimeError(f"{path} holds no beat list")
    return beats


def load_story(story_dir: pathlib.Path) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    dossier_path = story_dir / "dossier.json"
    if not dossier_path.exists():
        raise RuntimeError(f"no dossier at {dossier_path}")
    return read_json(dossier_path), load_beats(story_dir / "beats.json")


def stories(root: pathlib.Path = STORIES) -> List[pathlib.Path]:
    """Committed stories, in name order. A directory without a dossier is a
    work in progress, not a story — `_verify_ep1_3` is a three-episode probe."""
    if not root.exists():
        return []
    return sorted(d for d in root.iterdir() if (d / "dossier.json").exists())


def report(story_dir: pathlib.Path) -> Tuple[List[str], List[str]]:
    """Validate one story directory and log what it violates."""
    dossier, beats = load_story(story_dir)
    fatal, advisory = validate_output(dossier, beats)

    log(f"{story_dir.name}: {len(beats)} beats, {len(fatal)} fatal, "
        f"{len(advisory)} advisory")
    for problem in fatal:
        log(f"  FATAL    {problem}", "error")
    for problem in advisory:
        log(f"  advisory {problem}", "warn")
    return fatal, advisory


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m src.scoring.validate",
        description="Validate committed beat sheets against their dossiers.",
    )
    parser.add_argument(
        "story", nargs="*", default=None, metavar="STORY_DIR",
        help=f"story directories to grade. Defaults to every story under {STORIES}.",
    )
    args = parser.parse_args(argv)

    targets = [pathlib.Path(s) for s in args.story] or stories()
    if not targets:
        log(f"no stories under {STORIES}", "error")
        return 1

    failed = 0
    for story_dir in targets:
        try:
            fatal, _advisory = report(story_dir)
        except (RuntimeError, ValueError, json.JSONDecodeError) as exc:
            log(str(exc), "error")
            failed += 1
            continue
        failed += bool(fatal)

    log(f"{len(targets) - failed} of {len(targets)} stories are free of fatal problems")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
