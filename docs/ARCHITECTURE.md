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
| Canon store | no | beats | `canon.db` |
| Character view | no | char_id | knows / blind / gaps |
| Promotion | yes | stub + views | character bible |
| Spinoff writer | yes | bible + constraints | episodes + branch beats |
| Validator | yes | scripts + constraints | violations[] |

## Character context is three filters

```python
knows = [b for b in beats if char in b.present + b.witnessed_by]
blind = [b for b in beats if char in b.hidden_from]
gaps  = time_windows_where(beats, char, count=0)
```

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

## Scale answer (roadmap, not built)

Embeddings over beats with time-bounded retrieval (`world_time <= scene_time`
filtered through the character's epistemic view). Not needed at 40–60 beats per
season, where filtering *is* retrieval.
