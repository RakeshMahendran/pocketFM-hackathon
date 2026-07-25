"""
Freeze the corpus. Run once, commit the result, never run it on the demo path.

    python tasks.py corpus

The scout picks the winner itself, so there is no selection stage after this —
`corpus.json` records which candidate won and what it beat, and the ranked-list
screen reads that directly.

Dedupe still runs, and matters more since discovery became one call per category:
eight independent hunts over categories that overlap by design — a double life is
also a long deception — will surface the same event more than once. The old
prefilter does not survive: it existed to kill raw junk before paying for a model
call, and by this point the call has happened and the junk is already rejected.
"""

import sys
import hashlib
import datetime as dt
from typing import Any, Dict, List

from src.util import CORPUS_PATH, ensure_dirs, load_env, log, offline, write_json
# _same_event is private, and reused rather than reimplemented on purpose:
# CLAUDE.md records that headline paraphrases score ~63 on fuzzy ratio and that
# the content-token overlap behind this function is the finding, not a detail.
from src.discovery.fetchers import dedupe, _same_event
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
        # Seed the id with the title as well as the URL. Keying on the URL alone
        # collides whenever one outlet covers two related events, and `dedupe()`
        # then discards the second without clustering it or saying so.
        seed = f"{url}|{c.get('title', '')}"
        out.append(dict(
            c,
            id=hashlib.sha1(seed.encode()).hexdigest()[:12],
            url=url,
            source="websearch",
            text=f"{c.get('one_line', '')} {c.get('mechanism', '')}".strip(),
        ))
    return out


def drop_winner_duplicates(winner: Dict[str, Any],
                           clustered: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Remove also-rans that are the winner again, found under a second category.

    `dedupe()` deliberately never sees the winner — it keeps the longest-text
    member of a cluster, so feeding the chosen event in could quietly swap it for
    something it merged with. That exemption used to be free when one call
    produced one winner. With eight calls it is not: the same event genuinely can
    win DENIED IDENTITY and place second in THE DOUBLE LIFE, and the queue screen
    would then show the winner twice.
    """
    kept = []
    for item in clustered:
        if _same_event(winner["title"], item["title"]):
            log(f"dropped '{item['title']}': the winner again, under "
                f"{item.get('category', '?')}")
            continue
        kept.append(item)
    return kept


def build_corpus(path=CORPUS_PATH) -> List[Dict[str, Any]]:
    if offline():
        raise RuntimeError(
            "OFFLINE is set. Discovery opens sockets and must never run on the "
            "demo path — unset it deliberately to rebuild the corpus."
        )

    ensure_dirs()
    log("discovery: hunting eight categories, one call each")
    result = hunt()
    winner = result["winner"]

    # Dedupe the also-rans only. `dedupe()` keeps the longest-text member of each
    # cluster, so running it over the winner too could quietly swap the chosen
    # event for something it merged with.
    others = _for_dedupe(result["also_considered"])
    clustered = dedupe(others)

    # dedupe() was tuned on wire headlines; these are pitch titles the same model
    # wrote in one voice, so they share vocabulary by construction and can merge
    # falsely. A merge deletes a candidate's scores, clearance and sources, so
    # say which ones went.
    for item in clustered:
        for merged in item.get("corroboration", []):
            gone = next((o["title"] for o in others if o["url"] == merged["url"]), "?")
            log(f"merged into '{item['title']}': '{gone}'")

    pool = [_for_dedupe([winner])[0]] + drop_winner_duplicates(winner, clustered)

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
