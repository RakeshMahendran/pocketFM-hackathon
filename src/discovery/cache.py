"""
Raw response cache for the two P3 stages.

`CLAUDE.md` requires every LLM response to be cached. The reason here is
narrower and sharper than replay: a hunt is a multi-minute paid call with
`search_context_size: "high"`, and everything that can go wrong with it —
ungrounded winner, empty body, malformed JSON, a threshold you want to retune —
goes wrong *after* the response arrives. Writing the raw body before the first
branch means a post-processing bug costs a re-parse instead of a re-hunt.
"""

import json
import hashlib
import datetime as dt
from typing import Any

from src.util import CACHE, log


def save_raw(stage: str, key_material: str, response: Any) -> str:
    """Dump a response verbatim, before anything is parsed out of it."""
    digest = hashlib.sha1(key_material.encode("utf-8")).hexdigest()[:12]
    path = CACHE / f"{stage}_{digest}.json"

    try:
        body = response.model_dump() if hasattr(response, "model_dump") else response
        path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "stage": stage,
            "saved_at": dt.datetime.now(dt.timezone.utc).isoformat(),
            "response": body,
        }
        path.write_text(json.dumps(payload, ensure_ascii=False, default=str, indent=2),
                        encoding="utf-8")
        log(f"cached raw {stage} response -> {path.name}")
    except Exception as exc:
        # Never let caching lose a response we have already paid for.
        log(f"could not cache {stage} response: {exc}", "warn")

    return str(path)
