"""
Shared paths, logging and env loading.

Everything else imports from here so there is exactly one answer to
"where does data/ live" regardless of the working directory a command
was launched from.
"""

import os
import re
import sys
import json
import pathlib
import datetime as dt
from typing import Any, Optional

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
CACHE = DATA / "cache"
SCHEMAS = ROOT / "schemas"
SAMPLES = SCHEMAS / "samples"

DB_PATH = DATA / "canon.db"
CORPUS_PATH = DATA / "corpus.json"
DOSSIERS_PATH = DATA / "dossiers.json"

# Delivered mainline serials — one directory per story, each holding dossier.json,
# beats.json, promises.json and episodes/. Frozen input: the spinoff slice reads
# these and never writes them.
STORIES = DATA / "stories"
SPINOFFS = DATA / "spinoffs"

# The canonical hand-authored mainline beat sheet. Fallback canon: if the
# serial writer produces mush, the demo still has a season to query.
IPL_BEATS = SAMPLES / "ipl_beats.json"

_LEVELS = ("debug", "info", "warn", "error")


def log(msg: str, level: str = "info") -> None:
    """Stderr logger. Library code never uses print()."""
    if level not in _LEVELS:
        level = "info"
    stamp = dt.datetime.now().strftime("%H:%M:%S")
    print(f"[{stamp}] {level.upper():5s} {msg}", file=sys.stderr)


def load_env(path: Optional[pathlib.Path] = None) -> None:
    """
    Minimal .env loader. Does not overwrite variables already in the
    environment, so an explicitly exported key always wins.
    """
    path = path or (ROOT / ".env")
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key, val = key.strip(), val.strip().strip('"').strip("'")
        os.environ.setdefault(key, val)


def offline() -> bool:
    """Demo kill switch. When set, no stage may open a socket."""
    return os.environ.get("OFFLINE", "0") not in ("0", "", "false", "False")


def read_json(path) -> Any:
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def write_json(path, obj: Any) -> None:
    path = pathlib.Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(obj, fh, ensure_ascii=False, indent=2)
    log(f"wrote {path}")


def ensure_dirs() -> None:
    for d in (DATA, CACHE, SPINOFFS):
        d.mkdir(parents=True, exist_ok=True)


_SLOT = re.compile(r"\{\{([a-z_][a-z0-9_]*)\}\}")


def load_prompt(path, **slots: str) -> str:
    """
    Read a prompt and fill its `{{slot}}`s.

    Never `str.format()`. The prompt files carry literal single braces the model
    is meant to emit verbatim — `{event_id}#{timeline_id}` in episode.md's
    source_ref rule, and every JSON example inside a `<schema>` block. `format()`
    treats all of them as fields and either raises or silently substitutes.

    An unfilled slot is refused rather than shipped: sending the literal string
    "{{voice_samples}}" to a model reads as an instruction and produces confident
    nonsense.
    """
    text = pathlib.Path(path).read_text(encoding="utf-8")
    for key, value in slots.items():
        text = text.replace("{{" + key + "}}", str(value))
    left = sorted(set(_SLOT.findall(text)))
    if left:
        raise ValueError(
            f"{pathlib.Path(path).name} still has unfilled slots: {', '.join(left)}"
        )
    return text
