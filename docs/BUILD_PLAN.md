# BUILD PLAN
### Research Agent → Infinite Story Universe · PocketFM hackathon

Times are offsets from when you start, not wall clock. Gates are go/no-go — at each one you either continue or take the stated fallback. No gate is optional.

---

## 0. SCOPE LOCK

Read this before anything else. Hackathons die of scope, not of bugs.

**We are shipping one sentence:** *A real event becomes a serial, and any side character in it becomes the protagonist of their own serial without breaking continuity.*

**One golden path, rehearsed:** Molipur fake-IPL event → "The Century Hitters" mainline → click **Jignesh** → his Episode 4 generates live → validator turns green.

Anything not on that path is a bonus feature. If a task doesn't appear in the demo script below, it does not get built today.

---

## 1. THE DEMO SCRIPT (write this first, build only this)

Two minutes. Time each beat now, out loud, before you write code.

| t | On screen | Said |
|---|---|---|
| 0:00–0:20 | Ranked event list with scores + clearance flags | "Our agent scanned court records, GDELT and forums. Here's what it found — and note the clearance column, because you can't publish a drama about a private citizen in active litigation." |
| 0:20–0:40 | Click the IPL event → dossier opens | "Real event. Gujarat, 2022. Fake cricket league, real Russian money. Serializability 10 — the con escalates by itself." |
| 0:40–1:00 | Mainline episodes, scroll the beat sheet | "It wrote five episodes *and* a structured canon. Same call. Look at this field — hidden_from." |
| 1:00–1:20 | Character panel, Jignesh selected | "Jignesh appears in 4 beats and is locked out of 11. He doesn't know Russia exists." |
| 1:20–1:45 | His Episode 4 generates **live** | "So his story isn't the heist. It's a boy discovering he's paid to lose at the only thing he's good at." |
| 1:45–2:00 | Split screen: mainline beat vs his episode, validator green | "Same twenty seconds of canon. Opposite meaning. Zero contradictions — and here's the checker proving it." |

**Only one live generation in the demo.** Everything before Jignesh's episode is pre-generated and cached. One call is a dramatic pause; four calls is a stalled demo.

---

## 2. EXPLICITLY CUT

Say these out loud as a team so nobody quietly builds them:

- Live crawling on stage — corpus is a frozen JSON file
- Vector database / embeddings — filtering is retrieval at this scale
- Audio/TTS rendering — mention it as roadmap, don't build it
- Auth, accounts, persistence beyond a local DB
- More than one spinoff character wired end-to-end
- Story Time Machine, branching endings, anything from other tracks
- Mobile responsive anything

---

## 3. FREEZE THE CONTRACTS (H+0:00 → H+0:45)

**This is the highest-leverage 45 minutes of the day.** Four people can't work in parallel until the interfaces exist. Do this together, in one room, before anyone opens an editor.

Write three files with schemas and hand-faked sample data, commit them, and treat them as law:

1. `schemas/dossier.json` — research agent output (event, timeline, adaptability, clearance, novelty, engine)
2. `schemas/beat.json` — the canon beat, with `present` / `witnessed_by` / `hidden_from`
3. `schemas/character.json` — stub and promoted bible

Then hand-write **one** complete sample of each for the IPL event. Fake data, twenty minutes, no LLM. Now every track can build against real-shaped objects immediately, and nobody is blocked waiting for an upstream stage that doesn't exist yet.

**Also decide now:** repo, stack, one shared DB file or Postgres, who owns which directory.

---

## 4. TRACKS AND OWNERS

| Track | Owner | Owns |
|---|---|---|
| **A — Canon spine** | P1 | Beat store, character views, write-back, validator |
| **B — Generation** | P2 | Serial writer prompt, promotion call, spinoff writer prompt |
| **C — Research agent** | P3 | Discovery fetchers, corpus, scoring rubric, clearance |
| **D — Surface** | P4 | UI, demo seeding, pitch deck, backup video |

**If you are 3 people:** merge C into D — the research agent is mostly a cached file plus a scoring prompt, and it's the least demo-critical. **If you are 2:** one person does A+B, the other does C+D, and cut the ranked-list screen from the demo.

Track A is the critical path. If P1 falls behind, everyone else stops and helps P1.

---

## 5. PHASES

### Phase 1 — Spine and corpus (H+0:45 → H+3:00)

**A (critical path).** Beat store working: load the hand-written IPL beat sheet, and implement the three character queries — `knows`, `blind`, `gaps`. Pure code, no LLM. This is the whole architecture and it should take two hours, not six.

**B.** Serial writer prompt drafted and producing episodes + beat sheet in one call from the sample dossier. Don't tune quality yet — get the dual output shape correct first.

**C.** Wikipedia and GDELT fetchers running (no keys needed, start there). Reddit OAuth app registered. Indian Kanoon signup submitted — do this at H+0:45, not later, because token approval has a human in the loop.

**D.** UI skeleton with the four screens stubbed and hardcoded data. Real screens, fake content.

> ### GATE 1 — H+3:00
> **Can you print Jignesh's `knows` / `blind` / `gaps` lists from the store?**
> - **Yes** → continue.
> - **No** → stop all other work, everyone onto Track A. Nothing downstream exists without this.

---

### Phase 2 — Generation (H+3:00 → H+6:00)

**A.** Constraint-set compiler (beats → immutable bullet lines + prohibition list). Write-back with `tier: branch_canon`.

**B.** Promotion call working end to end: stub + knows + blind + gaps → character bible with want, wound, voice, engine, offscreen ledger, reframe. Then the spinoff writer with POV lock. **Generate Jignesh's Episode 4 and read it out loud to the team.** If it isn't good, that's a prompt problem and now is when you have time to fix it.

**C.** Scoring rubric prompt: dossier fields, interpretable sub-scores, clearance verdict with reasons. Run it over the corpus, save results.

**D.** Wire the ranked list and dossier screens to real data.

> ### GATE 2 — H+6:00
> **Does a spinoff episode generate and read well?**
> - **Yes** → continue.
> - **No, generates but weak** → keep going, fix prompts in Phase 4 slack.
> - **No, doesn't generate** → pre-generate the best version you can get by hand, cache it, and make the demo's "live" moment a cached reveal. Do not admit this on stage; do not lie if asked directly.

---

### Phase 3 — Validator (H+6:00 → H+8:00)

**A.** Three checks: leakage (character demonstrates prohibited knowledge), crossing-point mismatch, hook-type repeat. JSON output.

**Then do the thing most teams miss:** deliberately generate one spinoff episode **without** the constraint set, confirm the validator catches a real leak, and save both runs.

A checker that only ever shows green reads as decorative. A checker shown catching a genuine violation and then passing the fixed version is the difference between claiming continuity and proving it. Budget 20 minutes for this. It may be the single highest-value 20 minutes of the build.

**B.** Prompt quality pass on the mainline episodes — cliffhanger ladder, cut-early discipline.

**C.** Finish clearance flags. Freeze `corpus.json`. Track C is done after this; P3 moves to D.

**D.** Character panel screen with the knows/blind split visible.

---

### Phase 4 — Integration (H+8:00 → H+11:00)

Everyone converges. No new features.

- Seed the golden path end to end and run it ten times.
- Pre-generate and cache: corpus, scores, dossier, mainline episodes, mainline beat sheet, Jignesh's bible. Leave **only** his Episode 4 live.
- Split-screen comparison view — mainline beat b014 beside his episode.
- Kill switch: an env var that serves everything from cache, including the "live" generation. Test that it works.

> ### GATE 3 — H+11:00
> **Does the golden path run start to finish, unassisted, three times consecutively?**
> - **Yes** → freeze the repo. Bugfixes only from here.
> - **No** → cut the ranked-list screen, start the demo at the dossier. Re-test.

---

### Phase 5 — Freeze and rehearse (H+11:00 → H+13:00)

**Code freeze at H+11:00.** Nothing merges after this except crash fixes.

- **Record the backup video.** Screen recording of the full working demo. Non-negotiable — do it the moment the path works, not at the end. Wifi at hackathons fails.
- Rehearse the pitch five times with a timer. Not twice. Five.
- Build the deck: problem, the two-halves insight, architecture diagram, the b014 split screen, roadmap.
- Prepare the hostile-question answers (section 7).

### Phase 6 — Buffer (H+13:00 → H+14:00)

Reserved for the thing that breaks. If nothing breaks, rehearse again. Do not use this hour to add a feature.

---

## 6. RISK REGISTER

| Risk | P | Impact | Mitigation |
|---|---|---|---|
| Live API fails on stage | High | Fatal | Everything cached; kill switch tested |
| LLM latency stalls demo | High | High | One live call only; loading state that shows the constraint set being assembled, so the wait looks like work |
| Spinoff episode reads badly | Med | High | Gate 2 catches at H+6:00 with 5 hours of slack |
| Validator always green | Med | Med | Seeded failure case in Phase 3 |
| Indian Kanoon token not approved | Med | Low | Wikipedia + GDELT alone are enough for the corpus |
| Track A slips | Low | Fatal | Gate 1 pulls the whole team onto it |
| Someone builds an uncut feature | Med | High | Scope lock read aloud at H+0:00 and at every gate |

---

## 7. HOSTILE QUESTIONS — prepare answers now

**"Isn't this just a long prompt with the character's history in it?"**
Show the leakage run from Phase 3. A long prompt has no mechanism to stop the character knowing what they shouldn't; `hidden_from` plus the validator is that mechanism.

**"How does this scale to a real catalogue?"**
Two tiers. Cheap stubs auto-generated for every named entity at serial-generation time; the expensive promotion pass fires only on click. You never pay for characters nobody picks.

**"What if the spinoff contradicts something in episode 40 that hasn't aired?"**
Beats carry world_time. Retrieval is bounded by scene time, so future canon is unreachable by construction.

**"Can you legally adapt real events?"**
That's what the clearance column is for. Show a `blocked` verdict and a `fictionalize_first` verdict side by side. This is the answer nobody else in the room will have.

**"Which problem statement is this?"**
P6 research agent feeding P1 infinite story universe. Lead with P1 — the spinoff is the wow — and file under whichever the form forces.

---

## 8. THE ONE-LINE TEST

At every gate, ask: *can we still demo the sentence in section 0?*

If yes, you're fine regardless of what's broken. If no, everything else is decoration — stop and fix the path.
