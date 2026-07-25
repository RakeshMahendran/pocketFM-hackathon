"""
Generate a line, or a short passage, on demand.

    python -m src.audio.live --story story1_denied_identity --ep 1 --lines l025-l026

A finished mp3 is a recording. The demo moment is watching a line come into
existence — `DELIVERY_PLAN` D5 calls it better than any spinner, because the
audience sees the thing being made rather than a progress bar over something that
already existed.

This is the same pipeline as `build`, scoped to a few lines and reporting how long
each one actually took. It reuses the locked casting and the line's own direction,
so what is generated live is the same performance as the rest of the episode —
not a special case that only works on stage.

Nothing here is a separate code path. If it works, the full build works.
"""

import os
import sys
import time
import pathlib
import argparse
from typing import Any, Dict, List, Optional

from src.util import DATA, log, read_json

STORIES = DATA / "stories"
CACHE = DATA / "cache" / "voice"


def _select(lines: List[Dict[str, Any]], spec: Optional[str]) -> List[Dict[str, Any]]:
    """`l025`, `l025-l026`, or nothing for the last exchange."""
    if not spec:
        return lines[-2:]
    if "-" in spec:
        first, last = spec.split("-", 1)
        ids = [l["line_id"] for l in lines]
        return lines[ids.index(first):ids.index(last) + 1]
    return [l for l in lines if l["line_id"] == spec]


def generate(story: str, ep: int, spec: str = None, language: str = None,
             provider: str = None, fresh: bool = True) -> List[Dict[str, Any]]:
    from src.audio.voice.providers.factory import get_provider, load_config
    from src.audio.voice.providers.base import SynthesisRequest
    # The pipeline's own remapper: casting.json is namespaced by series, and
    # providers look voices up by bare character id. Reimplementing that split
    # here is exactly how a live path drifts from the batch one.
    from src.audio.voice.pipeline.orchestrator import _effective_casting
    import json

    audio_dir = STORIES / story / "audio"
    stem = f"ep{ep:02d}_{language}" if language else f"ep{ep:02d}"
    episode = read_json(audio_dir / f"{stem}.json")
    chosen = _select(episode["lines"], spec)

    config = load_config()
    prov, name = get_provider(config=config, override_name=provider,
                              cache_dir=str(CACHE))
    casting = json.loads(
        (pathlib.Path(__file__).resolve().parent / "voice" / "config" /
         "casting.json").read_text(encoding="utf-8"))
    effective = _effective_casting(casting, episode["characters"],
                                   episode.get("series_id"))

    out = []
    for line in chosen:
        request = SynthesisRequest(
            text=line["text"], character_id=line["speaker"],
            emotion=line["emotion"], intensity=line.get("intensity", 0.5),
            language=line["language"], pace=line.get("pace", "normal"),
            line_id=line["line_id"])
        voice_id = prov.resolve_voice_id(line["speaker"], effective)

        started = time.perf_counter()
        result = prov.synthesize(request, voice_id)
        elapsed = time.perf_counter() - started

        spoken = len(line["text"].split())
        log(f"{line['line_id']}  {line['speaker']:10} {voice_id:8} "
            f"{elapsed:5.2f}s for {spoken:2d} words  [{line['emotion']}]")
        out.append({"line_id": line["line_id"], "seconds": round(elapsed, 2),
                    "words": spoken, "result": result})

    if out:
        total = sum(o["seconds"] for o in out)
        words = sum(o["words"] for o in out)
        log(f"{len(out)} lines, {words} words, {total:.2f}s "
            f"({words / total:.1f} words per second of wall clock)")
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--story", required=True)
    ap.add_argument("--ep", type=int, default=1)
    ap.add_argument("--lines", default=None,
                    help="l025, or l025-l026. Default: the last exchange.")
    ap.add_argument("--language", default=None)
    ap.add_argument("--provider", default=None)
    args = ap.parse_args()

    from src.util import load_env
    load_env()
    if not os.environ.get("SARVAM_API_KEY"):
        log("SARVAM_API_KEY is not set", "error")
        return 1

    generate(args.story, args.ep, args.lines, args.language, args.provider)
    return 0


if __name__ == "__main__":
    sys.exit(main())
