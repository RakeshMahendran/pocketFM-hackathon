"""
The validator panel — three checks and three refuters, run concurrently.

One stage, six calls. The refuters exist because a checker asked to confirm
cleanliness will confirm cleanliness; each of them is told to assume a violation
exists and go find it, and each reports what it tried and failed to break. That
list is what makes a green result readable as work rather than as silence.

This is evidence. The guarantee is in checks.py, where a set difference decides.
"""

import json
import pathlib
import concurrent.futures as cf
from typing import Any, Dict, List

from src.generation.client import call_structured
from src.generation.schemas import obj
from src.validation.checks import ERROR, WARN, violation
from src.util import load_prompt, log, offline

PROMPTS = pathlib.Path(__file__).resolve().parent / "prompts"

# Six independent, network-bound calls with no shared mutable state — the textbook
# ThreadPoolExecutor case, and the GIL is released on socket I/O.
#
# Threads rather than asyncio deliberately: every LLM function in this repo takes
# `client=None` and every test passes a hand-written StubClient with a plain
# `def create`. asyncio would mean AsyncOpenAI, a second client-construction path,
# and rewriting every stub in the suite as async. Do not "modernise" this.
PANEL_WORKERS = 6
PANEL_TIMEOUT_S = 180

REFUTER_LENSES = ("inference", "specificity", "omniscience")


def _jobs(spinoff: Dict[str, Any], story: Dict[str, Any]) -> List[Dict[str, Any]]:
    script = spinoff.get("episode", {}).get("script", "")
    brief_text = _brief_for_panel(spinoff, story)

    crossings = "\n".join(
        f"- [{c['beat_id']}] {c['fact']}"
        for c in spinoff["forbidden"]["allowed"]
        if c["beat_id"] in {x.get("mainline_beat_id") for x in spinoff.get("crossings", [])}
    ) or "(the episode declares no crossing points)"

    season = story["dossier"].get("season", [])
    ep = spinoff.get("anchor", {}).get("ep")
    entry = next((s for s in season if s.get("ep") == ep), {})

    # Names the episode under test, so two spinoffs never share a cached verdict.
    key = (f"{spinoff['story_id']}_{spinoff['char_id']}_"
           f"{spinoff.get('anchor_beat_id', '?')}"
           f"{'' if spinoff.get('constrained', True) else '_naive'}")

    jobs = [
        {"name": "leakage", "prompt": "leakage.md",
         "slots": {"brief": brief_text, "script": script}},
        {"name": "crossing", "prompt": "crossing.md",
         "slots": {"crossings": crossings, "script": script}},
        {"name": "hook", "prompt": "hook.md",
         "slots": {"mainline_hook": entry.get("hook_type", "unknown"), "script": script}},
    ]
    jobs += [
        {"name": f"refuter_{lens}", "prompt": "refuter.md",
         "slots": {"lens": lens, "brief": brief_text, "script": script}}
        for lens in REFUTER_LENSES
    ]
    for job in jobs:
        job["key"] = key
    return jobs


def _brief_for_panel(spinoff: Dict[str, Any], story: Dict[str, Any]) -> str:
    """
    What the panel is allowed to compare against.

    Built from the payload persisted with the episode, not recomputed from canon —
    the check has to be against the list the writer was actually handed.

    The cast block is stated rather than left to inference. Without it the refuters
    reason from the episode alone and report a character for using her neighbours'
    names, because no beat "granted" them — three findings in one run, all the same
    mistake. These people share a village; who they are is ambient. Sealing events
    is the job, and every minute spent arguing about names is a minute the report
    is not trusted.
    """
    payload = spinoff["forbidden"]
    name = spinoff["char_id"]
    allowed = "\n".join(f"- [{a['beat_id']}] {a['fact']}" for a in payload["allowed"])
    forbidden = "\n".join(
        f"- [{f['beat_id']}]{' **' if f['emphasised'] else ''} {f['fact']}"
        for f in payload["forbidden"])
    cast = "\n".join(f"- {c['char_id']} ({c.get('name', c['char_id'])}): "
                     f"{c.get('role', '')}" for c in story["cast"])
    return (f"CHARACTER: {name}\n\n"
            f"WHO SHE KNOWS BY NAME — everyone in this village. Using any of these "
            f"names is never a violation; what happened to them out of her sight "
            f"still is:\n{cast}\n\n"
            f"WHAT SHE KNOWS:\n{allowed}\n\n"
            f"WHAT SHE DOES NOT KNOW (complete list):\n{forbidden}")


CHECK_SCHEMA = obj({
    "violations": {"type": "array", "items": obj({
        "quote": {"type": "string"},
        "beat_id": {"type": "string"},
        "why": {"type": "string"},
    })},
    "checked": {"type": "string"},
})

REFUTER_SCHEMA = obj({
    "found": {"type": "boolean"},
    "violations": {"type": "array", "items": obj({
        "quote": {"type": "string"},
        "beat_id": {"type": "string"},
        "why": {"type": "string"},
    })},
    "attempts_that_failed": {"type": "array", "items": {"type": "string"}},
})


def _run_one(job: Dict[str, Any], client: Any) -> Dict[str, Any]:
    is_refuter = job["name"].startswith("refuter_")
    system = load_prompt(PROMPTS / job["prompt"], **job["slots"])
    result = call_structured(
        stage=f"panel_{job['name']}_{job['key']}", system=system,
        user=f"Run the {job['name']} check and report.",
        schema=REFUTER_SCHEMA if is_refuter else CHECK_SCHEMA,
        schema_name="refuter" if is_refuter else "check",
        role="VALIDATOR", client=client,
    )
    # A soft ending is a craft problem, not a broken guarantee. Reporting it at the
    # same severity as a leak makes "zero contradictions" read as false on an
    # episode that has none — so hook findings are warnings and still print.
    severity = WARN if job["name"] == "hook" else ERROR
    found = [
        violation(job["name"].split("_")[0], v.get("why", ""), severity,
                  quote=v.get("quote", ""), beat_id=v.get("beat_id", ""),
                  source=job["name"])
        for v in result.get("violations", [])
    ]
    return {"name": job["name"], "violations": found,
            "attempts_that_failed": result.get("attempts_that_failed", []),
            "checked": result.get("checked", "")}


def run_panel(spinoff: Dict[str, Any], story: Dict[str, Any],
              client: Any = None) -> Dict[str, Any]:
    jobs = _jobs(spinoff, story)
    results: List[Dict[str, Any]] = []

    if offline():
        # Six cache reads. A pool would add nothing, and running in order means a
        # miss reports which member of the panel has no recording.
        for job in jobs:
            try:
                results.append(_run_one(job, client))
            except (RuntimeError, ValueError, json.JSONDecodeError) as exc:
                results.append(_inconclusive(job, exc))
        return _summarise(results, len(jobs))

    if client is None:
        from openai import OpenAI
        # One client for all six. Six lazy constructions in six threads is six
        # chances to fail on a missing key at six different moments.
        client = OpenAI()

    with cf.ThreadPoolExecutor(max_workers=PANEL_WORKERS) as pool:
        futures = {pool.submit(_run_one, job, client): job for job in jobs}
        for fut in cf.as_completed(futures, timeout=PANEL_TIMEOUT_S):
            job = futures[fut]
            try:
                results.append(fut.result())
            except (RuntimeError, ValueError, json.JSONDecodeError) as exc:
                results.append(_inconclusive(job, exc))
    return _summarise(results, len(jobs))


def _inconclusive(job: Dict[str, Any], exc: Exception) -> Dict[str, Any]:
    """
    A member that did not return a verdict is not a member that found nothing.

    This distinction is the whole reason to report `inconclusive` separately: a
    panel that silently drops a failed call reports "clean" for an episode nobody
    finished checking.
    """
    log(f"panel member {job['name']} returned no verdict: {exc}", "error")
    return {"name": job["name"], "violations": [], "attempts_that_failed": [],
            "checked": "", "inconclusive": str(exc)}


def dedupe(violations: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Six members quoting one line is one violation, not six.

    Without this a single leak reads as a wall of failures and the report looks
    broken rather than precise.
    """
    merged: Dict[tuple, Dict[str, Any]] = {}
    for v in violations:
        key = (v["quote"].strip().lower()[:120], v["beat_id"])
        if key not in merged:
            merged[key] = dict(v)
            continue

        kept = merged[key]
        kept["source"] += f", {v['source']}"

        # Severity is the worst any member reported, not whichever landed
        # first. Results arrive by `as_completed`, so first is thread timing —
        # and the hook member is the only one that reports `warn`. When it
        # quoted the same line as the leakage member and happened to finish
        # first, a real leakage error was rewritten as a note, n_errors fell to
        # zero, and the episode reported clean. A guarantee that depends on
        # which thread returns first is not a guarantee.
        if v.get("severity") == "error":
            kept["severity"] = "error"

        # The check names are unioned for the same reason: whichever arrived
        # first used to name the finding, so a leak could end up labelled
        # "hook" — filed under the one check that is explicitly not a
        # contradiction.
        names = [n.strip() for n in str(kept.get("check", "")).split(",")]
        if v.get("check") and v["check"] not in names:
            kept["check"] = ", ".join([n for n in names if n] + [v["check"]])

        # Two different findings can share a key when both carry an empty
        # quote — `check_branch_beats` emits a tier violation and a pov
        # violation for one beat that way, and one of them used to vanish.
        if v.get("why") and v["why"] not in str(kept.get("why", "")):
            kept["why"] = f"{kept.get('why', '')} {v['why']}".strip()
    return list(merged.values())


def _summarise(results: List[Dict[str, Any]], n_jobs: int) -> Dict[str, Any]:
    violations = dedupe([v for r in results for v in r["violations"]])
    inconclusive = [r["name"] for r in results if r.get("inconclusive")]
    attempts = {r["name"]: r["attempts_that_failed"]
                for r in results if r["attempts_that_failed"]}

    if inconclusive:
        status = "inconclusive"
    elif violations:
        status = "violations"
    else:
        status = "clean"

    return {"status": status, "violations": violations,
            "inconclusive": inconclusive, "attempts_that_failed": attempts,
            "members_run": len(results), "members_expected": n_jobs}
