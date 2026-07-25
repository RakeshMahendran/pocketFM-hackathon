# DELIVERY PLAN

Working plan for the multi-day build. `BUILD_PLAN.md` remains the authority on
**scope lock (§0), the demo script (§1), what is cut (§2), and the hostile-question
answers (§7)** — none of that changes. This document replaces its hour-by-hour
phasing with a dependency-ordered breakdown, and records the decisions taken
since it was written.

---

## 0. Decisions taken (supersede BUILD_PLAN where they conflict)

| # | Decision | Why |
|---|---|---|
| 1 | **OpenAI, not Anthropic.** `gpt-5.6-sol` writes, `gpt-5.6-luna` scores. | The hackathon is OpenAI-sponsored. Non-negotiable. |
| 2 | **Next.js for `web/`**, FastAPI for the API. | Supersedes the "no framework" line in `CLAUDE.md`, which has been updated. |
| 3 | **Every LLM call uses structured outputs** — strict JSON schema → Pydantic. | Makes "prose and beats in ONE call" enforceable by the API instead of by convention. Drift becomes structurally impossible, not merely discouraged. |
| 4 | **The validator is a panel**: 3 parallel checks + 3 adversarial refuters. | The risk register flags "validator always green" as a known failure mode. One model's say-so is weak evidence for the entire product claim. |
| 5 | **The research agent is a bounded agentic loop**, offline, over the frozen corpus. Local tools only. | Answers "is this really an agent?" with a real tool-use loop while keeping the no-live-network rule intact. |
| 6 | **Cache layer is built before the first LLM call**, not in integration. | Every dev iteration replays free, and the demo kill switch gets exercised daily instead of first being trusted on the night. |
| 7 | **The beat fixture is hand-expanded to a full season** before the serial writer exists. | Gate 1 is meaningless on 7 beats. Hand-authoring is free, forces the story design, and becomes the fallback canon if the writer disappoints. |
| 8 | **`tasks.py` replaces `make`.** | `make` is not installed on the Windows dev box. One implementation; the Makefile delegates. |
| 9 | **Discovery is OpenAI web search, not the four source APIs.** One hunt per story category, scored by the scout prompt in `src/discovery/prompts/hunter.md`. Decided 2026-07-25 by P3. | No API tokens to chase, and the scout can hunt *mechanism* rather than keyword — the fetchers could only match vocabulary they were told in advance. Costs: discovery becomes a fourth LLM stage, and provenance now has to be derived rather than assumed. See the two consequences below. |

| 10 | **Generation runs on Claude, not OpenAI.** Decided 2026-07-25 by P3, and it reverses decision 1 for the whole team. | No OpenAI key was available and the build could not wait. **P1 and P2 must know**: `.env.example`'s `OPENAI_MODEL_*` routing, the `client.responses.create` calls in `src/discovery/` and `src/scoring/`, and B1's harness in `src/generation/` all assume OpenAI. If the hackathon is scored on sponsor-platform use, this is a visible cost — raise it before the deck is written. |

### Consequences of decision 9 — **P1 action needed**

- **Tier is gone.** `CLAUDE.md`'s vocabulary table defines `documented` / `anecdotal` / `historical` as fetcher-derived provenance. With search sourcing there is no fetcher to derive it from, and a domain allowlist graded good outlets as untrusted. Corpus items carry a plain `domain` instead, and clearance — which is what tier fed — now comes straight from the scout. `CLAUDE.md` is P1's file, so this is a request, not an edit.
- **`CLAUDE.md` says only three stages call an LLM**, and `ARCHITECTURE.md`'s stage table marks Discovery `LLM? no`. Both are now wrong. Same request.
- **`praw` and `requests` are dead weight** in `requirements.txt` once the fetchers go unused. `rapidfuzz` is still live — `dedupe()` survives. Left alone pending P1.
- **P2:** the Responses API takes structured output as `text.format`, not `response_format`, and `client.responses.create()` is not `client.chat.completions.parse()`. One wrapper will not cover both call shapes.
- **`beat.schema.json:29` under-specifies `source_ref`.** It says "dossier timeline id, or the literal 'fictionalized'", but `ipl_beats.json` actually uses `<event_id>#<timeline_id>` — `evt_molipur_2022#t1`. Four independent generation runs produced four different wrong formats and none matched the fixture; I read the schema literally and got it wrong too. Please put the `#` form in the description. `episode.md` now states it explicitly, and the validator's traceability check (`PROMPTS.md:174`) should accept only these two shapes.

### Resolved — Jignesh's blind count is 18, not 11

`SPINOFF.md` and the demo script both said *"appears in 4 beats, locked out of 11."*
The 22-beat season is now written with `hidden_from` filled honestly on every
beat, and the verified counts are:

| | Count | Beats |
|---|---|---|
| **knows** | 4 | `b004`, `b009`, `b014`, `b022` |
| **blind** | **18** | everything else |
| neutral | **0** | — every beat states his epistemic status |
| gaps | 4 windows | ep1 s1–s3 · ep2 s1–s4 · ep2 s6–ep3 s3 · **ep4 s4–ep5 s4** |

Zero neutral beats is the number that matters. `CLAUDE.md` calls half-filling
`hidden_from` the thing that kills the product; there is now no beat where his
ignorance is left unstated, so the prohibition list the validator enforces is
complete rather than sampled.

**P3: the pitch line and the deck change to "appears in 4, locked out of 18."**
The claim gets stronger, not weaker — more prohibited knowledge, not less.

The fourth gap window (ep4 s4 → ep5 s4, seven beats spanning 29 June to 7 July)
is the rain days and the night before the raid. That is the largest writable
space in the canon and where the back half of his spinoff lives.

---

## 1. Dependency order

```
        ┌──────────────────────────────────────────┐
        │ A. CANON SPINE          (critical path)  │
        │ util, tasks, fixture, store, views,      │
        │ constraints, write-back, validator panel │
        └───────────────┬──────────────────────────┘
                        │ constraint sets + canon queries
        ┌───────────────▼──────────┐   ┌────────────────────┐
        │ B. GENERATION            │   │ C. RESEARCH AGENT  │
        │ OpenAI harness, schemas, │   │ corpus freeze,     │
        │ serial / promote /       │   │ scoring, agentic   │
        │ spinoff writers          │   │ loop, clearance    │
        └───────────────┬──────────┘   └─────────┬──────────┘
                        │                        │
                    ┌───▼────────────────────────▼───┐
                    │ D. SURFACE                     │
                    │ FastAPI, Next.js, 4 screens,   │
                    │ demo seed, deck, backup video  │
                    └────────────────────────────────┘
```

**A blocks everything.** B cannot compile a constraint set without it; D has no
data without it. If A slips, everyone stops and helps A — that rule from
`BUILD_PLAN.md` §4 still stands.

**C is genuinely independent** and the least demo-critical. It is the correct
track to cut or defer if people are short.

**D can start immediately** against the hand-written fixture and the sample
JSON in `schemas/samples/`. Real screens, fake content — do not wait for real data.

---

## 2. Track A — Canon spine

Owner: **critical path.** Pure code, no LLM, fully testable. Tests are written first.

| # | Deliverable | Notes |
|---|---|---|
| A1 | `src/util.py` | Paths, `log()`, `.env` loading, `OFFLINE` helper. **Done.** |
| A2 | `tasks.py` + Makefile delegate | Cross-platform command runner. Unblocks everyone. |
| A3 | Expanded beat fixture (~22 beats) | Additive — all 7 existing beats preserved byte-for-byte. `hidden_from` filled honestly on every beat. |
| A4 | `src/canon/store.py` | SQLite; `beats` + `characters`; JSON columns for the array fields. `load_beats()`, `all_beats()`, `get_beat()`. |
| A5 | `src/canon/views.py` | `knows()`, `blind()`, `gaps()`, `character_view()`. Optional `as_of` from day one — it turns "future canon is unreachable" from a claim into a property. |
| A6 | `src/canon/constraints.py` | `knows` → immutable bullet lines; `blind` → prohibition list. Pure string assembly. |
| A7 | **GATE 1** | `python tasks.py gate1` prints Jignesh's three lists. |
| A8 | `src/canon/writeback.py` | Spinoff beats commit as `branch_canon`. Never mutates `core_canon`. Branch beats default `hidden_from` = all mainline characters. |
| A9 | `src/validation/` — the panel | Leakage / crossing-point / hook-type in parallel, plus 3 adversarial refuters. JSON verdicts. |
| A10 | **The leak demo** | Generate a spinoff *without* the constraint set, confirm the panel catches it, save both runs. `python tasks.py leak`. |

**Semantics locked for A5**, so nobody re-litigates them mid-build:

- *Appearing* = `present ∪ witnessed_by` — i.e. exactly the `knows` set. A character in `hidden_from` is not appearing; they are explicitly excluded.
- *Gaps* are computed over `(ep, seq)` runs, with `world_time` used only as the human-readable label at each end. `world_time` is partial ISO 8601; interval arithmetic on it buys nothing and breaks on partial dates.

---

## 3. Track B — Generation

Depends on A6 for the spinoff writer. Everything else can start now.

| # | Deliverable | Notes |
|---|---|---|
| B1 | `src/generation/client.py` | The OpenAI harness. See the checklist below — this is the highest-leverage file in the track. |
| B2 | `src/generation/schemas.py` | Pydantic models mirroring `schemas/*.schema.json`. `additionalProperties: false` throughout; strict mode requires it. |
| B3 | `src/generation/serial.py` | **One call** returning `episodes` *and* `beats` in a single schema. |
| B4 | `src/generation/promote.py` | Stub + knows/blind/gaps → bible (want, wound, voice, engine, offscreen ledger, reframe). Fires on click, never in bulk. |
| B5 | `src/generation/spinoff.py` | Bible + constraint set + POV lock → episodes + branch beats. |
| B6 | Prompt tuning pass | `src/generation/prompts/*.md`. `serial_writer.md` already exists; `SPINOFF.md` has the promotion and spinoff prompts essentially written. |

**B1 checklist** — get these right once and the rest of the track is plumbing:

- **Structured outputs** on every call: `response_format` with `strict: true`, parsed via `client.chat.completions.parse()` into a Pydantic model.
- **Content-hash cache** → `data/cache/`, keyed on (prompt version, model, input). `OFFLINE=1` **raises on a miss** rather than silently calling the API — that is what makes the kill switch testable.
- **Handle `finish_reason == "length"` as a hard failure.** The serial writer emits five episodes of prose *and* a full beat sheet in one response. Truncation here looks exactly like a prompt-quality problem and will be misdiagnosed as one. Stream it, and give `max_tokens` real headroom against the 128K ceiling.
- **Handle refusals.** The source material is fraud and organised crime. Low probability, but an unhandled refusal kills the demo live on stage.
- **Prompt-cache discipline.** Stable content first (system, canon, constraint set), volatile content last (episode number, per-call instruction). Never interpolate an episode number or timestamp near the front — it silently invalidates the prefix. Set `prompt_cache_key` per character to improve hit rate. Verify with `cached_tokens` in the usage block; if it stays zero across the five spinoff episodes, something upstream is varying.

---

## 4. Track C — Research agent

Independent. Cut this first if short-handed.

| # | Deliverable | Notes |
|---|---|---|
| C1 | Freeze the corpus | Run the existing fetchers **once**, commit `data/corpus.json`. `build_corpus()` currently writes to cwd — point it at `data/`. |
| C2 | Scoring rubric prompt | Adaptability sub-scores, novelty, clearance verdict with reasons. Structured output → dossier schema. |
| C3 | Bulk scoring run | Batch API, `gpt-5.6-luna`. Offline, once, results committed. |
| C4 | Bounded agentic loop | Capped tool-use loop over the frozen corpus. Local tools only: `list_candidates`, `read_item`, `score_item`. Hard iteration cap. **No network calls, ever.** |
| C5 | Clearance flags finished | The `greenlight` / `fictionalize_first` / `blocked` verdicts. This is the answer nobody else in the room will have — see `BUILD_PLAN.md` §7. |

---

## 5. Track D — Surface

Start now against fixtures. Do not wait for real data.

| # | Deliverable | Notes |
|---|---|---|
| D1 | Next.js skeleton, 4 screens stubbed | Ranked list → dossier → episodes + beat sheet → character panel. Hardcoded content is fine. |
| D2 | `src/api/` FastAPI layer | Thin. Queries and serialization only — no logic. |
| D3 | Wire screens to real data | As A and C land. |
| D4 | Character panel with the knows/blind split visible | The `hidden_from` field is the product; it has to be on screen. |
| D5 | Live generation view | Stream Jignesh's Episode 4 as it generates. Better than any spinner — the audience watches it being written. |
| D6 | Split-screen `b014` | Mainline beat beside his episode, validator green between them. **This is the money shot.** |
| D7 | Demo seed + kill switch test | `python tasks.py demo`. Then run the golden path ten times. |
| D8 | Deck + **backup video** | Record the video the moment the path works, not at the end. Wifi at hackathons fails. |

---

## 6. Gates

Each is go/no-go with a stated fallback. No gate is optional.

| Gate | Question | If no |
|---|---|---|
| **1** | Can you print Jignesh's `knows` / `blind` / `gaps` from the store? | Stop all other work. Everyone onto Track A. Nothing downstream exists without this. |
| **2** | Does a spinoff episode generate *and read well* out loud? | Generates but weak → continue, fix prompts in slack time. Doesn't generate → pre-generate the best version by hand, cache it, make the "live" moment a cached reveal. Don't volunteer this on stage; don't lie if asked directly. |
| **3** | Does the validator panel catch a **deliberately seeded** leak, then pass the fixed version? | Fix before anything else. A checker that only shows green is decorative, and a judge will say so. |
| **4** | Does the golden path run start to finish, unassisted, three times consecutively? | Cut the ranked-list screen, start the demo at the dossier, re-test. |

Gate 3 is the one most teams skip. It is what converts *claiming* continuity into *proving* it.

---

## 7. Staffing

### This team — 3 people

| Person | Owns | Directories |
|---|---|---|
| **P1** | **Track A — canon spine + validator** | `src/canon/`, `src/validation/`, `tests/`, `schemas/samples/`, `src/util.py`, `tasks.py` |
| **P2** | **Track B — generation** | `src/generation/` |
| **P3** | **Tracks C + D — research + surface** | `src/discovery/`, `src/scoring/`, `src/api/`, `web/` |

Shared files (`src/util.py`, `tasks.py`, `Makefile`, `requirements.txt`,
`.env.example`) are **P1's** to change — everyone else raises a request rather
than editing them, so the scaffolding cannot drift under people.

P2 is blocked on A6 (the constraint compiler) for the spinoff writer only.
Everything else in Track B — the OpenAI harness, the Pydantic schemas, the serial
writer — can start immediately. P3 is not blocked on anything; the hand-written
fixture in `schemas/samples/` is enough to build every screen against.

### If the headcount changes

Tracks are sized so they can collapse. Pick the row that matches the team:

| People | Assignment |
|---|---|
| **4** | A / B / C / D one each, as above. |
| **3** | Merge **C into D** — the research agent is a cached file plus a scoring prompt, and it is the least demo-critical work on the board. |
| **2** | One person **A+B**, one person **C+D**. Cut the ranked-list screen from the demo. |
| **1** | A → B → D in strict order. Cut C entirely; hand-write one dossier. |

Whatever the count: **Track A is the critical path**, and the moment it slips the
rest of the team stops and helps.

---

## 8. Working agreements

### Git

**Trunk-based on `main`. No branches, no PRs.** The module map already partitions
the codebase cleanly, so real conflicts are near-zero and branch ceremony buys
nothing in a time-boxed build.

- **Pull before you push.** That is the whole protocol.
- **Shared files are P1's alone**: `CLAUDE.md`, `tasks.py`, `Makefile`,
  `requirements.txt`, `.env.example`, `schemas/`, `.gitattributes`. Need a
  dependency added? Ask P1. This is the only place three people genuinely collide.
- **Tag at every gate** — `gate-1`, `gate-2`, `gate-3`. Lighter than branches and
  gives you a known-good point to fall back to when something breaks late.
- **`.env` is gitignored and stays that way.** Never commit the OpenAI key.
- **`data/cache/` is committed.** A cache that only exists on one laptop is not a
  kill switch. `.gitattributes` marks it `-diff` so it doesn't drown review.

### Recording decisions

Conversation does not survive a handoff. Three people working in parallel will
each learn something the other two need, and the default outcome is that they
don't say it — then two components disagree at 2am and nobody knows why.

| What | Goes where |
|---|---|
| A decision that changes someone else's work | Append a row to the §0 table above, with the date and who decided |
| A convention everyone must follow | `CLAUDE.md` — Claude Code auto-loads it for all three of us, so it's the highest-leverage place in the repo |
| Anything else | The commit message |

Worked example of the failure this prevents: P2 discovers the serial writer
needs an extra field on every beat, adds it locally, and says nothing. P1's store
rejects it, P3's beat-sheet screen renders blank, and the two of them spend an
hour bisecting a decision that took P2 thirty seconds to make.

**Local AI memory does not travel.** Claude Code's memory lives per-machine, per
user account. Anything the team needs is in the repo or it does not exist.

---

## 9. The one-line test

At every gate, ask: *can we still demo the sentence in `BUILD_PLAN.md` §0?*

> A real event becomes a serial, and any side character in it becomes the
> protagonist of their own serial without breaking continuity.

If yes, you are fine regardless of what else is broken. If no, everything else
is decoration — stop and fix the path.
