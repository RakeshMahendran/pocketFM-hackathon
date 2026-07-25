---
description: Run a build-plan gate check and report go/no-go
---

Gate: $ARGUMENTS

Read the gate definition in `docs/BUILD_PLAN.md`. Then:

1. Actually run the relevant commands or tests — do not assume.
2. Report PASS or FAIL against the gate's stated criterion.
3. On FAIL, state the fallback from the build plan verbatim and what to cut.
4. Do not soften a FAIL. A gate that is reported as passing when it isn't
   costs more than the failure does.
