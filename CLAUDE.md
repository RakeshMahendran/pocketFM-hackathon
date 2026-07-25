# CanonForge

## Why this exists

Audio-drama platforms make money per unlocked episode. Two problems sit underneath that:

1. **Sourcing is a bottleneck.** Human editors read the news looking for stories worth adapting. It's slow, it's taste-dependent, and it misses non-obvious material — the strange local story that never made national news is often the best source.

2. **Every serial ends.** A finished show has forty side characters who each represent a story the platform already paid to build the world for, and no way to extract them without a writers' room re-reading everything and still contradicting canon by episode three.

CanonForge does both halves as one pipeline. A research agent finds real events worth adapting and grades them. A generation stage turns the winner into a serial **plus a structured canon**. Any side character in that canon can then become the protagonist of their own serial, generated on demand, provably unable to contradict the source.

The insight that makes the second half work: **a side character is interesting because of what they don't know.** We track ignorance as a first-class field, and it turns out to be both the safety mechanism and the creative engine.

## What we are building today

A demo, not a platform. One golden path, rehearsed:

> Molipur fake-IPL event (Gujarat, 2022) → mainline serial "The Century Hitters" → click side character **Jignesh** → his Episode 4 generates live → validator confirms zero contradictions.

Everything on that path gets built. Nothing else does. See `docs/BUILD_PLAN.md` for phases and gates.

---

## Domain vocabulary

Use these words exactly. They are the codebase's nouns.

| Term | Meaning |
|---|---|
| **Dossier** | Research agent output for one real event. Timeline, people, sources, adaptability scores, clearance verdict, engine. |
| **Domain** | Where a corpus item came from — the bare host of its first grounded source. Replaced the old `documented` / `anecdotal` / `historical` **tier**, which was derived from *which fetcher* returned an item and has no meaning now that discovery is one search. Clearance no longer follows from provenance; the scout states it directly, with reasons. |
| **Grounded** | A candidate whose cited URLs the model actually opened during the search. Ungrounded candidates are discarded before they reach the corpus — a fabricated citation is worse than a missing candidate, because everything downstream treats a corpus item as sourced. |
| **Clearance** | Legal verdict on adapting an event: `greenlight`, `fictionalize_first`, `blocked`. Never skip this. |
| **Engine** | The standing condition in a story that generates conflict every episode without new invention. Every serial must have one, stated explicitly. |
| **Beat** | An atomic unit of canon. Objective fact + who was present + who witnessed + **who is excluded**. Beats are truth; prose is a rendering of beats. |
| **`hidden_from`** | The named characters who do NOT know a beat happened. **The most important field in the system.** Half-filling it kills the product. |
| **Knows / blind / gaps** | The three derived views of a character. `knows` = beats they witnessed. `blind` = beats they're excluded from. `gaps` = time windows where they appear in zero beats. |
| **Promotion** | The one expensive LLM call that turns a cheap character stub into a full bible. Fires on click, never in bulk. |
| **Constraint set** | `knows` flattened into immutable bullet lines, injected into every spinoff generation call. |
| **Crossing point** | A beat that appears in both mainline and spinoff. Objective facts must match exactly; meaning may differ completely. |
| **Tier (canon)** | `core_canon` = the mainline, immutable. `branch_canon` = spinoff output, may reference core but never mutate it. |

---

## Architecture

```
discovery → scoring → dossier → serial writer → CANON STORE
                                                     ↓
                                            character view (query)
                                                     ↓
                                    promotion → spinoff writer → validator
                                                     ↓
                                            write back (branch_canon)
```

Four stages call an LLM: **discovery**, **scoring**, **serial writer / promotion / spinoff writer**, and **validator**. Everything else is queries and string assembly. Before adding a fifth, stop and ask whether a SQL filter does it.

Discovery became an LLM stage deliberately — see DELIVERY_PLAN decision 9. The four source APIs could only match vocabulary given to them in advance, and the material worth adapting is the strange local case nobody has already named. A scout searching for *mechanism* finds what a keyword list cannot. The cost is that discovery now hallucinates in a way fetchers could not, which is why `ground_candidates()` discards any candidate citing a page the model never opened.

The validator is **one stage, run as a panel** — three checks in parallel plus three adversarial refuters, each prompted to find a violation rather than confirm cleanliness. That is parallelism inside an existing stage, not a fourth stage. A checker that only ever shows green reads as decorative; see `docs/BUILD_PLAN.md` Phase 3.

### Module map

| Path | Holds |
|---|---|
| `src/discovery/` | The scout: eight category hunts, grounding, dedupe. Output: `data/corpus.json` |
| `src/scoring/` | The expander: dossier, cast, season plan, and the graders. Output: dossiers |
| `src/generation/` | The serial writer, its schemas, and the shared LLM harness |
| `src/canon/` | Beat store, character views, Lakebase access |
| `src/audio/` | Script to finished mp3: convert, direct, synthesise, sound, master |
| `src/audio/voice/` | The vendored TTS pipeline. See its `NOTICE.md` |
| `src/validation/` | Leakage, crossing-point, hook-type checks. **Empty — nothing built** |
| `src/api/` | Thin HTTP layer, served with the UI from one process |
| `web/` | The commissioning console |

Loose modules that belong to no stage: `src/agent.py` (the tool loop),
`src/canon_tools.py` (canon as questions an agent can ask), `src/flow.py` (the
whole chain in one command), `src/commission.py`, `src/publish.py`, `src/util.py`.

---

## Tech stack

- **Python 3.11+**, FastAPI for the API layer
- **Lakebase Postgres** — the Databricks-managed instance `canonforge`. No vector DB. A season is 40–60 beats, so the character views filter in Python over `all_beats()`; the `jsonb` GIN indexes exist for when that stops being true, not because it is slow now. Supersedes SQLite at `data/canon.db` — see DELIVERY_PLAN decision 11. Databricks Apps have an ephemeral filesystem, so a database file on app disk would not survive a restart.
  - Auth is an OAuth token, not a password: `src/canon/db.py` mints one per hour and SSL is mandatory. Locally it reads your `databricks auth login` profile; on Apps the `PG*` vars are injected by the attached resource.
- **OpenAI SDK** for generation. The hackathon is OpenAI-sponsored; this is a requirement, not a preference.
  - Routing lives in env vars, never hardcoded: `OPENAI_MODEL_WRITER` (`gpt-5.6-sol`) for serial/promotion/spinoff, `OPENAI_MODEL_SCORER` (`gpt-5.6-luna`) for bulk corpus scoring, `OPENAI_MODEL_VALIDATOR` (`gpt-5.6-sol`).
  - **Every LLM call uses structured outputs** — `response_format` with a strict JSON schema, parsed into a Pydantic model. No hand-parsing model text anywhere in this codebase.
- **Next.js** for `web/`, talking to the FastAPI layer over HTTP.
- `rapidfuzz` for discovery — `dedupe()` survives the move to search, since one hunt across eight categories surfaces the same event more than once. `src/discovery/fetchers.py` is now kept for `dedupe()` alone; `praw` is unused, and `requests` stays only because that module imports it at top level.

---

## Commands

All commands run through `tasks.py`, which works on Windows and POSIX alike. The
`Makefile` is a thin delegate for people who prefer `make` — one implementation,
so the two cannot drift.

```bash
python tasks.py setup            # venv + deps
python tasks.py corpus           # run discovery once, write data/corpus.json  (SLOW, run once)
python tasks.py score            # score corpus -> data/dossiers.json
python tasks.py seed             # create the Lakebase schema, load the beat sheet
python tasks.py buildweb         # next build -> web/out, staged to static/ for deploy
python tasks.py serial --event id    # generate mainline episodes + beats into the canon store
python tasks.py promote --char id    # promotion call for one character
python tasks.py spinoff --char id    # generate spinoff episodes
python tasks.py validate         # run the validator panel, print violations
python tasks.py gate1            # print Jignesh's knows / blind / gaps
python tasks.py leak             # generate an unconstrained spinoff, prove the validator catches it
python tasks.py api              # FastAPI on :8000
python tasks.py demo             # seed the full golden path from cache
python tasks.py test             # pytest
```

`web/` runs separately: `npm run dev` in that directory.

---

## Conventions

- **Beats are the source of truth.** If prose and beats disagree, beats win. Never regenerate one from the other after the fact.
- **The serial writer emits prose and beats in ONE call.** Two calls guarantee drift. This is not negotiable.
- Every beat carries `source_ref` — either a dossier timeline entry or the literal string `"fictionalized"`. Unmarked invented material is a bug.
- Every LLM call is wrapped in a function in `src/generation/` that takes typed input and returns parsed output. No inline prompt strings scattered through the codebase.
- All prompts live in `src/generation/prompts/` as `.md` files, loaded at runtime. Never hardcode a prompt in a `.py` file — we tune these constantly.
- Cache every LLM response to `data/cache/` keyed by a hash of the input. The demo must be able to run fully offline.
- Type hints on all public functions. Docstrings only where the *why* isn't obvious.
- No `print()` in library code; use the `log()` helper in `src/util.py`.

---

## Hard rules — do not violate

1. **Never let a spinoff character demonstrate knowledge of a beat in their `blind` list.** This is the entire product claim. The validator exists to catch it; don't write code that works around it.
2. **Never mutate `core_canon`.** Spinoff output writes as `branch_canon` only.
3. **Never dramatise a dossier claim tagged `alleged` or `disputed` as fact.** Render it as an accusation a character makes, or cut it.
4. **Never use real names from a dossier in generated fiction.** The fictionalization map is applied before generation, always.
5. **Never add live network calls to the demo path.** Discovery runs once, offline, into a committed corpus file.

---

## Testing

Priority order — if time is short, test top-down:

1. `character_view()` returns correct knows/blind/gaps for a known fixture
2. Constraint compiler produces the expected immutable lines
3. Validator catches a seeded leakage violation (fixture in `tests/fixtures/leaky_spinoff.json`)
4. Dedupe merges two paraphrased headlines about one event
5. Pre-filter drops items with no conflict vocabulary

Note on (4): headline paraphrases score surprisingly low on fuzzy string ratio — two real headlines about the same event scored 63 on `token_set_ratio`. Dedupe uses content-token overlap as the primary signal, with fuzz as a fallback for near-identical wire copy. Don't "fix" this back to pure fuzzy matching.

---

## Reference docs

- `docs/ARCHITECTURE.md` — full pipeline detail
- `docs/DISCOVERY.md` — the four sources, real endpoints, auth notes, query design
- `docs/PROMPTS.md` — the serial writer and spinoff writer prompts with rationale
- `docs/BUILD_PLAN.md` — scope lock, demo script, what is cut, hostile questions
- `docs/DELIVERY_PLAN.md` — decisions taken, track breakdown, dependency order, gates, staffing
- `schemas/` — JSON schemas + one hand-written sample of each

Read `docs/BUILD_PLAN.md` before starting any task. It says what is deliberately out of scope, and the answer to "should I also build X" is almost always no. Then read `docs/DELIVERY_PLAN.md` for what your track owns and what it depends on — where the two conflict, DELIVERY_PLAN records the later decision and wins.
