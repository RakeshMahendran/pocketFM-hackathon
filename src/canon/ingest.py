"""
Put the artifacts on disk into the canon store.

`seed` loads one mainline beat sheet. This loads everything the generation and
validation stages wrote to `data/spinoffs/` — the bibles, both arms of every
episode, the sealed branch beats, and the panel verdicts with their violations —
together with the mainline beats of every story those artifacts belong to.

The mainline goes first and is not optional. A spinoff's `cites` and a branch
beat's `crossing_of` both name mainline beat ids, so loading the branch without
the trunk leaves every one of those pointing at nothing. A dangling reference is
worse than a missing story: the first reads as canon and answers wrongly, the
second answers not-found.

Named `ingest` rather than `publish`. `src/publish.py` is the editorial decision
to put a written season in front of listeners, and two modules called publish
doing unrelated jobs is exactly the confusion this codebase spends its docstrings
avoiding.

Idempotent throughout, because it is a demo reset button as much as a loader.
Every write goes through a pgstore `load_*`, which upserts on its primary key,
and the two collections that can *shrink* between runs — a spinoff's branch beats
and a validation's violations — are replaced rather than merged by the store
itself.

Run `--check` first if anything is wrong. Four things stand between this command
and a loaded database and only one of them produces a sensible error on its own.
"""

import argparse
import json
import os
import pathlib
import subprocess
import sys
from typing import Any, Optional

import psycopg

from src.canon import db
from src.canon import pgstore as store
from src.util import SPINOFFS, STORIES, load_env, log, read_json

Record = dict[str, Any]

BIBLE, EPISODE, VALIDATION = "bible", "episode", "validation"

# Within one story: the bible before the episode that was written from it, and
# the episode before the verdict passed on it. Neither is a foreign key — the
# order is so that a run that dies halfway leaves a prefix of the pipeline rather
# than a verdict on an episode nobody can read.
_ORDER = {BIBLE: 0, EPISODE: 1, VALIDATION: 2}

_LEAK = "leak"
_JSON = ".json"


# ---------------------------------------------------------------------------
# WHAT IS ON DISK
# ---------------------------------------------------------------------------

def parse_artifact(filename: str) -> Optional[Record]:
    """
    Read story, character, anchor and arm out of an artifact filename.

    The names are built by `promote.bible_path` and `spinoff.spinoff_path` as
    `{story_id}__{char_id}__{anchor}[__leak][__validation].json`, with the bible
    taking `bible` where an anchor would go. Story ids carry underscores of their
    own — `story1_denied_identity` — so this splits on the *double* underscore
    and reads from the right, taking everything left of the last two fields as
    the story. Counting fields from the left cuts the story id in half; assuming
    a field count breaks the first time a story id contains a `__`.

    Returns None for anything that is not one of those three shapes, which is how
    `leak_proof.json` and any hand-dropped file get left alone rather than
    guessed at.
    """
    if not filename.endswith(_JSON):
        return None
    parts = filename[: -len(_JSON)].split("__")

    kind, constrained = EPISODE, True
    if len(parts) > 1 and parts[-1] == VALIDATION:
        kind, parts = VALIDATION, parts[:-1]
    if len(parts) > 1 and parts[-1] == _LEAK:
        constrained, parts = False, parts[:-1]

    # `{story}__{char}__bible` — a bible belongs to a character, not to a moment,
    # and there is only ever one of it.
    is_bible = parts[-1] == BIBLE and kind == EPISODE and constrained
    if len(parts) < 3 or not "__".join(parts[:-2]):
        return None

    return {
        "kind": BIBLE if is_bible else kind,
        "story_id": "__".join(parts[:-2]),
        "char_id": parts[-2],
        "anchor_beat_id": None if is_bible else parts[-1],
        "constrained": constrained,
    }


def artifacts(root: pathlib.Path = SPINOFFS) -> tuple[list[Record], list[tuple[str, str]]]:
    """Every artifact under `root` that names itself, and every file that does not."""
    found: list[Record] = []
    skipped: list[tuple[str, str]] = []
    for path in sorted(root.glob("*" + _JSON)):
        parsed = parse_artifact(path.name)
        if parsed is None:
            skipped.append((path.name, "not a promote / spinoff / validate output"))
            continue
        parsed["path"] = path
        found.append(parsed)
    return found, skipped


def core_beats(story_id: str) -> Optional[list[Record]]:
    """
    The story's mainline beat sheet, or None when the story is not on disk.

    A delivered story wraps its list in a dict; `seed` reads the same two shapes
    for the same reason.
    """
    path = STORIES / story_id / "beats.json"
    if not path.exists():
        return None
    raw = read_json(path)
    return raw["beats"] if isinstance(raw, dict) else raw


# ---------------------------------------------------------------------------
# LOADING
# ---------------------------------------------------------------------------

def _mismatch(art: Record, record: Record) -> Optional[str]:
    """
    The filename is a hint; the record is the artifact's own claim about itself.

    When they disagree one of them is wrong and there is no way to tell which, so
    the artifact is refused rather than filed under a guess. Silently trusting
    either would put an episode under a character who did not write it.
    """
    for key in ("story_id", "char_id", "anchor_beat_id"):
        if record.get(key) != art[key]:
            return (f"the filename says {key}={art[key]!r} and the record says "
                    f"{record.get(key)!r}")
    if record.get("constrained", True) != art["constrained"]:
        return (f"the filename says constrained={art['constrained']} and the "
                f"record says {record.get('constrained')}")
    return None


def colliding_beat_ids(record: Record, conn: psycopg.Connection,
                       schema: str = store.DEFAULT_SCHEMA) -> list[str]:
    """
    Sealed branch beat ids that already belong to a *different* episode.

    `seal_branch_beats` numbers a branch beat `x_<char>_001` from one inside each
    episode, so Ratnamma's b014 episode and her b033 episode both claim
    `x_ratnamma_001`. The store's BEFORE UPDATE trigger refuses the second one on
    purpose — and refuses it by raising, which aborts the transaction the episode
    row was written in and costs the artifact as well as its beats.

    So ask before writing. The loss is then one episode's beats and a named
    reason, not a rolled-back batch with a plpgsql message on top of it.
    """
    if not record.get("constrained", True):
        return []  # the control arm's beats are never written back at all
    story_id, char_id = record["story_id"], record["char_id"]
    anchor = record["anchor_beat_id"]
    # This episode's own rows from a previous run are not a collision: load_spinoff
    # deletes them before it reloads.
    mine = {b["beat_id"] for b in
            store.branch_beats(story_id, char_id, anchor, conn, schema=schema)}
    return [b["beat_id"] for b in record.get("beats", [])
            if b.get("beat_id") not in mine
            and store.get_beat(story_id, b["beat_id"], conn, schema=schema)]


def _load_bible(art: Record, conn: psycopg.Connection, schema: str,
                summary: Record) -> Optional[str]:
    record = read_json(art["path"])
    if record.get("char_id") != art["char_id"]:
        return (f"the filename says char_id={art['char_id']!r} and the record "
                f"says {record.get('char_id')!r}")
    # A bible does not carry its story — it is written per story directory and
    # identified by its filename, which is why load_bible takes one separately.
    store.load_bible(record, art["story_id"], conn, schema=schema)
    summary["loaded"]["bibles"] += 1
    return None


def _load_episode(art: Record, conn: psycopg.Connection, schema: str,
                  summary: Record) -> Optional[str]:
    record = read_json(art["path"])
    bad = _mismatch(art, record)
    if bad:
        return bad

    clash = colliding_beat_ids(record, conn, schema=schema)
    if clash:
        note = (f"{art['path'].name}: kept the episode, dropped its beats — "
                f"{', '.join(clash)} already belong to another episode. "
                "seal_branch_beats numbers branch beats per episode, so two "
                "episodes of one character claim the same ids")
        log(note, "error")
        summary["notes"].append(note)
        record = dict(record, beats=[])

    summary["loaded"]["branch_beats"] += store.load_spinoff(record, conn, schema=schema)
    summary["loaded"]["episodes"] += 1
    if not record.get("constrained", True):
        summary["loaded"]["control_arms"] += 1
    return None


def _load_validation(art: Record, conn: psycopg.Connection, schema: str,
                     summary: Record) -> Optional[str]:
    record = read_json(art["path"])
    bad = _mismatch(art, record)
    if bad:
        return bad
    summary["loaded"]["violations"] += store.load_validation(record, conn, schema=schema)
    summary["loaded"]["validations"] += 1
    return None


_LOADERS = {BIBLE: _load_bible, EPISODE: _load_episode, VALIDATION: _load_validation}


def _blank_summary() -> Record:
    return {
        "stories": [],
        "loaded": {"core_beats": 0, "bibles": 0, "episodes": 0, "control_arms": 0,
                   "branch_beats": 0, "validations": 0, "violations": 0},
        "skipped": [],
        "notes": [],
    }


def ingest(schema: str = store.DEFAULT_SCHEMA, story: Optional[str] = None,
           root: pathlib.Path = SPINOFFS) -> Record:
    """
    Walk `root` and load everything in it, mainline first, story by story.

    One artifact's failure is survivable and does not take the rest with it: a
    psycopg error poisons the whole transaction, so a failed artifact is rolled
    back, named, and stepped over. Half a database with a list of what is missing
    beats an empty one with a traceback.
    """
    summary = _blank_summary()
    found, summary["skipped"] = artifacts(root)
    if story:
        found = [a for a in found if a["story_id"] == story]
    if not found:
        log(f"no artifacts to load from {root}", "warn")
        return summary

    by_story: dict[str, list[Record]] = {}
    for art in found:
        by_story.setdefault(art["story_id"], []).append(art)

    with db.connect() as conn:
        store.init_schema(conn, schema=schema)
        for story_id in sorted(by_story):
            beats = core_beats(story_id)
            if beats is None:
                why = (f"no data/stories/{story_id}/beats.json — its branch beats "
                       "and citations would reference mainline beats that are not "
                       "loaded")
                summary["skipped"] += [(a["path"].name, why) for a in by_story[story_id]]
                log(f"{story_id}: skipped {len(by_story[story_id])} artifact(s), {why}",
                    "warn")
                continue

            summary["loaded"]["core_beats"] += store.load_beats(
                beats, story_id, conn, schema=schema)
            summary["stories"].append(story_id)

            for art in sorted(by_story[story_id],
                              key=lambda a: (_ORDER[a["kind"]], a["path"].name)):
                try:
                    reason = _LOADERS[art["kind"]](art, conn, schema, summary)
                except Exception as exc:  # noqa: BLE001 - one bad file, not the run
                    conn.rollback()
                    reason = _one_line(exc)
                if reason:
                    summary["skipped"].append((art["path"].name, reason))
                    log(f"{art['path'].name}: {reason}", "warn")

    return summary


# ---------------------------------------------------------------------------
# PREFLIGHT
# ---------------------------------------------------------------------------
#
# Four things stand between this command and a loaded database, and three of them
# surface as the same psycopg.OperationalError if you just try. On a stage that
# is indistinguishable from the demo being broken, so each one gets asked
# separately, in dependency order, before anything is written.

OK, WARN, FAIL, SKIP = "ok", "warn", "fail", "skip"

CLI, AUTH, INSTANCE, SCHEMA = "cli", "auth", "instance", "schema"

_CLI_TIMEOUT = 30


def _one_line(exc: Exception) -> str:
    return " ".join(str(exc).split())[:300] or exc.__class__.__name__


def _result(check: str, status: str, detail: str, fix: str = "") -> Record:
    return {"check": check, "status": status, "detail": detail, "fix": fix}


def _cli(*args: str) -> tuple[int, str, str]:
    """
    Run the Databricks CLI. Returns (rc, stdout, stderr), rc 127 when it is absent.

    Read-only subcommands only, and never `auth login` — that one opens a browser
    and blocks, which is the opposite of what a preflight is for.
    """
    try:
        done = subprocess.run(["databricks", *args], capture_output=True,
                              text=True, timeout=_CLI_TIMEOUT)
    except FileNotFoundError:
        return 127, "", "databricks is not on PATH"
    except subprocess.TimeoutExpired:
        return 124, "", f"`databricks {' '.join(args)}` did not return in {_CLI_TIMEOUT}s"
    return done.returncode, done.stdout, done.stderr


def _sdk_credential() -> str:
    """
    The credential the SDK could use without the CLI, or "".

    Two of them, and neither needs `databricks` on PATH: the `DATABRICKS_*`
    variables that Apps and CI inject, and `~/.databrickscfg`, which the CLI
    writes but the SDK reads for itself. So a missing CLI is an inconvenience
    here, not necessarily a blocker.
    """
    if os.environ.get("DATABRICKS_HOST") and (
            os.environ.get("DATABRICKS_TOKEN")
            or os.environ.get("DATABRICKS_CLIENT_ID")):
        return f"DATABRICKS_HOST={os.environ['DATABRICKS_HOST']}"
    override = os.environ.get("DATABRICKS_CONFIG_FILE")
    cfg = pathlib.Path(override) if override else pathlib.Path.home() / ".databrickscfg"
    return str(cfg) if cfg.exists() else ""


def check_cli() -> Record:
    rc, out, err = _cli("--version")
    if rc == 0:
        return _result(CLI, OK, out.strip() or "databricks CLI on PATH")
    found = _sdk_credential()
    if found:
        return _result(CLI, WARN, "no databricks CLI on PATH",
                       f"the SDK can still authenticate from {found} — nothing to "
                       "do unless you want `databricks psql` or `auth login`")
    return _result(CLI, FAIL, err.strip() or f"databricks --version exited {rc}",
                   "install it (`winget install Databricks.DatabricksCLI`), or "
                   "reopen the terminal — the installer edits the machine PATH and "
                   "an already-open shell keeps the PATH it started with")


def check_auth() -> Record:
    """
    Whether a workspace credential resolves at all.

    Lakebase has no password: `db.credential()` mints an OAuth token per hour off
    the same profile the CLI reads, so no credential here means no database later,
    however healthy the instance is.
    """
    rc, out, err = _cli("auth", "describe", "-o", "json")
    if rc == 127:
        found = _sdk_credential()
        if found:
            # Present is not the same as valid, and without the CLI there is no
            # way to resolve it short of using it. `schema` below is the real
            # arbiter, so this warns rather than claiming an answer it doesn't have.
            return _result(AUTH, WARN, f"unverified — a credential exists at {found}",
                           "install the CLI if you want this checked properly")
        return _result(AUTH, FAIL, "no CLI, no DATABRICKS_* variables, "
                                   "no ~/.databrickscfg",
                       "`databricks auth login --host https://<workspace>` writes "
                       "~/.databrickscfg, which is what the SDK reads locally")

    # `auth describe` exits 0 and reports status "error" when nothing resolves, so
    # the exit code alone is not the answer.
    try:
        payload = json.loads(out)
    except (ValueError, TypeError):
        payload = {}
    if rc != 0 or payload.get("status") != "success":
        why = ((payload.get("error") or {}).get("message")
               or err.strip() or "no profile resolved")
        return _result(AUTH, FAIL, f"not authenticated — {why}",
                       "`databricks auth login --host https://<workspace>`, then "
                       "`databricks auth profiles` to confirm")
    details = payload.get("details", {})
    return _result(AUTH, OK, f"{details.get('username', '?')} on "
                             f"{details.get('host', '?')} "
                             f"via {details.get('auth_type', '?')}")


def check_instance(name: Optional[str] = None) -> Record:
    """
    Whether the instance exists and is up.

    Asked through the SDK rather than `databricks database get-database-instance`
    so it fails where the demo would: `db._host()` makes this exact call to find
    the DNS name to connect to.
    """
    name = name or db.INSTANCE
    try:
        from databricks.sdk import WorkspaceClient

        inst = WorkspaceClient().database.get_database_instance(name=name)
    except Exception as exc:  # noqa: BLE001 - SDK raises a family of these
        return _result(INSTANCE, FAIL, f"could not read `{name}` — {_one_line(exc)}",
                       "`databricks database list-database-instances` lists what "
                       "you can see; LAKEBASE_INSTANCE overrides the name")

    state = getattr(inst.state, "value", inst.state) or "unknown"
    dns = inst.read_write_dns or "no read_write_dns"
    if state == "AVAILABLE":
        return _result(INSTANCE, OK, f"{name} AVAILABLE at {dns}")
    if state in ("STARTING", "STOPPED"):
        return _result(INSTANCE, WARN, f"{name} is {state}",
                       "Autoscaling suspends an idle instance to zero and the "
                       "first connection resumes it — measured at ~19s, inside "
                       "the 45s connect timeout. Expect the next check to be slow")
    return _result(INSTANCE, FAIL, f"{name} is {state}",
                   "wait for it, or check the instance in the workspace")


def check_schema(schema: str = store.DEFAULT_SCHEMA) -> Record:
    """Whether the connection opens and the schema is there to write into."""
    try:
        with db.connect() as conn, conn.cursor() as cur:
            cur.execute("SELECT current_database(), current_user")
            dbname, user = cur.fetchone()
            cur.execute("SELECT 1 FROM information_schema.schemata "
                        "WHERE schema_name = %s", (schema,))
            present = cur.fetchone() is not None
    except psycopg.OperationalError as exc:
        return _result(SCHEMA, FAIL, f"the connection was refused — {_one_line(exc)}",
                       "the credential and the instance both answered, so this is "
                       "the network, SSL, or PGUSER not being a role on the instance")
    except Exception as exc:  # noqa: BLE001
        return _result(SCHEMA, FAIL, _one_line(exc), "")
    if not present:
        return _result(SCHEMA, WARN, f'"{schema}" does not exist yet in {dbname}',
                       "nothing to fix — init_schema creates it on the first load")
    return _result(SCHEMA, OK, f'"{schema}" reachable in {dbname} as {user}')


def preflight(schema: str = store.DEFAULT_SCHEMA) -> list[Record]:
    """
    The four checks, in dependency order, stopping at the first hard failure.

    Stopping matters: asking for the instance without a credential, or opening a
    connection without an instance, produces exactly the unreadable error this
    exists to replace. A skipped check says which earlier one to fix.
    """
    results: list[Record] = []
    blocker = ""
    for check, run in ((CLI, check_cli), (AUTH, check_auth),
                       (INSTANCE, check_instance),
                       (SCHEMA, lambda: check_schema(schema))):
        if blocker:
            results.append(_result(check, SKIP, f"not asked — {blocker} failed first"))
            continue
        result = run()
        results.append(result)
        if result["status"] == FAIL:
            blocker = check
            log(f"preflight {check}: {result['detail']}", "error")
        elif result["status"] == WARN:
            log(f"preflight {check}: {result['detail']}", "warn")
    return results


def preflight_ok(results: list[Record]) -> bool:
    return not any(r["status"] == FAIL for r in results)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

_MARK = {OK: "ok", WARN: "warn", FAIL: "FAIL", SKIP: "--"}


def _print_preflight(results: list[Record]) -> None:
    print("\n  PREFLIGHT\n")
    for r in results:
        print(f"  [{_MARK[r['status']]:>4}] {r['check']:9} {r['detail']}")
        if r["fix"] and r["status"] != OK:
            print(f"         {'':9} -> {r['fix']}")
    print()


def _print_summary(summary: Record, schema: str) -> None:
    got = summary["loaded"]
    stories = ", ".join(summary["stories"]) or "none"
    print(f"\n  data/spinoffs -> {schema}   ({stories})\n")
    print(f"  {got['core_beats']:5} mainline beats")
    print(f"  {got['bibles']:5} bibles")
    print(f"  {got['episodes']:5} episodes ({got['control_arms']} unconstrained "
          f"control arm(s), whose beats are never written back)")
    print(f"  {got['branch_beats']:5} branch beats")
    print(f"  {got['validations']:5} validations · {got['violations']} violations")

    for note in summary["notes"]:
        print(f"\n  ! {note}")
    if summary["skipped"]:
        print(f"\n  skipped {len(summary['skipped'])}:")
        for name, why in summary["skipped"]:
            print(f"      {name}\n          {why}")
    print()


def main(argv=None) -> int:
    load_env()
    parser = argparse.ArgumentParser(prog="ingest")
    parser.add_argument("--schema", default=store.DEFAULT_SCHEMA)
    parser.add_argument("--story", default=None,
                        help="load only this story's artifacts")
    parser.add_argument("--check", action="store_true",
                        help="run the preflight and stop, loading nothing")
    args = parser.parse_args(argv)

    results = preflight(args.schema)
    _print_preflight(results)
    if args.check:
        return 0 if preflight_ok(results) else 1
    if not preflight_ok(results):
        log("refusing to load — fix the failing check above", "error")
        return 1

    try:
        summary = ingest(schema=args.schema, story=args.story)
    except Exception as exc:  # noqa: BLE001 - the preflight passed, so this is news
        log(_one_line(exc), "error")
        return 1

    _print_summary(summary, args.schema)
    wrote = sum(summary["loaded"][k] for k in ("bibles", "episodes", "validations"))
    if summary["skipped"] and not wrote:
        log("nothing loaded — every artifact was skipped", "error")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
