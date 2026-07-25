---
description: Phase 1 Track A — build the canon spine (critical path)
---

Build the canon store and character views. This is the critical path; nothing
downstream exists without it.

1. `src/canon/store.py` — SQLite, one `beats` table and one `characters` table.
   Beats stored with JSON columns for the array fields.
2. `src/canon/views.py` — three functions, no LLM:
   - `knows(char_id)`   -> beats where char in present OR witnessed_by
   - `blind(char_id)`   -> beats where char in hidden_from
   - `gaps(char_id)`    -> time windows with zero beats for this char
3. `src/canon/constraints.py` — compile knows/blind into the injectable
   constraint set (immutable lines + prohibition list).
4. Load `schemas/samples/ipl_beats.json` as a fixture and prove the three
   views return the expected lists for `jignesh`.

Write the tests first. Gate 1 is: can you print Jignesh's knows/blind/gaps.
