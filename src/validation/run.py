"""
Validate a generated spinoff episode.

    python tasks.py validate --file data/spinoffs/<story>__<char>__b033.json
    python tasks.py validate --proof --story <story> --char ratnamma

`--proof` is Gate 3: generate the same episode twice, once with the prohibition
block and once without, and show the panel catching a real violation in the
unconstrained run. A checker that has only ever shown green reads as decorative.

Exit code is 0 whenever the panel completed, whatever it found — `run_module`
prints an owner hint on any non-zero return, and a validator exiting 1 *because it
worked* looks like a crash at the worst possible moment. `--strict` opts into
violations-as-failure for CI.
"""

import sys
import json
import pathlib
import argparse
from typing import Any, Dict

from src.canon import store
from src.validation import checks, panel
from src.util import SPINOFFS, load_env, log, read_json, write_json


def validate(spinoff: Dict[str, Any], story: Dict[str, Any],
             client: Any = None) -> Dict[str, Any]:
    """Deterministic checks first, then the panel. Their findings share one shape."""
    hard = checks.deterministic(spinoff, story)
    result = panel.run_panel(spinoff, story, client=client)

    all_v = panel.dedupe(hard + result["violations"])
    errors = [v for v in all_v if v["severity"] == checks.ERROR]

    if result["inconclusive"]:
        status = "inconclusive"
    elif errors:
        status = "violations"
    else:
        status = "clean"

    return {
        "story_id": spinoff["story_id"], "char_id": spinoff["char_id"],
        "anchor_beat_id": spinoff.get("anchor_beat_id"),
        "constrained": spinoff.get("constrained", True),
        "status": status,
        "violations": all_v,
        "n_errors": len(errors),
        "deterministic_errors": [v for v in hard if v["severity"] == checks.ERROR],
        "inconclusive": result["inconclusive"],
        "attempts_that_failed": result["attempts_that_failed"],
        "members_run": result["members_run"],
        "members_expected": result["members_expected"],
    }


def report(result: Dict[str, Any]) -> None:
    mark = {"clean": "CLEAN", "violations": "VIOLATIONS",
            "inconclusive": "INCONCLUSIVE"}[result["status"]]
    print(f"\n  {mark}  —  {result['char_id']} / {result['anchor_beat_id']}"
          f"  ({'constrained' if result['constrained'] else 'UNCONSTRAINED'})")
    print(f"  {result['members_run']}/{result['members_expected']} panel members "
          f"reported · {result['n_errors']} violation(s)\n")

    for v in result["violations"]:
        head = f"  [{v['severity']}] {v['check']}"
        if v["beat_id"]:
            head += f" · {v['beat_id']}"
        print(f"{head}  ({v['source']})")
        if v["quote"]:
            print(f"      \"{v['quote'][:100]}\"")
        print(f"      {v['why']}")

    if result["inconclusive"]:
        print(f"\n  did not report: {', '.join(result['inconclusive'])}")
        print("  a member that did not answer is not a member that found nothing")

    # Printed on clean runs too: this is what turns "we found nothing" into
    # "we looked, here is where".
    for name, attempts in result["attempts_that_failed"].items():
        print(f"\n  {name} tried and could not break:")
        for a in attempts[:4]:
            print(f"      - {a}")
    print()


def _proof(args) -> int:
    """Gate 3 — the controlled experiment."""
    from src.generation import promote as promote_mod
    from src.generation import spinoff as spinoff_mod

    story = store.load_story(args.story)
    bible = promote_mod.load_bible(args.story, args.char)
    anchor = args.anchor or spinoff_mod.default_anchor(story, args.char)

    out = {}
    for constrained in (False, True):
        label = "constrained" if constrained else "unconstrained"
        log(f"generating the {label} run")
        record = spinoff_mod.write_spinoff(story, args.char, anchor, bible=bible,
                                           constrained=constrained)
        path = spinoff_mod.spinoff_path(args.story, args.char, anchor, constrained)
        write_json(path, record)

        result = validate(record, story)
        write_json(path.with_name(path.stem + "__validation.json"), result)
        report(result)
        out[label] = result

    leaked = [v for v in out["unconstrained"]["violations"]
              if v["check"] == "leakage" and v["severity"] == checks.ERROR]
    clean = out["constrained"]["n_errors"] == 0

    print("=" * 72)
    if not leaked:
        log("the unconstrained run came back clean. That means the panel is broken, "
            "not that the generation is safe — a writer with no prohibition list "
            "and full canon in front of it will leak. Fix the panel before "
            "demoing this.", "error")
        return 1

    print(f"  unconstrained: leaked {len(leaked)} fact(s) — "
          f"{', '.join(sorted({v['beat_id'] for v in leaked if v['beat_id']}))}")
    print(f"  constrained:   {'clean' if clean else str(out['constrained']['n_errors']) + ' violation(s)'}")
    print("=" * 72 + "\n")

    write_json(SPINOFFS / "leak_proof.json",
               {"anchor": anchor, "char_id": args.char, "story_id": args.story,
                "unconstrained": out["unconstrained"], "constrained": out["constrained"]})
    return 0 if clean else 1


def main() -> int:
    load_env()
    parser = argparse.ArgumentParser(prog="validate")
    parser.add_argument("--story", default=store.DEFAULT_STORY)
    parser.add_argument("--char", default=store.DEFAULT_CHAR)
    parser.add_argument("--anchor", default=None)
    parser.add_argument("--file", default=None, help="a spinoff json to validate")
    parser.add_argument("--proof", action="store_true",
                        help="Gate 3: generate constrained and unconstrained, compare")
    parser.add_argument("--strict", action="store_true",
                        help="exit 1 when violations are found")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    try:
        if args.proof:
            return _proof(args)

        story = store.load_story(args.story)
        if args.file:
            path = pathlib.Path(args.file)
        else:
            from src.generation.spinoff import spinoff_path, default_anchor
            anchor = args.anchor or default_anchor(story, args.char)
            path = spinoff_path(args.story, args.char, anchor)
        if not path.exists():
            raise RuntimeError(f"no spinoff at {path} — run `tasks.py spinoff` first")

        spinoff = read_json(path)
        result = validate(spinoff, story)
        write_json(path.with_name(path.stem + "__validation.json"), result)
    except (RuntimeError, ValueError, KeyError, json.JSONDecodeError) as exc:
        log(str(exc), "error")
        return 1

    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        report(result)

    if args.strict and result["status"] != "clean":
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
