# CanonForge

Real events in, serials out, and every side character can become a protagonist
without breaking continuity.

Two halves, one pipeline. A research agent searches for real events worth
adapting, rates them and says whether they can legally be made. A writer turns
the winner into a season **and** a structured record of every moment in it —
including who was kept in the dark. Any character in that record can then be
given their own serial, generated on demand, and checked line by line against
the season it came from.

## Run it

Windows, macOS and Linux alike. `make` is a thin delegate over `tasks.py`, which
needs no `make` installed.

```bash
python tasks.py setup                    # venv + dependencies
cp .env.example .env                     # then add OPENAI_API_KEY
```

Two processes. In one terminal:

```bash
python tasks.py api                      # FastAPI on :8001
```

In another:

```bash
cd web && npm install && npm run dev     # the console on :3000
```

Open **http://localhost:3000**. There is no password — pick a name, which is
recorded against anything you decide to make.

### Run it without spending anything

```bash
OFFLINE=1 python tasks.py api            # PowerShell: $env:OFFLINE="1"
```

Every LLM response is cached to `data/cache/` keyed on a hash of its input. With
`OFFLINE` set, a cache miss **raises** rather than quietly calling the API, so a
demo cannot surprise you with a bill or a network failure. Eight finished
seasons, their spin-offs, their verdicts and twenty recordings are committed, so
a fresh clone has a working console before it has an API key.

## What to look at first

| | |
|---|---|
| `/sourcing` | 29 real events, rated, with the legal read on each |
| `/serials/story1_denied_identity` | a finished season, live, released one episode at a time |
| `/serials/story1_denied_identity/1` | listen to it — English and Hindi-English, with and without sound effects |
| `/serials/story1_denied_identity/cast` | 17 characters, sorted by how much the season kept from them |
| `.../cast/ratnamma` | the claim: an episode written to her limits, against one written without them |

API docs are served by the app itself at **/api/docs**, spec at
**/api/openapi.json**. The console does not call the API — it reads `data/`
directly from server components. That is deliberate; see `docs/ARCHITECTURE.md`.

## Keys

`OPENAI_API_KEY` is the only one needed to generate. `SARVAM_API_KEY` and
`ELEVENLABS_API_KEY` are needed only to record audio, and recording also needs
**ffmpeg** on the PATH — `pydub` shells out to it and pip cannot supply it:

```bash
winget install Gyan.FFmpeg          # Windows
brew install ffmpeg                 # macOS
```

## Commands

```bash
python tasks.py --list                                          # all of them
python tasks.py test                                            # the suite
python tasks.py cast --story <id>                               # who could carry a spin-off
python tasks.py spinoff_run --story <id> --char <id>            # write one, and check it
python tasks.py spinoff_run --story <id> --char <id> --replay   # free, from what is on disk
python tasks.py audio_run --story <id> --ep 1                   # record an episode
python tasks.py publish --story <id> --episode 1                # release one episode
python tasks.py leak --story <id> --char <id>                   # prove the check catches a violation
```

`python tasks.py corpus` re-runs discovery against live sources. It is slow,
needs credentials, and should never run during a demo — the committed
`data/corpus.json` is the artifact.

## Reading the code

`CLAUDE.md` is the contract: the vocabulary, the architecture, and the rules
that are not negotiable. `docs/BUILD_PLAN.md` says what is deliberately out of
scope. `docs/ARCHITECTURE.md` explains the pipeline, and why the console and the
API are separate on purpose.
