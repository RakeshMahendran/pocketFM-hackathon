# CanonForge

Real events in, serials out, and every side character can become a protagonist
without breaking continuity.

## Quick start

```bash
make setup
cp .env.example .env      # add ANTHROPIC_API_KEY
make demo                 # seeds the golden path from cache
make dev                  # http://localhost:8000
```

`make corpus` re-runs discovery against live sources. It is slow, needs API
credentials, and should never run during a demo. The committed
`data/corpus.json` is the artifact.

## Working on this with Claude Code

```bash
claude
```

`CLAUDE.md` loads automatically. Start with `/plan` before any non-trivial task.
Phase commands live in `.claude/commands/`.
