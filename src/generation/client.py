"""
The one place generation talks to a model.

Two things live here that a caller should never re-implement:

**A read-through cache.** `CLAUDE.md` requires every response cached and the
demo runnable offline. `src/discovery/cache.py` writes a forensic copy but never
reads one back, so nothing was replayable. A season is a dozen paid calls; a
crash in batch nine should cost the ninth call, not all nine.

**Failure that is legible.** A truncated season looks exactly like a weak prompt
and gets misdiagnosed as one, so truncation raises and says so. Same for a
refusal — the source material is fraud and impersonation, and a refusal on stage
with no explanation is worse than one with.
"""

import os
import json
import hashlib
from typing import Any, Dict, Optional

from src.util import CACHE, log, offline
from src.discovery.cache import save_raw

# Replayable responses, keyed by their input. Kept apart from the forensic dumps
# `save_raw` writes: those are keyed by stage and overwritten, these are the
# record the demo runs from.
CALLS = CACHE / "calls"

DEFAULT_MODEL = "gpt-5.6-sol"
# A batch is several full episodes plus a beat sheet, a ledger and a calendar.
# Sized generously: the failure this guards against is a season truncated
# mid-scene, which is expensive to notice and cheap to prevent.
MAX_OUTPUT_TOKENS = 32000


def model_for(role: str = "WRITER") -> str:
    return (
        os.environ.get(f"OPENAI_MODEL_{role}")
        or os.environ.get("OPENAI_MODEL_WRITER")
        or DEFAULT_MODEL
    )


def cache_key(**parts: Any) -> str:
    """
    Hash of everything that could change the answer.

    Sorted and separator-normalised so an unordered dict cannot produce two keys
    for one request — a cache that misses silently is worse than none, because
    it looks like it is working right up until the bill.
    """
    blob = json.dumps(parts, sort_keys=True, ensure_ascii=False, default=str)
    return hashlib.sha1(blob.encode("utf-8")).hexdigest()[:16]


def _cached(path) -> Optional[Dict[str, Any]]:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        # A damaged cache entry is not a reason to fail: the call can be made
        # again. Silently returning None would hide it, so say so.
        log(f"cache entry {path.name} unreadable ({exc}) — recalling", "warn")
        return None


def _refusal(response: Any) -> str:
    for item in getattr(response, "output", []) or []:
        data = item.model_dump() if hasattr(item, "model_dump") else dict(item)
        for block in data.get("content") or []:
            if isinstance(block, dict) and block.get("type") == "refusal":
                return str(block.get("refusal", "no reason given"))
    return ""


def call_structured(
    stage: str,
    system: str,
    user: str,
    schema: Dict[str, Any],
    schema_name: str,
    role: str = "WRITER",
    client: Any = None,
    max_output_tokens: int = MAX_OUTPUT_TOKENS,
    tools: Any = None,
) -> Dict[str, Any]:
    """
    One structured call, cached on its inputs.

    `client` is injectable so the writer can be tested without a key and without
    a socket — the tests pass a stub and never reach this module's import of the
    SDK.

    `tools` turns it into a bounded tool loop instead: the model asks, the tools
    answer from local data, and it keeps going until it stops asking. Use it only
    where the query genuinely cannot be written in advance — a stage that could
    be handed everything it needs should be handed it. Caching still holds,
    because the tools read on-disk data and the same inputs produce the same
    questions and the same answers.
    """
    model = model_for(role)
    tool_names = ",".join(sorted(t.name for t in tools)) if tools else ""
    key = cache_key(stage=stage, model=model, system=system, user=user, schema=schema,
                    tools=tool_names)
    path = CALLS / f"{stage}_{key}.json"

    hit = _cached(path)
    if hit is not None:
        log(f"{stage}: cache hit {path.name}")
        return hit

    if offline():
        raise RuntimeError(
            f"OFFLINE is set and {stage} has no cached response for this input "
            f"({path.name}). The demo runs from cache; regenerating needs the "
            f"kill switch off, deliberately."
        )

    if client is None:
        from openai import OpenAI

        client = OpenAI()

    if tools:
        from src.agent import run as run_agent

        parsed = run_agent(client, model, system, user, tools, schema, schema_name)
        try:
            CALLS.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(parsed, ensure_ascii=False, indent=2),
                            encoding="utf-8")
            log(f"{stage}: cached -> {path.name}")
        except OSError as exc:
            log(f"{stage}: could not cache ({exc})", "warn")
        return parsed

    response = client.responses.create(
        model=model,
        input=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        text={
            "format": {
                "type": "json_schema",
                "name": schema_name,
                "schema": schema,
                "strict": True,
            }
        },
        max_output_tokens=max_output_tokens,
    )

    # Before anything is parsed. A post-processing bug should cost a re-parse,
    # not a re-call.
    save_raw(stage, key, response)

    refused = _refusal(response)
    if refused:
        raise RuntimeError(
            f"{stage}: the model refused ({refused}). The source material is "
            "fraud and impersonation, so this is foreseeable, not a bug — the "
            "dossier may need its harder claims softened before regenerating."
        )

    if getattr(response, "status", None) == "incomplete":
        raise RuntimeError(
            f"{stage}: response truncated "
            f"({getattr(response, 'incomplete_details', 'no detail')}). "
            "A short season here is truncation, not a weak plan — raise "
            "max_output_tokens or shrink the batch. Do not tune the prompt for it."
        )

    text = getattr(response, "output_text", "") or ""
    if not text.strip():
        # Never default to {}. An empty result writes a well-formed season with
        # no episodes in it and exits successfully.
        raise RuntimeError(
            f"{stage}: no text output (status={getattr(response, 'status', '?')})"
        )

    parsed = json.loads(text)

    try:
        CALLS.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps(parsed, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        log(f"{stage}: cached -> {path.name}")
    except OSError as exc:
        # The response is already paid for and in hand. Failing to cache it is
        # not a reason to throw it away.
        log(f"{stage}: could not cache response: {exc}", "warn")

    return parsed
