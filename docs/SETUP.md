# Setting this up in Claude Code

## 1. Install Claude Code

The native installer is now the recommended path and needs no Node.js:

**macOS / Linux / WSL**
```bash
curl -fsSL https://claude.ai/install.sh | bash
```

**Windows** — install Ubuntu via WSL2 and run from there. Native Windows works
for casual use but breaks around shell hooks and POSIX-path MCP servers.

**npm alternative** (needs Node 22+):
```bash
npm install -g @anthropic-ai/claude-code
```
Do **not** use `sudo` — it causes file-permission problems later. If you hit
EACCES, fix it with nvm rather than escalating.

Verify:
```bash
claude --version
```

Pick one install method and stick to it. Mixing npm-global and brew installs
causes PATH confusion that eats an afternoon.

## 2. Open the project

```bash
cd canonforge
claude
```

First launch opens a browser to authenticate. `CLAUDE.md` at the repo root loads
automatically at the start of every session — that is the file doing the work.

## 3. Sanity-check that context loaded

Ask it something only CLAUDE.md knows:

```
> what is hidden_from and why does it matter?
```

If the answer is vague, CLAUDE.md isn't being read — check you're in the repo
root and the file is named exactly `CLAUDE.md`.

## 4. Work the plan

```
> /plan build the canon store
> /spine
> /gate 1
```

Slash commands live in `.claude/commands/`. Add more as you go — a command is
just a markdown file with a description frontmatter and `$ARGUMENTS`.

## 5. Working habits that matter under time pressure

- **Plan before code.** `/plan <task>` forces it to name the files and the
  contract before touching anything. Cheap, prevents the most expensive class
  of mistake.
- **One task per session where possible.** Long sessions accumulate context and
  drift. `/clear` between unrelated tasks.
- **Never let it change `schemas/`.** Those are frozen contracts and other
  people are building against them. CLAUDE.md says this; `/plan` enforces it.
- **Commit at every gate.** Gates are the natural rollback points.
- **Run `/leak` once, deliberately.** It produces the demo's proof artifact.

## 6. Parallel work

Each track owns a directory (see the module map in `CLAUDE.md`). Two people can
run separate Claude Code sessions in the same repo on different directories
without collision, as long as nobody edits `schemas/`. Coordinate on Slack, not
on the filesystem.
