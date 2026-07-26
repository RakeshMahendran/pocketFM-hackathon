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
- **A real person's name on the page** — hard rule 4. Not a query problem: an
  identifiable human being named in entertainment made about them. Once the
  episode is out there is no recovery either, and the person harmed is not
  anybody this team can apologise to by editing a file. It blocks.

Everything else is advisory, because a human reading the line is the only thing
that can settle it. An empty `hidden_from` on the last episode's public
reckoning is a legitimate authorial choice; on a two-hander it is a hole. Both
get reported, with the numbers needed to tell them apart, and neither blocks.

Following `check()`, every function returns problems rather than raising. Only
the caller decides that a fatal list is fatal.
"""

import re
import sys
import json
import pathlib
import argparse
import collections
from typing import (Any, Dict, Iterable, List, Mapping, NamedTuple, Optional,
                    Sequence, Tuple)

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

# ----------------------------------------------------------------------------
# Hard rule 4 — real names.
# ----------------------------------------------------------------------------

# Unicode letters only: names carry accents and the scripts carry curly
# apostrophes, and neither should split a token or glue two together.
WORD = re.compile(r"[^\W\d_]+", re.UNICODE)

def _token_pattern(token: str) -> "re.Pattern[str]":
    """
    One token, on its own, case-insensitively.

    Whole-string matching was the bug: the map key is "Mysuru district,
    Karnataka" and the script said "a lorry driver in Mysuru", so nothing
    matched and the check stayed green. What reaches the page is a fragment — a
    surname without its given name, a district without its state.
    """
    return re.compile(r"(?<![^\W\d_])" + re.escape(token) + r"(?![^\W\d_])", re.I)


# A token has to be distinctive enough that seeing it on the page means the real
# name reached the page. Three rules, in order of how much they carry:
#
#  1. capitalised in the dossier entry. Real names are proper nouns; the role
#     labels these maps are half made of are written in lower case ("the kiln
#     site", "bonded household members"), so this alone drops most of them.
#  2. at least MIN_TOKEN letters. Drops initials and honorifics — "K R Nagar",
#     "Mst. Acharaj" — which are neither distinctive nor identifying. It also
#     drops "Ram" from "Ram Rattan": a three-letter token is a word as often as
#     it is a name, and the entry is still covered by "Rattan".
#  3. not a generic noun that happens to sit inside a proper-noun phrase.
#     "British Museum", "Anurag Guest House", "Returned woman's father" — the
#     name is one word of those and the rest is furniture. Without this the
#     check fires on "house" and stops being read.
MIN_TOKEN = 4

GENERIC_TOKENS = frozenset({
    "alleged", "appointee", "arrested", "associate", "block", "bonded",
    "brother", "city", "coast", "college", "committee", "complainant",
    "contractor", "court", "daily", "department", "deputy", "district",
    "escort", "family", "father", "guest", "hamlet", "hospital", "hotel",
    "house", "husband", "invented", "journalist", "kiln", "labour", "library",
    "market", "mother", "museum", "office", "officer", "officers", "operator",
    "police", "returned", "river", "road", "room", "school", "second", "shop",
    "shrine", "sister", "site", "staff", "state", "station", "street", "taluk",
    "team", "teacher", "temple", "town", "unidentified", "university",
    "village", "widow", "wife", "woman", "women",
})

PERSON = "person"
PLACE = "place"

# How much of the line to keep with a finding. Enough to see the sentence the
# name is standing in; a whole script pasted into a warning is unreadable.
QUOTE_WIDTH = 44


class NameHit(NamedTuple):
    """One real-name token found in one piece of generated text."""
    token: str
    entry: str      # the dossier entry the token came from
    kind: str       # PERSON or PLACE
    where: str      # which script or beat carried it
    quote: str


def _name_tokens(entry: str) -> List[str]:
    """The distinctive tokens of one dossier entry. See MIN_TOKEN above."""
    return [t for t in WORD.findall(entry or "")
            if len(t) >= MIN_TOKEN and t[:1].isupper()
            and t.lower() not in GENERIC_TOKENS]


def real_name_tokens(dossier: Dict[str, Any]) -> Dict[str, Tuple[str, str]]:
    """
    `token -> (dossier entry, PERSON | PLACE)`, lower-cased.

    Both halves of the dossier can carry a real name and neither is reliable
    alone. `people[]` is where they usually are; `story1` records people by role
    ("The arrested teacher") and keeps the real ones in the map keys; `story3`
    has eight real people in `people[]` and not one person key in its map, which
    is exactly how a real trafficking victim's surname reached a script.

    Anything on the *right* of the map is subtracted: the fictional counterpart
    is the declared allowed vocabulary, so "Gregor" never fires (the map keeps
    it, as "Gregor Macrae") while "MacGregor" does. A map entry that deliberately
    keeps a real place — "London remains the historical city" — exempts itself by
    the same rule, which is the only written record of that decision.
    """
    fmap = dossier.get("fictionalization_map") or {}
    allowed = {w.lower() for value in fmap.values()
               for w in WORD.findall(str(value))}

    out: Dict[str, Tuple[str, str]] = {}
    people = [p.get("name") or "" for p in dossier.get("people") or []]
    for name in people:
        for token in _name_tokens(name):
            if token.lower() not in allowed:
                out.setdefault(token.lower(), (name, PERSON))

    named = set(people)
    for key in fmap:
        # A key that is also a `people[]` entry is a person, and was already
        # taken at the stronger severity above.
        if key in named:
            continue
        for token in _name_tokens(key):
            if token.lower() not in allowed:
                out.setdefault(token.lower(), (key, PLACE))
    return out


def _quote(text: str, at: int, end: int) -> str:
    """The matched token with enough of its line around it to be recognised."""
    line_start = text.rfind("\n", 0, at) + 1
    line_end = text.find("\n", end)
    line_end = len(text) if line_end < 0 else line_end
    left = max(line_start, at - QUOTE_WIDTH)
    right = min(line_end, end + QUOTE_WIDTH)
    return (("…" if left > line_start else "")
            + text[left:right].strip()
            + ("…" if right < line_end else ""))


def _where_list(labels: Sequence[str]) -> str:
    shown = ", ".join(labels[:3])
    rest = len(labels) - 3
    return shown + (f" (+{rest} more)" if rest > 0 else "")


def find_real_names(dossier: Dict[str, Any],
                    texts: Mapping[str, str]) -> List[NameHit]:
    """
    Every real-name token that reached generated text. `texts` is label -> prose.

    Shared by the mainline (`validate_output`) and the spinoffs
    (`validation.checks.check_real_names`) so the two cannot drift: a name the
    serial writer is blocked for is a name the spinoff writer is blocked for.
    """
    tokens = real_name_tokens(dossier)
    hits: List[NameHit] = []
    for token, (entry, kind) in sorted(tokens.items()):
        pattern = _token_pattern(token)
        where: List[str] = []
        quote = ""
        for label, text in texts.items():
            found = pattern.search(text or "")
            if not found:
                continue
            where.append(label)
            quote = quote or _quote(text, found.start(), found.end())
        # One finding per token, not one per occurrence. A surname used in
        # forty beats is one decision to fix, and forty lines of it is how a
        # report stops being read.
        if where:
            hits.append(NameHit(token, entry, kind, _where_list(where), quote))
    return hits


def _beat_texts(beats: Sequence[Dict[str, Any]]) -> Dict[str, str]:
    """The prose a beat carries, keyed by beat id. Ids and char ids are ours."""
    out: Dict[str, str] = {}
    for beat in beats:
        changes = beat.get("state_changes") or []
        parts = [str(beat.get("what_happened") or ""),
                 str(beat.get("location") or ""),
                 " ".join(str(c.get("fact", "")) if isinstance(c, dict) else str(c)
                          for c in changes)]
        out[f"beat {beat.get('beat_id', '?')}"] = " ".join(parts)
    return out


def real_names_on_the_page(dossier: Dict[str, Any],
                           beats: Sequence[Dict[str, Any]],
                           scripts: Optional[Mapping[str, str]] = None,
                           ) -> Tuple[List[str], List[str]]:
    """
    Hard rule 4, over the beats and the scripts. Returns `(fatal, advisory)`.

    A person's name is fatal and a place name is advisory, and the split is
    deliberate:

    - A person is identifiable and cannot be un-named once an episode is out.
      `story3_revenge` adapts a bonded-labour case and its script says "Nepal
      Manjhi's house"; there is a woman with that surname in that case file. No
      deadline makes that publishable, so it blocks — which is the same argument
      `src/publish.py` makes for refusing at all.
    - A place is a judgement. The dossiers deliberately keep some real geography
      ("Scotland remains the historical region") and the map's right-hand side
      is where that decision is written down; a mechanical block would overrule
      an editor who already thought about it. It is also where the remaining
      false positives live, because place keys are the ones carrying generic
      nouns. So it is reported, with the map entry it came from, and a person
      decides whether to fix the script or the map.
    """
    texts = dict(_beat_texts(beats))
    texts.update(scripts or {})

    by_kind: Dict[str, List[str]] = {PERSON: [], PLACE: []}
    for hit in find_real_names(dossier, texts):
        what = ("the real person" if hit.kind == PERSON
                else "the real name")
        by_kind[hit.kind].append(
            f"{hit.token!r} — from {what} {hit.entry!r} — appears in "
            f"{hit.where} and has no fictional counterpart on the page: "
            f"\"{hit.quote}\""
        )
    return by_kind[PERSON], by_kind[PLACE]


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
                    beats: Sequence[Dict[str, Any]],
                    scripts: Optional[Mapping[str, str]] = None,
                    ) -> Tuple[List[str], List[str]]:
    """
    Grade one beat sheet against its dossier. Returns `(fatal, advisory)`.

    Fatal problems corrupt a query and are invisible afterwards — see the module
    docstring for the argument. Advisory problems need a human to read a line.
    Neither raises; the caller decides what a fatal list means, exactly as
    `main()` does for `unmapped_names()`.

    `scripts` is label -> episode prose, for hard rule 4. The beats are always
    checked; the scripts are checked when the caller has them. `load_story()`
    reads them off disk and hangs them on the dossier as `_scripts`, so
    `publish.check()` — the last gate before listeners, and the one that matters
    most here — gets them without having to ask.
    """
    if scripts is None:
        scripts = dossier.get("_scripts") or {}
    real_person, real_place = real_names_on_the_page(dossier, beats, scripts)

    fatal = (untraceable_beats(dossier, beats)
             + unknown_participants(dossier, beats)
             + contradictory_beats(beats)
             + real_person)
    advisory = (unstated_ignorance(dossier, beats)
                + present_but_unstated(beats)
                + thin_characters(dossier, beats)
                + alleged_as_fact(dossier, beats)
                + real_place)

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


def episode_scripts(story_dir: pathlib.Path) -> Dict[str, str]:
    """The written episodes, `ep04.md -> prose`. Empty if none exist yet."""
    episodes = story_dir / "episodes"
    if not episodes.is_dir():
        return {}
    return {p.name: p.read_text(encoding="utf-8", errors="replace")
            for p in sorted(episodes.iterdir())
            if p.is_file() and p.suffix == ".md"}


def load_story(story_dir: pathlib.Path) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    """
    The dossier and the beat sheet, plus the scripts hung on the dossier.

    The scripts ride on the dossier under `_scripts` rather than widening the
    return, because the callers that matter — `publish.check()` above all —
    unpack a pair. The dossiers already carry `_`-prefixed working keys, and
    nothing writes this one back out.
    """
    dossier_path = story_dir / "dossier.json"
    if not dossier_path.exists():
        raise RuntimeError(f"no dossier at {dossier_path}")
    dossier = read_json(dossier_path)
    dossier["_scripts"] = episode_scripts(story_dir)
    return dossier, load_beats(story_dir / "beats.json")


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
