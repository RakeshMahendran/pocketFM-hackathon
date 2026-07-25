# Discovery

Produces a pool of scored candidate events for the scorer. Not "search the web
for news" — a scout prompt hunts eight story shapes, scores what it finds against
five serial-specific criteria, and returns only what clears the bar.

Run **once**, commit `data/corpus.json`, never run live. See `src/discovery/`.

> Supersedes the four-source-API design. See `DELIVERY_PLAN.md` §0 decision 9.

## How it runs

```
hunter.md (scout prompt)
        │
        ▼
eight passes, one per category ──► OpenAI Responses API + web_search tool
        │
        ▼
strict JSON schema ──► citation grounding ──► tier by domain ──► dedupe ──► corpus.json
```

`python tasks.py corpus`. Refuses to run when `OFFLINE=1`; discovery opens
sockets and must never sit on the demo path.

## The eight categories

Every candidate must fit one, and each gets its own pass so a barren category is
visible rather than averaged away: denied identity, secret status, revenge, the
long deception, family betrayal, the bargain comes due, supernatural intrusion,
the double life.

The full prompt is `src/discovery/prompts/hunter.md` and it is the real work in
this stage. Tune it there, never in a `.py`.

## Scoring

Five criteria, 0–10 each, **38+ total to survive**: engine longevity (weighted
highest), hook density, emotional immediacy, conflict, cast depth.

These are deliberately *not* the dossier's `adaptability` sub-scores. The scout
is triaging hundreds of candidates on serial mechanics; the scorer commits to one
event in depth. Two judgements at two depths, stored separately — the scout's
scores stay on the corpus item, and stage 2 produces `adaptability` itself.

`MIN_TOTAL` is re-checked in code as well as stated in the prompt. A prompt
cannot be relied on to enforce its own threshold, and a scored-but-rejected
candidate is diagnostic information worth logging.

## Mechanism, not magnitude

The instruction that matters most: never search "biggest scam" or "most famous
fraud" — that returns the same six cases everyone has already adapted. Hunt for
strange *mechanisms*: staged events, substitutions, fabricated institutions,
identities that held for years. Small local events with bizarre mechanisms are
the gold, because they are exactly what human editors miss.

## Tier is gone. Clearance is the verdict.

Under the old design, tier came from the fetcher that produced an item, so it was
provenance by construction. Search returns arbitrary domains, and a dry run of
the scout showed the obvious replacement — an allowlist of "trusted" domains —
tagging perfectly good national outlets as untrusted because they were not on a
list somebody guessed at. It graded nothing and added noise, so it was cut.

Items now carry a plain `domain` field. Where a claim came from stays visible;
the pipeline just stops pretending to rank it.

Clearance is the verdict that matters, and the scout issues it directly:
`greenlight` / `fictionalize_first` / `blocked`. Expect most good candidates in
`fictionalize_first` — recent cases involving living private individuals are
exactly where the strange mechanisms are, so the prompt asks what has to change
(names, place, whose point of view) rather than rejecting the event. India
retains criminal defamation alongside civil, which is why the fictionalization
map is mandatory rather than advisory.

## Citation grounding

Every URL a candidate cites is checked against the search call's actual consulted
sources (`include: ["web_search_call.action.sources"]`, plus inline annotations).
A candidate left with no grounded URL is dropped.

This is the failure mode of search-sourced corpora: a model citing a plausible
address it never opened. Everything downstream treats a corpus item as sourced
fact, so a fabricated citation is worse than a missing candidate.

## Dedupe survives, prefilter does not

**Dedupe stays.** The same event surfaces under several categories and the scout
has no memory across passes. Two findings still hold and should not be "fixed":

- **Headline paraphrases score low on fuzzy matching** — two real headlines about
  one event scored 63 on `token_set_ratio`. Content-token overlap is the primary
  signal; fuzz is the fallback for near-identical wire copy.
- **Lexical dedupe misses genuine paraphrases** with no shared surface tokens.
  For a corpus this size, eyeball the clusters once at freeze time and hand-merge.

**Prefilter is gone.** It existed to kill raw junk before paying for a model
call. By this point the model call has already happened and the junk is already
rejected; running it now would delete finished work. The function is still in
`fetchers.py` and still tested — it is simply not on this path.

## What is left in `fetchers.py`

`make_item`, `dedupe`, `prefilter` and the conflict lexicon. The four `fetch_*`
functions are unused but kept: they are documented, they cost nothing, and if an
Indian Kanoon token ever appears they are the fastest route to full judgment
text, which is the one thing web search will not hand you.
