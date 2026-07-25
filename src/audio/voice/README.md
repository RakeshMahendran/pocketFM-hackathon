# Pocket FM Voice Pipeline

For architecture, the voice-casting flow, and the full input→output flow
chart, see [INTEGRATION_GUIDE.md](INTEGRATION_GUIDE.md).

Provider-agnostic voice pipeline for episodic, multi-character, Hindi /
English / Tamil audio drama. **Sarvam (`bulbul:v3`) is the active TTS
provider** — it's India-first and has documented code-mixed text support,
so English words embedded in a Hindi (or Tamil) line keep an Indian accent
instead of switching models mid-sentence. ElevenLabs remains available as
an alternate TTS provider (`--provider elevenlabs`) and, separately, powers
generated background ambience via its Sound Effects API. The whole pipeline
is built so a new TTS provider is one adapter file + two config edits, not
a rewrite.

## Setup

```bash
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# then paste your real SARVAM_API_KEY (dialogue) and ELEVENLABS_API_KEY
# (background ambience generation, and the elevenlabs TTS fallback) into .env
```

## Test the pipeline first, without spending credits

```bash
python main.py --episode data/episodes/ep_014.json --provider mock
```

This runs the full pipeline — schema validation, casting/emotion
pre-flight checks, orchestration, caching, stitching, manifest — using a
silent placeholder-audio provider. If this works, the pipeline itself is
correct and any issues on a real run are provider-specific (API key,
casting, credits).

## Cast your characters (dynamic — no more copy-pasting voice IDs by hand)

`config/casting.json` is a generated, locked lockfile, not something you
hand-edit line by line. Resolve any gaps for an episode's characters
against Sarvam's speaker roster (`config/voices.json`, scored against each
character's `persona`/`gender` in the episode file) with:

```bash
python scripts/resolve_casting.py --episode data/episodes/ep_014.json
# or for a specific provider / to re-resolve previously auto-cast entries:
python scripts/resolve_casting.py --episode data/episodes/ep_014.json --provider elevenlabs
python scripts/resolve_casting.py --episode data/episodes/ep_014.json --force
```

Once a character is cast (auto or by hand), that assignment is locked —
every future run and every future episode reuses the same voice for that
character, which is what keeps them sounding consistent across an entire
series. Manually editing an entry in `casting.json` "pins" it — the
resolver will never overwrite a non-placeholder value, even with `--force`.
Pass `--auto-cast` to `main.py` to resolve casting gaps automatically as
part of a normal run instead of running the script separately.

## Run for real

```bash
python main.py --episode data/episodes/ep_014.json
# or explicitly:
python main.py --episode data/episodes/ep_014.json --provider sarvam
python main.py --episode data/episodes/ep_014.json --bgm   # + generated background ambience
```

Output:
- `data/output/<episode_id>.mp3` — the stitched, loudness-normalized episode
- `data/output/<episode_id>_manifest.json` — per-line timing, provider,
  voice_id, emotion, language, and (if `--bgm`) which mood cues were used
- `data/cache/` — per-line clips (provider-prefixed filenames) and
  `data/cache/bgm/` generated ambience beds, both reused on re-runs

## Writing a new episode

Add a JSON file under `data/episodes/` following `schemas/episode_schema.json`.
Required per line: `line_id`, `speaker`, `text`, `language`
(`hi`/`en`/`hi-en`/`ta`/`ta-en`), `emotion` (one of the 13 in the schema —
see `config/emotion_map.yaml` to add more), `intensity` (0–1). Optional per
line: `pace`, `bgm_cue` (override the mood-driven background music cue),
`provider` (force a specific line onto a non-default provider — a manual
escape hatch, not the primary mechanism for anything). Optional at the
episode level: `series_id` (namespaces casting so two different shows
can each have an unrelated character with the same name) and `bgm` (`{enabled,
default_mood}`). This is the contract your research/script agent should target.

## Background music

`--bgm` (or `pipeline.bgm_enabled: true` in `config/config.yaml`) layers in
background ambience that's *generated*, not sourced from asset files: each
of the 13 emotions maps to a text prompt (`config/bgm_map.yaml`) sent to
ElevenLabs' Sound Effects API, cached once per mood, looped to fit, and
mixed with pace/intensity-driven gain and ducking under dialogue. If BGM
generation fails for any reason (missing key, API error), the run logs a
warning and falls back to dialogue-only output — it never breaks a run.

## Switching or mixing TTS providers

1. Write `providers/<name>_provider.py` implementing `TTSProvider` (see `providers/base.py`)
2. Fill in that provider's block in `config/casting.json` (or run `scripts/resolve_casting.py --provider <name>`)
3. Fill in that provider's section in `config/emotion_map.yaml`
4. Register it in `providers/factory.py`
5. Set `active_provider: <name>` in `config/config.yaml`, or pass `--provider <name>`

A single line can also override its own provider (`"provider": "elevenlabs"`
in that line's JSON) as a manual escape hatch — useful when one specific
line sounds better on a different vendor. `--provider` on the CLI forces
*every* line, bypassing per-line overrides entirely.

## Project layout

```
config/            active provider, voice casting (generated), voice roster,
                    emotion→provider-syntax map, BGM mood/prompt map
schemas/           episode.json JSON Schema (the script-generator contract)
providers/         TTSProvider interface + one adapter per vendor
pipeline/          orchestrator, cache, validation, casting resolver, BGM,
                    loudness normalization, audio stitching
scripts/           resolve_casting.py — dynamic voice casting CLI
data/episodes/     input scripts
data/cache/        per-line rendered clips + generated BGM beds (safe to
                    delete to force re-synth/regeneration)
data/output/       final stitched episodes + manifests
main.py            CLI entry point
```
