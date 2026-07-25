---
description: Plan a task against the build plan before writing any code
---

Read `docs/BUILD_PLAN.md` and `CLAUDE.md` first.

For the task: $ARGUMENTS

1. State which phase and track this belongs to.
2. State whether it is on the golden path. If it is not, say so and stop —
   ask whether to proceed anyway.
3. List the files you will create or modify.
4. List the contracts in `schemas/` this touches. If it would change a schema,
   stop: schemas are frozen and changing one blocks other tracks.
5. Name the smallest testable slice, and write that test first.

Do not write implementation code in this response.
