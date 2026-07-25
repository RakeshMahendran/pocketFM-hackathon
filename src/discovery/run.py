"""
Freeze the corpus. Run once, commit the result, never run it on the demo path.

    python tasks.py corpus

The scout picks the winner itself, so there is no selection stage after this —
`corpus.json` records which candidate won and what it beat, and the ranked-list
screen reads that directly.

Dedupe still runs: one call sweeping eight categories will surface the same event
under more than one of them. The old prefilter does not survive — it existed to
kill raw junk before paying for a model call, and by this point the call has
happened and the junk is already rejected.
"""

import sys
import hashlib
import datetime as dt
from typing import Any, Dict, List

from src.util import CORPUS_PATH, ensure_dirs, load_env, log, offline, write_json
from src.discovery.fetchers import dedupe
from src.discovery.search import hunt


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
    result = hunt()
    winner = result["winner"]

    # Dedupe the also-rans only. `dedupe()` keeps the longest-text member of each
    # cluster, so running it over the winner too could quietly swap the chosen
    # event for something it merged with.
    pool = [_for_dedupe([winner])[0]] + dedupe(_for_dedupe(result["also_considered"]))

    write_json(path, {
        "built_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "winner": winner["title"],
        "count": len(pool),
        "by_clearance": {
            s: sum(1 for x in pool if x.get("clearance", {}).get("status") == s)
            for s in ("greenlight", "fictionalize_first", "blocked")
        },
        "items": pool,
    })
    log(f"corpus frozen: {winner['title']}, {len(pool) - 1} also considered")
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
