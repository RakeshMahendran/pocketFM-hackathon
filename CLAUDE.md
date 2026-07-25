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
| **Tier** | Provenance of a source item: `documented` (court/news), `anecdotal` (forums — inspiration only, never a real event), `historical` (Wikipedia, principals long dead). Drives clearance. |
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

Only three stages call an LLM: **scoring**, **serial writer / promotion / spinoff writer**, and **validator**. Everything else is queries and string assembly. If you find yourself adding a fourth LLM stage, stop and ask whether a SQL filter does it.

### Module map

| Path | Owns |
|---|---|
| `src/discovery/` | Source fetchers, normalization, dedupe, pre-filter. Output: `data/corpus.json` |
| `src/scoring/` | Adaptability rubric, clearance, novelty. Output: dossiers |
| `src/canon/` | Beat store, character views, constraint compiler, write-back |
| `src/generation/` | Prompt templates and LLM calls |
| `src/validation/` | Leakage, crossing-point, hook-type checks |
| `src/api/` | Thin HTTP layer for the web UI |
| `web/` | Demo UI |

---

## Tech stack

- **Python 3.11+**, FastAPI for the API layer
- **SQLite** — one file at `data/canon.db`. No Postgres, no vector DB. A season is 40–60 beats; filtering is retrieval at this scale.
- **Anthropic SDK** for generation. Model in `ANTHROPIC_MODEL` env var.
- **Vanilla HTML + Tailwind CDN** for `web/`. No build step, no framework.
- `requests`, `rapidfuzz` for discovery

---

## Commands

```bash
make setup           # venv + deps
make corpus          # run discovery once, write data/corpus.json  (SLOW, run once)
make score           # score corpus -> data/dossiers.json
make serial EVENT=id # generate mainline episodes + beats into canon.db
make promote CHAR=id # promotion call for one character
make spinoff CHAR=id # generate spinoff episodes
make validate        # run all three checks, print violations
make dev             # start API + serve web/ on :8000
make demo            # seed the full golden path from cache
make test            # pytest
```

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
- `docs/BUILD_PLAN.md` — phases, gates, fallbacks, demo script
- `schemas/` — JSON schemas + one hand-written sample of each

Read `docs/BUILD_PLAN.md` before starting any task. It says what is deliberately out of scope, and the answer to "should I also build X" is almost always no.
