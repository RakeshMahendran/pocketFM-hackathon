# PLAN — spinoff slice

**Cast → pick a character → pick a moment → generate their episode → prove no leaks.**

Everything upstream (discovery, scoring, dossier, mainline episodes) is built and
delivered as static files under `data/stories/`. We do not touch `src/discovery/`
or `src/scoring/` — they are the only worked example of the call pattern we copy.

Supersedes `BUILD_PLAN.md` and CLAUDE.md's module map where they disagree.

---

## Input (measured, do not re-derive)

`data/stories/<story_id>/` — 4 stories, 14 episodes each, 44–58 beats, 12–17 cast.
One story is 176 KB and loads in 2.3 ms including every script.

| File | We use |
|---|---|
| `dossier.json` | `cast[]`, `clearance`, `fictionalization_map`, `never_narrate_as_fact`, `season[].hook_type` |
| `beats.json` | the canon: `present` / `witnessed_by` / `hidden_from` / `what_happened` / `state_changes` |
| `episodes/ep*.md` | verbatim voice samples only, by regex on `SPEAKER:` |
| `promises.json` | not used in this slice |

## Locked semantics

1. `knows` = char in `witnessed_by`. **`blind` = every other beat** (fail-closed).
   `hidden_from` is non-exhaustive — story1 `b001` leaves 3 of 17 unaccounted,
   `kempanna` is unaccounted on 36 of 46 — so it is prompt emphasis only.
   `docs/SPINOFF.md:13` and `.claude/commands/spine.md` state the wrong rule
   (`present + witnessed_by`). Put the correction in a comment on `blind()`.
2. `present − witnessed_by` = in the room, did not register. Real: b006, b009,
   b014, b025. Empty for `ratnamma` — omit the block rather than render it empty.
3. Promotable = `witnessed >= 3` and `blind > witnessed` (`serial_writer.md:129`).
   13 of 17 in story1. No extra protagonist clause — `chaitra` (43/3) fails naturally.
4. Leak = a **concrete fact** traceable to a blind beat. Not thematic resemblance.
5. Every spinoff claim cites an allowed `beat_id`. Validation is set-membership.
6. Order beats by `(ep, seq)`. **`world_time` is never parsed or compared** — it is
   a different unparseable scheme per story (`M1-D04 13:30`, `Y1 M8 D0, morning`,
   `Chait, pay-out day`, `same, minutes later`). Display label only.
7. Branch beats: `tier: branch_canon`, `pov: <char_id>`, ids namespaced in Python,
   `hidden_from` defaults to every mainline character.

Ignore `HANDOFF.md`'s knows/blind table — it counts `present` and `hidden_from`.
Ours: ratnamma 11 / 35.

## Anchors — two kinds, both clickable

Rank beats where the character is a `state_changes.entity` by `abs(valence)`.
Tag each with `kind`, do **not** filter:

- `witnessed` — she is in `witnessed_by`. The episode *is* this moment; objective
  facts are fixed. Ratnamma: **b033** (+4, 2 present).
- `offscreen` — she is not. The episode is set adjacent to it and must not reveal
  it. Ratnamma: **b032** (+5, *"recognised on a government order as the appointee's
  widow"* — and she is explicitly in its `hidden_from`), **b031** (+4, her marriage
  documented for the first time).

Both moments she never learns of are the largest in her season; the one she is
present for is her giving up the claim. That is the story's architecture, not an
edge case, which is why offscreen ships rather than gets cut.

The prompt branches on `kind` — one conditional block, ~15 lines. The model does
the craft; we only say which job. Handing it a beat that is both "write this" and
"you may not know this" makes it guess, and it guesses differently each run.

Skip anchors with `len(present) > 5` — `b044` is legal for her but is the ep-14
finale resolving nine threads, unwritable from one POV.

**Narrator is third-person limited, locked to her, and may be wrong about the wider
plot** (`docs/SPINOFF.md:106`). Not taste: an omniscient narrator makes every leak
question "was that narration or interiority?", which is the judgement call we
removed from the validator.

## Architecture calls

- **No SQLite**, no memoisation, no dataclasses. Load JSON per call; 2.3 ms.
  Output to `data/spinoffs/`. All reads behind `src/canon/store.py`.
- **Threads, not asyncio**, for the panel — `ThreadPoolExecutor`, 6 network-bound
  calls, no shared state. asyncio would mean `AsyncOpenAI`, which breaks every
  `StubClient` in the suite. Put that reason in a comment on the pool.
- **No Pydantic.** Plain dict schemas + `text={"format": {"type": "json_schema",
  ..., "strict": True}}`, `json.loads(response.output_text)`. CLAUDE.md:81 says
  Pydantic; the code does not, and the code wins.
- Split-screen shows `beat.what_happened`, not the raw script.

## Layout

```
src/llm.py                  obj(), call_json(), load_prompt(), cache read   [shared]
src/canon/store.py          load a story, index it                          [A]
src/canon/views.py          knows/blind/gaps/anchors/voice/promotable
                            + forbidden_facts()                             [A]
src/canon/gate1.py          one character's view, printed                   [A]
src/canon/cast.py           the roster screen                               [A]
src/generation/brief.py     assemble the brief + the two renderers          [B]
src/generation/promote.py   stub -> bible                                   [B]
src/generation/spinoff.py   the episode + branch beats                      [B]
src/validation/checks.py    deterministic, no LLM                           [A]
src/validation/panel.py     3 checks + 3 refuters, threaded                 [A]
src/validation/run.py       CLI; `--proof` runs the leak experiment         [A]
src/demo_seed.py            cached golden path                              [B]
src/generation/prompts/{promotion,spinoff}.md
src/validation/prompts/{leakage,crossing,hook,refuter}.md
```

Twelve modules. Packages already exist and `tasks.py` already routes at these paths
(retarget `leak` to `src.validation.run --proof`).

Kept deliberately against a push to merge further:

- **`promote.py` stays separate from `spinoff.py`.** One call producing bible *and*
  episode leaves no seam to inspect. At Gate 2 you must be able to tell "the
  character conception is wrong" from "the prose is wrong", or you tune blind.
- **`brief.py` stays separate.** It is the most important string in the system and
  the only one worth testing on its own.
- **Domain vocabulary is binding.** `blind`, `gaps`, `panel`, `refuter`,
  `crossing point`, `promotion` are defined in CLAUDE.md's table and do not get
  renamed to something more literal. Drop "juror" — that one is not in the table.

## Key signatures

```python
# src/llm.py
def obj(required: dict) -> dict                      # copy of src/scoring/run.py:42
def call_json(stage, system, user, schema, schema_name, model,
              max_output_tokens=16000, client=None) -> dict
def load_prompt(path, **slots) -> str                # {{slot}} replace, never .format()

# src/canon/views.py
def knows(story, char_id) -> list
def blind(story, char_id) -> list                    # the complement. fail-closed
def explicitly_hidden(story, char_id) -> list        # subset of blind, prompt emphasis
def present_not_witnessed(story, char_id) -> list
def gaps(story, char_id) -> list                     # runs of consecutive unwitnessed beats
def anchors(story, char_id, limit=3) -> list         # each carries kind: witnessed|offscreen
def voice_samples(story, char_id, limit=12) -> list  # raises on zero, never empty
def promotable(story) -> list                        # all cast, augmented with counts
def character_view(story, char_id) -> dict
def forbidden_facts(story, char_id) -> dict          # {allowed[], forbidden[], *_ids}

# src/generation/brief.py
def render_immutable(payload, name) -> str
def render_prohibitions(payload, name) -> str        # parameterised on name, not "him"
def build_brief(story, char_id, anchor_beat_id, stance, genre, pitch,
                bible=None, constrained=True) -> dict
```

`brief.py` and `checks.py` both **import** `forbidden_facts` — the fail-closed rule
is written once, in `blind()`. `spinoff.py` persists the payload into its output
file; `validate` reads it back from there, so it checks the list the writer was
actually handed.

## The guarantee is `cites`, not the panel

Freeze this before writing prompts. The spinoff returns `cites: [beat_id]` for every
factual claim, and `checks.py` asserts `set(cites) <= set(allowed_ids)` with no model
in the loop. **That is the guarantee** — deterministic, arguable by nobody.

The panel is *evidence*, not proof. Six LLM opinions can miss a leak; a set-membership
check cannot. Say it that way on stage too: the checker is how we show the guarantee
holds, not how it is enforced. Anything the panel finds that `cites` did not is a
prompt bug to fix, not the mechanism working as designed.

## Schemas — write these before any prompt

Prompt work without a frozen output schema turns validation into archaeology.
Four dict schemas, all built with `obj()`, all `strict: True`:

| Schema | Fields |
|---|---|
| `BIBLE_SCHEMA` | `want`, `wound`, `voice`, `engine`, `offscreen_ledger[{window,what}]`, `reframe`, `stance` (enum), `genre`, `pitch` |
| `SPINOFF_SCHEMA` | `title`, `logline`, `script`, `beats[]`, `crossings[{mainline_beat_id,rendered_as,objective_facts_kept}]`, `cites[]`, `flags[]` |
| `BRANCH_BEAT_SCHEMA` | the mainline beat fields plus `crossing_of` (nullable). Sealed in Python afterwards — `tier`, `pov`, `beat_id`, `hidden_from` are never taken from the model |
| `VIOLATION_SCHEMA` | `check`, `severity`, `quote`, `beat_id`, `why`, `source` — one shape for deterministic and panel output alike |

No arbitrary-key maps anywhere (strict mode forbids them); nullable via
`{"type": ["string", "null"]}`.

## Brief blocks

WHO · THE MOMENT (branches on `kind`) · IMMUTABLE · **PROHIBITED** · IN THE ROOM
DID NOT REGISTER *(omitted when empty)* · OPEN SPACE · CROSSING POINTS · VOICE ·
CLEARANCE.

`constrained=False` removes **only** the PROHIBITED block. One boolean, so the leak
proof is a controlled experiment rather than a second code path.

CLEARANCE is not optional: story1 is `fictionalize_first`, and hard rules 3 and 4
are currently enforced only inside `episode.md`, which our prompt does not inherit.
Check the **keys of `fictionalization_map`** (`"Mysuru district, Karnataka"`,
`"Hunsur taluk"`) — story1's `people[]` records roles, not names, so checking that
array finds nothing.

## Build order

| # | Work | Checkpoint |
|---|---|---|
| 0 | `util.py` constants, `src/llm.py` incl. cache **read**, and the four schemas above | offline replay works before anything needs it; schemas frozen before any prompt |
| 1 | `store.py`, `views.py` | **G1** — `tasks.py gate1 --char ratnamma` prints 11/35, 4 gap runs, 3 anchors (1 offscreen), 41 voice lines. Then loop all chars × all 4 stories; nothing raises |
| 2 | `constraints.py`, `cast.py` | `tasks.py cast` shows 17, 13 promotable. `len(allowed)+len(forbidden) == n_beats` |
| 3 | `brief.py` | read one end to end aloud. Constrained/unconstrained diff is exactly one block |
| 4 | `promotion.md`, `promote.py` | engine permanently on; reframe is not the mainline from another angle |
| 5 | `spinoff.md`, `spinoff.py` | **G2** — b033 generates, reads well, crossing point matches. Then b032 in offscreen mode |
| 6 | `checks.py` | `cites` outside `allowed_ids` is caught with no model call. Run on step 5's output; expect a real catch |
| 7 | `panel.py`, prompts, `run.py` | 6 verdicts; a dead check reports `inconclusive`, never `clean` |
| 8 | `run.py --proof` | **G3 — the leak proof.** Unconstrained run leaks, panel names the beat, constrained run clean. Both saved to `tests/fixtures/`. Do not trade this for polish |
| 9 | `demo_seed.py` | **G4** — `OFFLINE=1 tasks.py demo` 3× with the network off. Record the video the first time it works |

1→2→3 is a hard chain. Build 7 against a hand-written spinoff JSON so the panel
does not wait on a good episode.

## tasks.py

Three-place registration (`cmd_*`, `COMMANDS`, `build_parser`). Add `--story` as a
separate `if` before the existing `if/elif` chain, over
`("cast","gate1","promote","spinoff","validate","leak","demo")`. Add `cmd_cast`.
Forward args on `cmd_validate` (currently passes none). Fix the `jignesh` default
in `tasks.py:139` and `Makefile:35` — no story contains him.

`validate` exits 0 when the panel ran, whatever the verdict; `--strict` makes
violations exit 1. `run_module` prints an owner hint on non-zero, so a validator
exiting 1 because it worked reads as a crash on stage.

### CLI contract — one canonical command per stage, with its output

```
tasks.py cast     --story story1_denied_identity          -> stdout, 17 rows
tasks.py gate1    --story … --char ratnamma               -> stdout, 11/35
tasks.py promote  --story … --char ratnamma               -> data/spinoffs/<s>__<c>__bible.json
tasks.py spinoff  --story … --char ratnamma --anchor b033 -> data/spinoffs/<s>__<c>__b033.json
tasks.py validate --file data/spinoffs/<s>__<c>__b033.json-> …__b033__validation.json
tasks.py validate --proof --story … --char ratnamma       -> …__leak.json, …__clean.json
tasks.py demo     --story … --char ratnamma               -> the golden path, all cached
```

Anything that writes a file logs its path via `write_json`, which already does.

### Cache and fixture policy — decide now, not at hour 10

`data/cache/` is committed and is the kill switch; `tests/conftest.py:17` redirects
writes to `tmp_path` so the suite cannot pollute it. Files are `{stage}_{sha1[:12]}.json`
with the key being `system + user`, exactly as `save_raw` already writes them.

Stage names must be self-describing so an offline miss says which call failed:
`promote`, `spinoff`, `spinoff_leak`, `panel_leakage`, `panel_crossing`, `panel_hook`,
`refuter_inference`, `refuter_specificity`, `refuter_omniscience`.

Commit the demo's cache files. Commit the leak-proof pair to `tests/fixtures/`.
Do not commit exploratory runs.

## Tests

Match existing conventions: full-sentence names, `_`-prefixed builders, hand-written
`StubClient`, no mock library, `pytest.raises(match=)`.

- `test_blind_is_every_beat_the_character_did_not_witness` — a beat in neither
  `witnessed_by` nor `hidden_from` must be blind. **The one that matters most**:
  it catches someone simplifying `blind` back to `hidden_from`.
- `test_being_present_without_witnessing_is_not_knowing`
- `test_an_anchor_the_character_did_not_witness_is_labelled_offscreen`
- `test_the_brief_and_the_validator_are_handed_the_same_forbidden_list`
- `test_the_unconstrained_brief_differs_only_by_the_prohibition_block`
- `test_a_citation_of_a_forbidden_beat_is_caught_without_a_model_call` — the guarantee
- `test_a_check_that_fails_is_reported_as_inconclusive_not_as_clean`
- `test_a_returned_beat_is_sealed_as_branch_canon_whatever_the_model_said`
- `test_a_cache_miss_offline_raises_and_names_the_file`
- `test_every_registered_command_has_a_parser_branch`

`src/llm.py` must resolve the cache dir as `cache.CACHE` at call time, not
`from src.util import CACHE` — `tests/conftest.py:17` patches the former, and a
fresh binding would let the suite write stubs into the committed demo cache.

## Known data problems (log, never crash)

- story2 and story4 put non-people in beat arrays (`"the bench"`, `"corridor queue"`,
  and `bansi`/`sukhdev` who are absent from `cast`). Fail-closed `blind` keeps this
  safe; warn at load so an operator knows why counts look wrong.
- `lokanath` has 0 beats and 0 lines (dead before ep1). Fails promotable naturally.

## Cut

SQLite · memoisation · constraint-digest drift tripwire · a separate `leak.py`
(it is `run.py --proof`) · a separate `constraints.py` · beat→prose offset alignment ·
a second demo character wired end to end · audio/TTS · auth · mobile · anything
upstream of `data/stories/`.
