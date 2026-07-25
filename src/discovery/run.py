"""
Freeze the corpus. Run once, commit the result, never run it on the demo path.

    python tasks.py corpus

Dedupe is the one pre-LLM stage that survives the move to search sourcing: the
same event surfaces under several of the eight categories, and the scout has no
memory across passes. The old prefilter does not survive — it existed to kill
raw junk before paying for a model call, and by this point the model call has
already happened and the junk is already gone.
"""

import sys
import hashlib
import datetime as dt
from typing import Any, Dict, List

from src.util import CORPUS_PATH, ensure_dirs, load_env, log, offline, write_json
from src.discovery.fetchers import dedupe
from src.discovery.search import hunt_all


def _for_dedupe(candidates: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Give each candidate the handful of fields `dedupe()` reads, so the clustering
    logic — and the token-overlap finding behind it — is reused rather than
    reimplemented.
    """
    out = []
    for c in candidates:
        url = c["sources"][0]
        out.append(dict(
            c,
            id=hashlib.sha1(url.encode()).hexdigest()[:12],
            url=url,
            source="websearch",
            text=f"{c.get('one_line', '')} {c.get('mechanism', '')}".strip(),
        ))
    return out


def build_corpus(path=CORPUS_PATH) -> List[Dict[str, Any]]:
    if offline():
        raise RuntimeError(
            "OFFLINE is set. Discovery opens sockets and must never run on the "
            "demo path — unset it deliberately to rebuild the corpus."
        )

    ensure_dirs()
    log("discovery: hunting eight categories")
    pool = dedupe(_for_dedupe(hunt_all()))

    write_json(path, {
        "built_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "count": len(pool),
        "by_clearance": {
            s: sum(1 for x in pool if x.get("clearance", {}).get("status") == s)
            for s in ("greenlight", "fictionalize_first", "blocked")
        },
        "by_category": {
            cat: sum(1 for x in pool if x.get("hunt_category") == cat)
            for cat in sorted({x.get("hunt_category", "?") for x in pool})
        },
        "items": pool,
    })
    log(f"corpus frozen: {len(pool)} candidates")
    return pool


def main() -> int:
    load_env()
    try:
        pool = build_corpus()
    except RuntimeError as exc:
        log(str(exc), "error")
        return 1
    if not pool:
        log("corpus is empty — check the threshold and the reject rules", "error")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
