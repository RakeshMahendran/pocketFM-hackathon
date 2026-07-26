# Architecture

## The one idea

Do not generate prose and then try to recover character memory from it. RAG over
finished episode text is lossy and it is exactly where continuity breaks.
Instead the serial writer emits **prose and structured canon in the same call**,
and a character's context becomes a database query rather than a reconstruction.

## Stages

| Stage | LLM? | In | Out |
|---|---|---|---|
| Discovery | **yes** | eight story categories | `data/corpus.json` |
| Scoring | yes | corpus item | dossier |
| Serial writer | yes | dossier | episodes + beat sheet |
| Canon store | no | beats | Lakebase Postgres |
| Character view | no | char_id | knows / blind / gaps |
| Promotion | yes | stub + views | character bible |
| Spinoff writer | yes | bible + constraints | episodes + branch beats |
| Validator | yes | scripts + constraints | violations[] |
| Audio | yes (director) | episode + season | mastered mp3 |

## Character context is three filters

```python
knows = [b for b in beats if char in b.witnessed_by]
blind = [b for b in beats if char not in b.witnessed_by]   # the complement
gaps  = time_windows_where(beats, char, count=0)
```

Two things this is not, both of which were written down before the data existed:

**`knows` is not `present + witnessed_by`.** Being in the room is not knowing.
b014 has `mallesha` present and not witnessing, which is the point of having two
fields — `present_not_witnessed()` in `src/canon/views.py` is that set, and it is
where dramatic irony lives.

**`blind` is not the `hidden_from` list.** It is the complement of `knows`, and
therefore fail-closed. `hidden_from` is authored and non-exhaustive: ep1 b003
names seven of sixteen cast. If `blind` meant only "named in `hidden_from`", the
other nine would be in neither view and so **unconstrained** — the spinoff writer
could say anything about them. See `tests/test_agent.py`, which asserts 35 rather
than 34 for exactly this reason.

The corollary is that an empty `witnessed_by` is fatal, not merely lossy: every
character is then blind to every beat, the constraint set compiles to nothing,
and nothing errors, because an empty view is a valid shape.

`gaps` is where spinoffs are set. Canon says nothing in those windows, so nothing
there can be contradicted — **absence is the writable space**.

## Two tiers keep "infinite" affordable

- **Stub** — auto-generated for every named entity when the serial is written.
  Name, role, five facts, one want, a few verbatim lines as a voice sample.
  Near-free.
- **Bible** — the promotion call. Fires only when a user clicks that character.
  You never pay for characters nobody picks.

## Continuity enforcement

1. **Constraint injection** — `knows` flattened into immutable lines, prepended
   to every spinoff call, plus an explicit prohibition list from `blind`.
2. **Post-generation validation** — leakage, crossing-point mismatch, hook-type
   repeat. Runs as a separate cheap call.
3. **Tiered write-back** — spinoff beats commit as `branch_canon`. They may
   reference `core_canon` but never mutate it. Branch beats default to
   `hidden_from = all mainline characters` unless explicitly placed, which stops
   branches leaking into each other.

## Crossing points

A beat present in both mainline and spinoff. Objective facts must match exactly;
meaning is free. Beat `b014` gets twenty seconds in the mainline and a whole
episode in the Jignesh spinoff. Same fact, opposite meaning, zero contradiction —
this is the demo.

## Script to mp3

One command — `python -m src.audio.build --story <id> --ep 1`. Six stages:

| Stage | LLM? | Adds | Module |
|---|---|---|---|
| convert | no | line_id, language, voice hints from the cast | `script_to_episode` |
| direct | **yes, agent** | emotion, intensity, pace, bgm_cue, pause_after_ms | `director` |
| cast | no | one Sarvam voice per char_id, locked per series | `voice/scripts` |
| synthesise | no | one clip per line, over a mood bed | `voice/pipeline` |
| sfx | no | spot effects generated, level-matched, ducked | `sfx` |
| master | no | dynamics restored, levelled, true peak capped | `sfx` + `dynamics` |

The writer returns `{speaker, text, sfx_cue}` and stops. **How a line is performed
is not the writer's call** — it would be tagging line 3 before line 71 exists.
The director is an agent rather than a call because the question it answers,
"is this episode the climb or the dip", requires the season, and cannot be
written into a prompt in advance.

That makes the director the only source of direction, not a review pass. An
episode that reaches synthesis without it is `neutral 0.5` on every line, which
is not neutral — it is flat, and the same number drives the read, the bed and the
line's own level in the mix. It still masters to spec and sounds dead, so
`build.py` logs it at error level rather than letting it pass.

`src/audio/tag.py` does the same job as a one-shot call, kept for seasons written
before the director existed.

## The console does not call the API, and that is the design

`web/` reads `data/` directly from server components, or shells out to
`python -m src.publish` / `src.canon.cast` / `src.spinoff_run` / `src.audio_run`.
There is not one `fetch()` in the frontend, and there should not be.

Both processes run in one container (`start.sh`), so an HTTP hop between them
would buy a second failure mode, a contract to keep in step and a latency cost,
for nothing a reader would notice. A server component reading a local file is
not a shortcut around the API; it is the shorter path to the same truth.

`src/api/` exists for what is genuinely outside that container: the Databricks
surface, and anyone reading the canon who is not this console. Its shape is
therefore free to follow what an external caller needs rather than what a page
happens to render.

Two rules keep the split from rotting, both learned by watching it rot:

- **Everything is under `/api/`.** Three endpoints were mounted at `/stories/*`
  while `next.config.ts` proxies only `/api/:path*`, so through the one public
  origin they answered 404 — the spin-off generator among them. Nothing noticed,
  because nothing called them.
- **The API answers about what it has, or 404s.** `GET /api/characters/{id}/view`
  used to return a confident `knows: 0, blind: everything` for a name nobody in
  the canon has, which is indistinguishable from a real character kept out of an
  entire season. Fail-closed is right for the view; it is wrong for the lookup.

The spec is served, not written by hand: `/api/openapi.json`, with Swagger at
`/api/docs`. Both are reachable through the console's own origin, so the deployed
app documents itself.

## Scale answer (roadmap, not built)

Embeddings over beats with time-bounded retrieval (`world_time <= scene_time`
filtered through the character's epistemic view). Not needed at 40–60 beats per
season, where filtering *is* retrieval.
