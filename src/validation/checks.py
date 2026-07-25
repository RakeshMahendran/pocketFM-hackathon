"""
The checks that do not need a model.

These are the guarantee. The panel next door is six LLM opinions and it is evidence
— useful, demoable, and capable of missing things. `set(cites) <= set(allowed_ids)`
cannot miss anything, cannot be argued with, and costs nothing.

Say it that way out loud too: the checker is how we *show* continuity holds, not how
it is enforced.
"""

from typing import Any, Dict, List

from src.canon import store

ERROR = "error"
WARN = "warn"


def violation(check: str, why: str, severity: str = ERROR, quote: str = "",
              beat_id: str = "", source: str = "deterministic") -> Dict[str, Any]:
    """One shape for every finding, whether a set operation or a model produced it."""
    return {"check": check, "severity": severity, "quote": quote,
            "beat_id": beat_id, "why": why, "source": source}


def check_cites(spinoff: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Every claim traces to a beat she is allowed to know.

    The whole product in one set difference.
    """
    allowed = set(spinoff["forbidden"]["allowed_ids"])
    forbidden = set(spinoff["forbidden"]["forbidden_ids"])
    out = []
    for cited in spinoff.get("cites", []):
        if cited in allowed:
            continue
        if cited in forbidden:
            fact = next((f["fact"] for f in spinoff["forbidden"]["forbidden"]
                         if f["beat_id"] == cited), "")
            out.append(violation(
                "leakage", f"the episode rests a claim on {cited}, which "
                           f"{spinoff['char_id']} does not know: {fact}",
                beat_id=cited))
        else:
            out.append(violation(
                "citation", f"cites {cited}, which is not a beat in this season",
                beat_id=cited))
    return out


def check_crossings(spinoff: Dict[str, Any]) -> List[Dict[str, Any]]:
    """A crossing point can only cross a beat she witnessed."""
    allowed = set(spinoff["forbidden"]["allowed_ids"])
    out = []
    for crossing in spinoff.get("crossings", []):
        bid = crossing.get("mainline_beat_id", "")
        if bid not in allowed:
            out.append(violation(
                "crossing", f"claims to cross {bid}, which is not a beat "
                            f"{spinoff['char_id']} witnessed",
                beat_id=bid, quote=crossing.get("rendered_as", "")[:200]))
    return out


def check_branch_beats(spinoff: Dict[str, Any],
                       story: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Hard rule 2 — a spinoff never mutates core canon.

    `seal_branch_beats` stamps these in Python, so a finding here means the sealing
    was bypassed rather than that the model misbehaved.
    """
    mainline = set(story["beat_index"])
    out = []
    for beat in spinoff.get("beats", []):
        bid = beat.get("beat_id", "?")
        if beat.get("tier") != "branch_canon":
            out.append(violation("tier", f"branch beat {bid} is tier "
                                         f"{beat.get('tier')!r}, not branch_canon",
                                 beat_id=bid))
        if beat.get("pov") != spinoff["char_id"]:
            out.append(violation("tier", f"branch beat {bid} has pov "
                                         f"{beat.get('pov')!r}", beat_id=bid))
        if bid in mainline:
            out.append(violation("tier", f"branch beat id {bid} collides with a "
                                         "mainline beat and would overwrite canon",
                                 beat_id=bid))
    return out


def check_real_names(spinoff: Dict[str, Any],
                     story: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Hard rule 4 — no real name reaches generated fiction.

    Checks the keys of `fictionalization_map`, not `people[].name`. The delivered
    dossiers deliberately record people by role ("The arrested teacher"), so the
    people list contains no real names to find and checking it proves nothing. The
    live exposure is the place names: the real district, the real taluks, the real
    villages.
    """
    script = spinoff.get("episode", {}).get("script", "")
    haystack = script.lower()
    out = []
    for real in story["dossier"].get("fictionalization_map", {}):
        # Role labels are also keys and are harmless. Real proper nouns are what
        # matter, and they are the multi-word capitalised ones.
        if real.lower().startswith("the "):
            continue
        if real.lower() in haystack:
            out.append(violation(
                "clearance", f"the real name {real!r} appears in the script and "
                             "must be replaced by its fictional counterpart",
                quote=real))
    return out


def deterministic(spinoff: Dict[str, Any],
                  story: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Every model-free check, in one call.

    Hook repetition is deliberately not here. Deciding whether an ending repeats a
    move requires reading the ending, so it belongs to the panel, which does it in
    `prompts/hook.md`. A second version that only reprints the mainline's hook type
    would look like a check and verify nothing.
    """
    return (check_cites(spinoff)
            + check_crossings(spinoff)
            + check_branch_beats(spinoff, story)
            + check_real_names(spinoff, story))
