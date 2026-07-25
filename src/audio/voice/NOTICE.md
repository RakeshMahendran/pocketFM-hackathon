# Vendored: voice-pipeline

Original author: Sandhiya Giri — https://github.com/SandhiyaGiri/PocketFmTtsPipeline
Handed over to this project 2026-07-26 and maintained here from that point.

Vendored rather than depended on, so the whole chain — script, voices, sound,
master — versions and runs together, and so the fixes this project needs can be
made at source instead of requested.

Changed on import:
- `pipeline.*` / `providers.*` imports rewritten for `src.audio.voice.*`
- config and schema paths anchored to this package rather than the working
  directory, so it runs from anywhere
- her `casting.json` lockfile dropped — those were her characters
