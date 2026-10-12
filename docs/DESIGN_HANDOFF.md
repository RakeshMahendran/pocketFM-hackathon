# DESIGN HANDOFF — the UI revamp

### For whoever picks this up next. Written at the end of the design session.

The console was rebuilt from a document into a catalogue. One screen is **shipped**;
ten more are **designed but not built**. This says what was decided, why, what is
done, and what to do next.

---

## 0. The one-line version

> Art and numbers first, text on demand. Nothing is deleted — every paragraph the
> old screens showed still exists, one click down, still reachable by find-in-page.

If you change one thing here, keep that rule. Every decision below follows from it.

---

## 1. What was actually wrong

Measured, not guessed. The audit is worth re-reading before you argue with any of it.

| Finding | Evidence |
|---|---|
| **Data was below the fold on every screen** | `/sourcing` first row at y≈680 of a 745px viewport; `/serials` y≈650; `/cast` y≈630 |
| **The `NEXT STEP` card was the largest object on every screen** — and it is chrome | ~260px tall, bordered, repeated the same fine print on five consecutive screens |
| **No hierarchy inside a row** | `one_line` and `why_not` rendered at the same size and nearly the same colour, so nothing was scannable |
| **The same fact printed twice, adjacent** | `/cast`: a bar showing `17 / 29` with *"Was there for 17 moments and shut out of 29"* directly beneath it, ×17 rows |
| **Half the viewport empty** | 1568px window, prose wrapping at `34rem` (~545px) in a left column |
| **No type scale** | Three near-identical ad-hoc body sizes: `text-[0.9375rem]` (11 uses), `text-[1.0625rem]` (11), `text-sm`. **This is most of why it read as a document** — not the word count, the fact that every word was the same size |
| **~4,350 words of copy in four "temporary" files** | `lib/words.ts`, `components/pathWords.ts`, `audioWords.ts`, `spinoffRunWords.ts` — plus `SEASON_WORDS` hidden inside `SeasonLayout.tsx` |

**The smoking gun for the copy problem:** `pathWords.ts:341` ships
`withoutRepeatedRules()` / `SAID_ONCE` — a *runtime string-stripper* whose only job
is to delete duplicate sentences the four-file split could not prevent at source.

**The decisive screen numbers:** `/sourcing` rendered ~2,500 words (30 rows × two
paragraphs). `/home` rendered ~500 words with **zero** backend data. The episode
page was 58% explanatory prose.

---

## 2. The design decisions, and the reasoning you'd otherwise re-litigate

### Aesthetic: "Cinema"

Chosen from three built directions (Pulp / Cinema / Broadsheet — all on the canvas,
page 2). Warm charcoal ground, Instrument Serif over Archivo, rounded art tiles with
real depth, pill controls.

- **Why not Pulp:** Anton is all-caps condensed; caps destroy word-shape, which is
  the cue that makes a list scannable. Fine for one hero, fatal across 30 rows. It
  also has nowhere for cover art to go.
- **What survived from Pulp:** the score slab. A big number in a coloured block has
  conviction; the pill in the corner was timid about the one number the screen exists
  to communicate.
- **Cinema's risk, stated plainly:** its failure mode is looking like every other dark
  streaming UI. It earns its distinctiveness *only* when the tiles hold real artwork.

### The ground is warm (`#100e0c`), not neutral (`#0b0b0c`)

Every tile behind it is cover art. A neutral black reads as an absence next to a
photograph; a warm one reads as a room the art is hanging in.

### Webfonts are now allowed — the old ban still holds

`globals.css` said *"a webfont is a network dependency and this has to render on
conference wifi."* Sound reasoning. It is satisfied, not broken: `next/font/google`
fetches at **build** time and self-hosts, so there is no runtime call to
fonts.gstatic.com. The local Next 16 docs confirm it
(`node_modules/next/dist/docs/01-app/01-getting-started/13-fonts.md`).

### The accent has exactly ONE job

Ochre/gold marks **the sorted dimension** and the primary action. Not badges, not
hover, not selected rows. The Linear teardown names "using the accent everywhere it
is semantically plausible" as the single most common failure, and a 30-row scored
list invites exactly that.

### Badge only the exceptions

- `greenlight` → **no badge.** Absence is the signal.
- `fictionalize_first` → small-caps text, no pill. A note, not an alarm.
- `blocked` → whole row to ~45% opacity + the word in `--color-halt`.

Three states separated by **presence, typography and opacity** — three non-colour
channels, so it survives colour-blindness and a projector.

### Score strip: fixed slot order, forever

Five bars: **engine · hook · feeling · conflict · cast**, in that order, in every row,
never sorted within a row. Fixed position is the *entire* reason the strip earns its
space — slot 3 is scannable down 30 rows only because slot 3 is always the same
measure. Sorting within a row would look tidier and destroy the instrument.

`engine_longevity` leads because it is the one axis that can **refuse a winner
outright** (`src/discovery/search.py:_check_winner()`) and is the tie-break in `_rank()`.

Geometry from Stephen Few's bullet-graph spec: a track, a fill, nothing else. No
border, no ticks, no axis, no per-row labels.

### The pipeline ribbon is merged into the header — and is still NOT links

`Pipeline.tsx` was right: **steps 3 and 4 have no honest destination until a show is
picked**, so a row of links where half guess at a show is worse than no links. The
ribbon's 41px band is gone; `PipelineMark` puts the same fact inline in the header.
The other three stage names live in its `title`, and `/home` spells all four out.

### Disclosure is `<details name="...">`

Single-open accordion, no JavaScript. NN/g's objection to accordions is that people
leave them all open and the list turns to mush — `name` is the fix. Plain `<details>`
means **find-in-page still reaches closed content**: things are hidden from the eye,
never from a search.

### Filtering is a query parameter, not client state

`?kind=` and `?view=table`. A row of chips should not ship a hydrated bundle.

---

## 3. What is BUILT (shipped, running)

Branch: **`story-publish-tweaks`**. `main` was deliberately left alone.

| File | What |
|---|---|
| `web/app/sourcing/page.tsx` | **Rebuilt.** Hero + art grid + category chips + `?view=table` |
| `web/components/ui.tsx` | **New.** The primitives: `ArtCard`, `Shelf`, `Stat`, `Pill`, `Action`, `Reveal`, `SectionHead`, `Split` |
| `web/components/ScoreStrip.tsx` | **New.** Five axes, fixed order |
| `web/components/StoryArt.tsx` | **New.** Cover art with a real `src` slot; deterministic gradient per story id until art exists |
| `web/app/globals.css` | Warm tokens **added beside** the old greys; type scale `t-hero`→`t-small`, `t-num`, `.shelf` |
| `web/app/layout.tsx` | `next/font` (Instrument Serif + Archivo), one header bar, ribbon merged |
| `web/components/Pipeline.tsx` | `PipelineMark` added; the old `Pipeline` ribbon kept but no longer rendered |
| `web/tests/e2e/sourcing-cinema.spec.ts` | **New.** 5 tests, all passing |
| `web/tests/e2e/_harness.ts` | **Bug fix** — see §6 |

### Tests (5/5 green, written before the implementation)

1. The list answers the decision without a click (`sells`, `episodes`, `total`, 5 axes)
2. Every row carries the five axes in one fixed order — **this is the important one**
3. The case against is in the DOM but not visible until clicked
4. Opening one row closes the last
5. A blocked story is still listed and still refuses

Run: `cd web && CF_WEB_PORT=3001 npx playwright test tests/e2e/sourcing-cinema.spec.ts`

> **Not run:** the other seven specs. The user deferred a full pass until the revamp
> is finished. Do that before any PR.

---

## 4. What is DESIGNED but NOT built

Canvas: **https://claude.ai/code/artifact/37f447c9-30fa-4b9b-80dc-2246154e8552**
(opens on "The whole app"). Source artboards in `.design/sourcing/*.dc.html`.

| # | Artboard | Route | The problem it solves |
|---|---|---|---|
| 1 | `Home.dc.html` | `/home` | ~500 words, **zero** data — the most text-heavy screen, in first position |
| 2 | `Scout.dc.html` | `/scout` | A real recorded agent run buried under ~610 words, incl. 57 words explaining what Play does, above a button labelled Play |
| 3 | `Main.dc.html` | `/sourcing` | **BUILT** — use as the reference implementation |
| 4 | `Brief.dc.html` | `/candidates/[id]` | Clearance must stay legible in a screenshot, never on hover |
| 5 | `Commissioning.dc.html` | `/commissioning/[id]` | Show the work arriving; don't narrate the wait |
| 6 | `Shows.dc.html` | `/serials` | Artwork + release state; spin-offs sold on the same shelf |
| 7 | `Season.dc.html` | `/serials/[id]` | Worst screen in the old app: ~1,500 words closed, ~3,000 open, cast list duplicated from `/cast`, `hidden_from` in a 62-word tooltip |
| 8 | `Episode.dc.html` | `/serials/[id]/[ep]` | 58% explanatory; ~150 words defending a director pass that is off the demo path |
| 9 | `Cast.dc.html` | `/serials/[id]/cast` | **The demo screen.** 17 rows × ~72 words → faces + one bar |
| 10 | `Character.dc.html` | `/cast/[char]` | knows/blind stays unfolded and at size |
| 11 | `Spinoff.dc.html` | `/cast/[char]/[anchor]` | Validator report unfolded + the control pair |

Suggested build order: **9 → 4 → 6 → 7 → 8 → 10 → 11 → 1 → 2 → 5.**
Cast first: it is the hardest case and the one the demo turns on.

---

## 5. Rules that must survive the rebuild

These are product, not taste. Breaking one breaks the pitch.

1. **knows/blind stays legible on every screen it appears on.** It is the claim. Use
   `Split` from `components/ui.tsx`. Never render it as a sentence beside a bar that
   already shows it.
2. **The validator report stays unfolded on the spin-off episode**, including every
   violation's `beat_id` and quoted line, plus the ruled-out attempts. A claim behind
   a fold is a claim nobody read.
3. **The control pair stays** — same character, same moment, written twice, only one
   allowed to pass. That is the answer to *"isn't this just a long prompt?"*
4. **The clearance verdict stays legible in a screenshot**, not on hover. BUILD_PLAN
   calls it "the answer nobody else in the room will have."
5. **A `blocked` row is never hidden.** Dim it; show that the law stopped it.
6. **Never point the user at a blocked row** as the recommended action.
7. `CHECKER_EXPLAINED` — "six passes, three of them hostile" — is what makes a green
   tick worth anything. Keep it.

---

## 6. Bug found and fixed en route

`web/tests/e2e/_harness.ts` had a **teammate's machine path hardcoded** as the default
output dir (`C:/Users/RAKESH/...`). The whole suite died with `EPERM` before collecting
a single test on any other laptop. Now falls back to `os.tmpdir()`; `CF_E2E_OUT` still
overrides.

---

## 7. Known issues / gotchas

- **The app is mid-rollout and looks it.** The chrome is new on all 11 screens; only
  `/sourcing` has a new body. The other ten are new-header-over-old-body until moved.
  This is the expected cost of doing chrome first, but do not ship it half-done.
- **Tailwind drops arbitrary utilities if you delete and recreate a file.** Symptom:
  `h-[26rem]` present in the class list, computed height 0. Fix: touch the file to
  force a rescan. Cost me ~15 minutes; do not debug it as a CSS problem.
- **`why_this_sells` is not a tagline.** Median 24 words, **max 111**, and the current
  scout winner is the 111. `hook()` in `sourcing/page.tsx` takes the first sentence.
  Reuse it — do not render the raw field at display size.
- **Three pre-existing TS errors** in `tests/e2e/demo.spec.ts` (timeout literal types).
  Not mine, not fixed, unrelated.
- Dev server was killed for low memory at the end of the session. `npm run dev` in `web/`.

---

## 8. Data the design needs (the user offered; this is the ask)

Ordered by how much each unlocks.

| Field | Where | Why it matters |
|---|---|---|
| **Cover art per story** | corpus + stories | **The big one.** Every hero, card and shelf is composed around it. Without it the whole design stays handsome-but-abstract. Generated/abstract is fine |
| **Character portraits** | cast | Turns `/cast` from 17 rows into 17 faces — the demo screen |
| **`tagline`** ≤12 words | corpus | A real hook a card can carry, instead of clamping a 111-word field |
| **`character.tagline`** ≤10 words | cast | Same, for the roster |
| **Episode art or a colour** | episodes | So a 14-episode list is not 14 lines of text |

The user confirmed cover art is coming. `StoryArt` already takes `src` — drop it in and
nothing else moves.

---

## 9. Things deliberately NOT done

- **The four copy files were not consolidated.** It is the root cause of the
  duplication, but it is a large refactor with no visible payoff and real merge risk
  against whoever owns `lib/words.ts`. Flagged, not fixed.
- **No features removed.** Explicit user instruction. The table view, the operator
  command, the warnings, the audio block, the reference folds — all still reachable.
- **`main` untouched.** All work is on `story-publish-tweaks`.
- **Nothing committed.** Working tree only.
