"""
Discovery stage. Run once, write corpus.json, never run it live on stage.

pip install requests praw rapidfuzz
"""

import os
import re
import json
import time
import hashlib
import datetime as dt
from collections import defaultdict

import requests
from rapidfuzz import fuzz


# ----------------------------------------------------------------------------
# COMMON SHAPE
# Every source collapses to this. Nothing downstream knows where an item
# came from except via `tier`, and `tier` is what clearance reasons about.
# ----------------------------------------------------------------------------

def make_item(source, tier, title, text, url, date, extra=None):
    return {
        "id": hashlib.sha1(url.encode()).hexdigest()[:12],
        "source": source,          # ikanoon | gdelt | reddit | wikipedia
        "tier": tier,              # documented | anecdotal | historical
        "title": title.strip(),
        "text": (text or "").strip(),
        "url": url,
        "date": date,              # ISO string or None
        "extra": extra or {},
    }


# ----------------------------------------------------------------------------
# 1. INDIAN KANOON  —  tier: documented
#
# Highest quality source you have. A judgment is a completed narrative with
# facts already established by a judge. Public domain text.
#
# Auth:   sign up at api.indiankanoon.org, generate a shared token.
# Method: POST (not GET). Token goes in the Authorization header.
# Quirk:  pagenum starts at 0, not 1.
# Query:  operators are ANDD / ORR / NOTT — doubled letters, case sensitive,
#         and they need a space on both sides. Quotes = exact phrase.
# ----------------------------------------------------------------------------

IK_TOKEN = os.environ.get("IK_TOKEN", "")
IK_BASE = "https://api.indiankanoon.org"

# These queries are the actual work. Generic crime terms return thousands of
# procedurally boring appeals. What you want is offences whose facts require
# a *story* to have happened — deception, substitution, betrayal of trust.
IK_QUERIES = [
    '"criminal breach of trust" ANDD family',
    '"cheating by personation"',
    '"forged will" ORR "forgery of will"',
    '"inheritance dispute" ANDD fraud',
    'impersonation ANDD identity ANDD property',
    '"match fixing" ORR "betting racket"',
    '"dowry" ANDD conspiracy NOTT bail',
    '"missing person" ANDD reappeared',
]


def fetch_ikanoon(queries=IK_QUERIES, pages=3, pause=0.4):
    if not IK_TOKEN:
        print("  ikanoon: no IK_TOKEN, skipping")
        return []

    headers = {"Authorization": f"Token {IK_TOKEN}", "Accept": "application/json"}
    out = []

    for q in queries:
        for pagenum in range(pages):          # zero-indexed
            try:
                r = requests.post(
                    f"{IK_BASE}/search/",
                    headers=headers,
                    data={"formInput": q, "pagenum": pagenum},
                    timeout=30,
                )
                r.raise_for_status()
                docs = r.json().get("docs", [])
            except Exception as e:
                print(f"  ikanoon fail [{q} p{pagenum}]: {e}")
                break

            if not docs:
                break

            for d in docs:
                # headline is HTML-ish with <b> tags around matched terms
                snippet = re.sub(r"<[^>]+>", " ", d.get("headline", ""))
                out.append(make_item(
                    source="ikanoon",
                    tier="documented",
                    title=d.get("title", ""),
                    text=snippet,
                    url=f"https://indiankanoon.org/doc/{d.get('tid')}/",
                    date=d.get("publishdate"),
                    extra={"court": d.get("docsource"), "tid": d.get("tid")},
                ))
            time.sleep(pause)

    print(f"  ikanoon: {len(out)}")
    return out


# ----------------------------------------------------------------------------
# 2. GDELT DOC 2.0  —  tier: documented
#
# Free, no key, no signup. Not a news API — an *event* database over global
# news. Default coverage window is the last 3 months; use STARTDATETIME /
# ENDDATETIME (YYYYMMDDHHMMSS) to go back further.
# ----------------------------------------------------------------------------

GDELT_URL = "https://api.gdeltproject.org/api/v2/doc/doc"

# sourcecountry:IN scopes to Indian outlets. Drop it for global sweeps.
GDELT_QUERIES = [
    '"fake tournament" sourcecountry:IN',
    '(impersonated OR impersonation) inheritance sourcecountry:IN',
    '"declared dead" returned alive',
    'village scam betting sourcecountry:IN',
    '"family feud" property murder sourcecountry:IN',
    '"con man" arrested crores',
]


def fetch_gdelt(queries=GDELT_QUERIES, months_back=24, maxrecords=100, pause=1.0):
    end = dt.datetime.utcnow()
    start = end - dt.timedelta(days=30 * months_back)
    out = []

    for q in queries:
        params = {
            "query": q,
            "mode": "artlist",
            "format": "json",
            "maxrecords": maxrecords,
            "sort": "hybridrel",
            "startdatetime": start.strftime("%Y%m%d%H%M%S"),
            "enddatetime": end.strftime("%Y%m%d%H%M%S"),
        }
        try:
            r = requests.get(GDELT_URL, params=params, timeout=30)
            # GDELT returns HTML error pages with a 200 — guard the parse
            arts = r.json().get("articles", []) if r.text.startswith("{") else []
        except Exception as e:
            print(f"  gdelt fail [{q}]: {e}")
            arts = []

        for a in arts:
            out.append(make_item(
                source="gdelt",
                tier="documented",
                title=a.get("title", ""),
                text="",                      # artlist gives no body; fetch later if scored well
                url=a.get("url", ""),
                date=a.get("seendate"),
                extra={"domain": a.get("domain"), "lang": a.get("language")},
            ))
        time.sleep(pause)

    print(f"  gdelt: {len(out)}")
    return out


# ----------------------------------------------------------------------------
# 3. REDDIT  —  tier: anecdotal
#
# The bare .json endpoint is dead for unauthenticated clients as of late
# May 2026 (403 via TLS fingerprinting, not just headers). Use OAuth.
#
# Setup, ~5 min:  reddit.com/prefs/apps -> create app -> type "script"
#                 -> client_id is under the app name, secret beside it.
# Free tier: 100 QPM. PRAW handles backoff for you.
#
# Everything here is an anonymous stranger's account of their own life. It is
# story *inspiration*, never a documented event — hence tier=anecdotal, which
# is what stops the clearance layer from treating it as a real person.
# ----------------------------------------------------------------------------

REDDIT_SUBS = [
    "AmItheAsshole", "LegalAdviceIndia", "legaladvice",
    "relationship_advice", "IndiaSocial", "TrueOffMyChest",
]


def fetch_reddit(subs=REDDIT_SUBS, limit=200, time_filter="year"):
    try:
        import praw
    except ImportError:
        print("  reddit: praw not installed, skipping")
        return []

    cid = os.environ.get("REDDIT_CLIENT_ID")
    csec = os.environ.get("REDDIT_CLIENT_SECRET")
    if not (cid and csec):
        print("  reddit: no credentials, skipping")
        return []

    reddit = praw.Reddit(
        client_id=cid,
        client_secret=csec,
        user_agent="pocketfm-discovery/0.1 by u/yourname",
    )

    out = []
    for sub in subs:
        try:
            for p in reddit.subreddit(sub).top(time_filter=time_filter, limit=limit):
                if p.stickied or not p.selftext:
                    continue
                out.append(make_item(
                    source="reddit",
                    tier="anecdotal",
                    title=p.title,
                    text=p.selftext,
                    url=f"https://reddit.com{p.permalink}",
                    date=dt.datetime.utcfromtimestamp(p.created_utc).isoformat(),
                    extra={"sub": sub, "score": p.score, "comments": p.num_comments},
                ))
        except Exception as e:
            print(f"  reddit fail [{sub}]: {e}")

    print(f"  reddit: {len(out)}")
    return out


# ----------------------------------------------------------------------------
# 4. WIKIPEDIA  —  tier: historical
#
# MediaWiki API. No key, generous limits, pre-vetted for notability, and old
# enough that clearance auto-greenlights. Category members, then extracts.
# ----------------------------------------------------------------------------

WIKI_API = "https://en.wikipedia.org/w/api.php"

WIKI_CATEGORIES = [
    "Category:Confidence tricks",
    "Category:Impostors",
    "Category:Fraud in India",
    "Category:Indian confidence tricksters",
    "Category:Disappeared people",
    "Category:Trials in India",
]


def fetch_wikipedia(categories=WIKI_CATEGORIES, per_cat=100, pause=0.3):
    S = requests.Session()
    S.headers["User-Agent"] = "pocketfm-discovery/0.1 (hackathon)"
    out = []

    for cat in categories:
        try:
            r = S.get(WIKI_API, params={
                "action": "query", "list": "categorymembers",
                "cmtitle": cat, "cmlimit": per_cat, "cmtype": "page",
                "format": "json",
            }, timeout=30)
            members = r.json().get("query", {}).get("categorymembers", [])
        except Exception as e:
            print(f"  wiki fail [{cat}]: {e}")
            continue

        # batch the extract lookup: 20 pageids per call
        ids = [str(m["pageid"]) for m in members]
        for i in range(0, len(ids), 20):
            try:
                r = S.get(WIKI_API, params={
                    "action": "query", "prop": "extracts",
                    "pageids": "|".join(ids[i:i + 20]),
                    "exintro": 1, "explaintext": 1, "format": "json",
                }, timeout=30)
                pages = r.json().get("query", {}).get("pages", {})
            except Exception as e:
                print(f"  wiki extract fail: {e}")
                continue

            for pid, pg in pages.items():
                out.append(make_item(
                    source="wikipedia",
                    tier="historical",
                    title=pg.get("title", ""),
                    text=pg.get("extract", ""),
                    url=f"https://en.wikipedia.org/?curid={pid}",
                    date=None,
                    extra={"category": cat},
                ))
            time.sleep(pause)

    print(f"  wikipedia: {len(out)}")
    return out


# ----------------------------------------------------------------------------
# DEDUPE
# One real event shows up in forty articles. Cluster on title similarity,
# keep the longest-text member as canonical, keep the rest as corroboration.
# Blocking on a shared token keeps this O(n * small) instead of O(n^2).
# ----------------------------------------------------------------------------

STOP = {"the", "a", "an", "of", "in", "on", "for", "to", "and", "at", "is",
        "was", "with", "from", "by", "vs", "v", "his", "her", "after"}


def _key_tokens(title):
    toks = re.findall(r"[a-z]{4,}", title.lower())
    return [t for t in toks if t not in STOP][:4]


def _content_set(title):
    """Content tokens, prefix-truncated so duped/duping/dupe collapse."""
    toks = re.findall(r"[a-z]{4,}", title.lower())
    return {t[:5] for t in toks if t not in STOP}


def _same_event(a, b, jaccard_min=0.34, fuzz_min=85):
    """
    Two headlines about one event share distinctive nouns but paraphrase
    heavily, which tanks pure string similarity — the fake-IPL pair below
    scores only 63 on token_set_ratio. Overlap is the stronger signal;
    fuzz is kept as a second route for near-identical wire copy.
    """
    sa, sb = _content_set(a), _content_set(b)
    if not sa or not sb:
        return False
    jac = len(sa & sb) / len(sa | sb)
    return jac >= jaccard_min or fuzz.token_set_ratio(a, b) >= fuzz_min


def dedupe(items, threshold=None):
    buckets = defaultdict(list)
    for it in items:
        for tok in _key_tokens(it["title"]) or ["_none"]:
            buckets[tok].append(it)

    seen, clusters = set(), []
    for it in items:
        if it["id"] in seen:
            continue
        group = [it]
        seen.add(it["id"])
        for tok in _key_tokens(it["title"]) or ["_none"]:
            for cand in buckets[tok]:
                if cand["id"] in seen:
                    continue
                if _same_event(it["title"], cand["title"]):
                    group.append(cand)
                    seen.add(cand["id"])

        canonical = max(group, key=lambda x: len(x["text"]))
        canonical["corroboration"] = [
            {"url": g["url"], "source": g["source"]} for g in group if g["id"] != canonical["id"]
        ]
        clusters.append(canonical)

    print(f"  dedupe: {len(items)} -> {len(clusters)}")
    return clusters


# ----------------------------------------------------------------------------
# PRE-FILTER
# Pure code, no LLM. Scoring costs a model call per candidate; this gate is
# free and kills the ones that would have scored 2/10 anyway.
# ----------------------------------------------------------------------------

CONFLICT = {
    # deception — the most common shape in this corpus, and the one the
    # first draft of this lexicon missed entirely
    "dupe", "duped", "fake", "faked", "sham", "hoax", "staged", "rigged",
    "fixed", "swindl", "posed", "posing", "pretend", "bogus", "counterfeit",
    "impersonat", "disguise", "forged", "forgery", "conned", "con man",
    # betrayal and money
    "betray", "cheat", "fraud", "scam", "blackmail", "extort", "bribe",
    "embezzl", "stole", "theft", "siphon", "laundering",
    # family and inheritance
    "inherit", "estate", "will", "dowry", "divorce", "custody", "abandon",
    "affair", "secret", "illegitimate", "heir",
    # jeopardy
    "revenge", "avenge", "murder", "kill", "poison", "vanish", "disappear",
    "missing", "trapped", "escape", "rescue", "smuggl", "kidnap", "ransom",
}

# A story needs someone to happen to. No proper noun, no protagonist.
PROPER_NOUN = re.compile(r"\b[A-Z][a-z]{2,}\b")


def prefilter(items, min_chars=250, min_conflict=2):
    kept, dropped = [], []

    for it in items:
        blob = f"{it['title']} {it['text']}"
        low = blob.lower()

        hits = sum(1 for w in CONFLICT if w in low)
        names = len(set(PROPER_NOUN.findall(blob)))
        long_enough = len(blob) >= min_chars

        # wikipedia extracts are short by design; relax length there
        if it["source"] == "wikipedia":
            long_enough = len(blob) >= 120
        # gdelt artlist has no body — judge on title alone
        if it["source"] == "gdelt":
            long_enough = True
            min_needed = 1
        else:
            min_needed = min_conflict

        if long_enough and hits >= min_needed and names >= 2:
            it["prefilter"] = {"conflict_hits": hits, "named_entities": names}
            kept.append(it)
        else:
            dropped.append(it)

    print(f"  prefilter: kept {len(kept)}, dropped {len(dropped)}")
    return kept


# ----------------------------------------------------------------------------
# RUNNER
# ----------------------------------------------------------------------------

def build_corpus(path="corpus.json"):
    print("discovery:")
    raw = []
    raw += fetch_ikanoon()
    raw += fetch_gdelt()
    raw += fetch_reddit()
    raw += fetch_wikipedia()

    pool = prefilter(dedupe(raw))

    with open(path, "w") as f:
        json.dump({
            "built_at": dt.datetime.utcnow().isoformat(),
            "count": len(pool),
            "by_tier": {
                t: sum(1 for x in pool if x["tier"] == t)
                for t in ("documented", "anecdotal", "historical")
            },
            "items": pool,
        }, f, indent=2)

    print(f"wrote {path} with {len(pool)} candidates")
    return pool


if __name__ == "__main__":
    build_corpus()
