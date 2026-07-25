# Discovery

Produces a pool of candidate events for the scorer. Not "search the web" —
pick source families, normalize to one shape, dedupe, cheap-filter, done.

Run **once**, commit `data/corpus.json`, never run live. See `src/discovery/`.

## Four sources

| Source | Tier | Auth | Notes |
|---|---|---|---|
| Indian Kanoon | `documented` | token | Best source nobody uses. A judgment is a completed narrative with facts established by a judge, public domain. POST, token in Authorization header, `pagenum` starts at 0. Operators are `ANDD` / `ORR` / `NOTT` — doubled letters, case sensitive, spaces both sides. |
| GDELT DOC 2.0 | `documented` | none | Free, no key. An *event* database over global news, not a news API. Default window 3 months; use `startdatetime`/`enddatetime` in `YYYYMMDDHHMMSS` to go further back. Returns HTML error pages with a 200 — guard the JSON parse. |
| Reddit | `anecdotal` | OAuth | The bare `.json` endpoint died for unauthenticated clients in late May 2026 (403 via TLS fingerprinting, not headers). Use PRAW with a "script" app. Free tier 100 QPM. |
| Wikipedia | `historical` | none | MediaWiki API, category members then batched extracts. Pre-vetted for notability, old enough that clearance auto-greenlights. |

## Cost

Indian Kanoon is prepaid but effectively free here: ₹500 credit on signup,
₹10,000/month for non-commercial use subject to admin verification (request that
early — there's a human in the loop). A 100-result search without full text is
about ₹5. The whole corpus costs under ₹50.

## Tier is load-bearing

Not bookkeeping. It decides what downstream is allowed to do:

- `documented` → real event, real people, needs a clearance verdict
- `anecdotal` → an anonymous stranger's account. Inspiration, never a real
  event. No clearance risk, but you cannot claim it is true.
- `historical` → auto-greenlight, principals long dead

Without the tier the clearance layer has nothing to reason about.

## Query design is the actual work

Generic crime terms return thousands of procedurally boring appeals. What you
want is offences whose facts *require a story to have happened* — deception,
substitution, betrayal of trust. See `IK_QUERIES` and `GDELT_QUERIES` in
`src/discovery/fetchers.py`.

## Pre-filter before scoring

Scoring costs an LLM call per candidate. Gate with pure code first: no named
entities, too short, no conflict vocabulary, outside the date window → discard.
Kills roughly 90% for free.

Two findings worth keeping:

- **Headline paraphrases score low on fuzzy matching.** Two real headlines about
  the same event scored 63 on `token_set_ratio`. Dedupe uses content-token
  overlap as the primary signal; fuzz is a fallback for near-identical wire copy.
- **The conflict lexicon must include deception verbs** — `dupe`, `fake`,
  `staged`, `rigged`. An early version omitted them and discarded the entire
  fake-IPL story at the gate. Con stories are the richest vein in this corpus.

## Known limitation

Lexical dedupe misses "Gujarat police bust counterfeit cricket league" as the
same event as "Villagers staged fake IPL" — almost no shared surface tokens.
That is where embeddings would earn their place. For a 200-item corpus, eyeball
the clusters once and hand-merge.
