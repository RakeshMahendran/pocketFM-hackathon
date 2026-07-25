#!/usr/bin/env python
"""
Command runner. Works on Windows and POSIX alike.

`make` is not installed on every dev box on this team, so the real logic lives
here and the Makefile is a thin delegate. One implementation, so the two cannot
drift apart.

    python tasks.py <command> [args]
    python tasks.py --list
"""

import os
import sys
import argparse
import platform
import subprocess
from typing import List, Optional

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from src.util import ROOT, log, ensure_dirs, load_env  # noqa: E402

MIN_PYTHON = (3, 11)

# Which track owns which module, so an unbuilt command says who to go ask
# instead of dumping an ImportError.
OWNERS = {
    "src.discovery": "P3 (Track C)",
    "src.scoring": "P3 (Track C)",
    "src.canon": "P1 (Track A)",
    "src.validation": "P1 (Track A)",
    "src.generation": "P2 (Track B)",
    "src.api": "P3 (Track D)",
}


def venv_python() -> str:
    """Path to the venv interpreter, or the current one if we're already in it."""
    if sys.prefix != sys.base_prefix:
        return sys.executable
    if platform.system() == "Windows":
        candidate = ROOT / ".venv" / "Scripts" / "python.exe"
    else:
        candidate = ROOT / ".venv" / "bin" / "python"
    return str(candidate) if candidate.exists() else sys.executable


def owner_of(module: str) -> str:
    for prefix, who in OWNERS.items():
        if module.startswith(prefix):
            return who
    return "unassigned"


def run_module(module: str, args: Optional[List[str]] = None) -> int:
    """
    Invoke `python -m module`. If the module doesn't exist yet, say who owns it
    rather than surfacing a raw traceback — three people are building in
    parallel and half these modules land later.
    """
    cmd = [venv_python(), "-m", module] + list(args or [])
    result = subprocess.run(cmd, cwd=str(ROOT))
    if result.returncode != 0:
        probe = subprocess.run(
            [venv_python(), "-c", f"import {module}"],
            cwd=str(ROOT), capture_output=True, text=True,
        )
        if "ModuleNotFoundError" in probe.stderr:
            log(f"{module} does not exist yet — owned by {owner_of(module)}", "warn")
    return result.returncode


# ----------------------------------------------------------------------------
# COMMANDS
# ----------------------------------------------------------------------------

def cmd_setup(args) -> int:
    """Create the venv and install dependencies."""
    if sys.version_info < MIN_PYTHON:
        log(
            f"python {'.'.join(map(str, MIN_PYTHON))}+ expected, "
            f"found {platform.python_version()}. Continuing, but if you hit a "
            f"syntax error in a dependency this is why.",
            "warn",
        )
    venv_dir = ROOT / ".venv"
    if not venv_dir.exists():
        log("creating .venv")
        rc = subprocess.run([sys.executable, "-m", "venv", str(venv_dir)]).returncode
        if rc != 0:
            return rc
    pip = venv_python()
    rc = subprocess.run(
        [pip, "-m", "pip", "install", "-q", "-r", str(ROOT / "requirements.txt")]
    ).returncode
    ensure_dirs()
    if rc == 0:
        log("done. cp .env.example .env and add OPENAI_API_KEY")
    return rc


def cmd_corpus(args) -> int:
    """Run discovery once and write data/corpus.json. SLOW. Never on the demo path."""
    return run_module("src.discovery.run")


def cmd_score(args) -> int:
    """Expand one cleared candidate into a season. Defaults to the scout's pick."""
    extra = ["--event", args.event] if args.event else []
    return run_module("src.scoring.run", extra)


def cmd_serial(args) -> int:
    """Generate mainline episodes + beats for one event, into canon.db."""
    return run_module("src.generation.serial", ["--event", args.event])


def cmd_promote(args) -> int:
    """Promotion call for one character. Fires on click, never in bulk."""
    return run_module("src.generation.promote", ["--char", args.char])


def cmd_spinoff(args) -> int:
    """Generate spinoff episodes for one promoted character."""
    return run_module("src.generation.spinoff", ["--char", args.char])


def cmd_validate(args) -> int:
    """Run the validator panel and print violations."""
    return run_module("src.validation.run")


def cmd_gate1(args) -> int:
    """GATE 1 — print a character's knows / blind / gaps from the store."""
    return run_module("src.canon.gate1", ["--char", args.char])


def cmd_leak(args) -> int:
    """Prove the guarantee: generate an unconstrained spinoff, catch the leak.

    A checker that only ever shows green reads as decorative. This generates a
    spinoff WITHOUT the constraint set, confirms the validator panel catches a
    real violation, then passes the fixed version. Both runs are saved.
    """
    return run_module("src.validation.leak")


def cmd_api(args) -> int:
    """FastAPI on :8000. The Next.js app runs separately (npm run dev in web/)."""
    cmd = [
        venv_python(), "-m", "uvicorn", "src.api.main:app",
        "--reload", "--port", str(args.port),
    ]
    return subprocess.run(cmd, cwd=str(ROOT)).returncode


def cmd_demo(args) -> int:
    """Seed the full golden path from cache. Forces OFFLINE=1."""
    os.environ["OFFLINE"] = "1"
    return run_module("src.demo_seed")


def cmd_test(args) -> int:
    """pytest."""
    return subprocess.run([venv_python(), "-m", "pytest", "-q"], cwd=str(ROOT)).returncode


COMMANDS = {
    "setup": cmd_setup,
    "corpus": cmd_corpus,
    "score": cmd_score,
    "serial": cmd_serial,
    "promote": cmd_promote,
    "spinoff": cmd_spinoff,
    "validate": cmd_validate,
    "gate1": cmd_gate1,
    "leak": cmd_leak,
    "api": cmd_api,
    "demo": cmd_demo,
    "test": cmd_test,
}


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="tasks.py",
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    sub = parser.add_subparsers(dest="command", metavar="command")

    for name, fn in COMMANDS.items():
        doc = (fn.__doc__ or "").strip().splitlines()[0]
        p = sub.add_parser(name, help=doc)
        if name == "score":
            p.add_argument("--event", default=None, metavar="ID_OR_TITLE",
                           help="corpus item id or title fragment to commission; "
                                "omit to take the scout's pick")
        elif name == "serial":
            p.add_argument("--event", required=True, help="dossier event_id")
        elif name in ("promote", "spinoff"):
            p.add_argument("--char", required=True, help="character id, e.g. jignesh")
        elif name == "gate1":
            p.add_argument("--char", default="jignesh", help="character id")
        elif name == "api":
            p.add_argument("--port", type=int, default=8000)

    return parser


def main() -> int:
    load_env()
    parser = build_parser()
    args = parser.parse_args()
    if not args.command:
        parser.print_help()
        return 1
    return COMMANDS[args.command](args)


if __name__ == "__main__":
    sys.exit(main())
