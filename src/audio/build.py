"""
A written episode to a finished mp3, in one command.

    python -m src.audio.build --story story1_denied_identity --ep 1

Five stages, all in this repo:

    ep01.md          the writer's script
      -> convert     speaker labels to char_ids, SFX lines to cues     script_to_episode
      -> cast        one voice per character, locked for the series    voice/scripts
      -> synthesise  dialogue over a mood bed                          voice/pipeline
      -> sfx         spot effects generated and laid at their marks    sfx
      -> master      dynamics restored, levelled, peak capped          sfx + dynamics

The voice pipeline under `voice/` was written by Sandhiya Giri
(github.com/SandhiyaGiri/PocketFmTtsPipeline) and handed over; it is vendored
rather than shelled out to, so the whole chain versions and runs together.
"""

import os
import sys
import shutil
import pathlib
import argparse
from typing import Optional

from src.util import DATA, log
from src.audio import script_to_episode

STORIES = DATA / "stories"
VOICE = pathlib.Path(__file__).resolve().parent / "voice"

# The pipeline writes beside its own episode files, so it gets a working
# directory of its own rather than scattering output through the repo.
WORK = DATA / "voice_work"

# Synthesised clips and generated beds. Committed for the same reason the LLM
# cache is: a cache that exists on one laptop is not a kill switch, and the demo
# must be able to rebuild an episode with no network and no credits.
CACHE = DATA / "cache" / "voice"


def _requires(key: str) -> None:
    if not os.environ.get(key):
        raise RuntimeError(f"{key} is not set — copy .env.example to .env and fill it in")


def build(story: str, ep: int, provider: Optional[str] = None,
          bgm: bool = True, sfx: bool = True) -> pathlib.Path:
    from src.util import read_json, write_json
    from src.audio.voice.pipeline.orchestrator import run_episode
    from src.audio.voice.pipeline.audio_post import build_episode

    audio_dir = STORIES / story / "audio"
    audio_dir.mkdir(parents=True, exist_ok=True)
    WORK.mkdir(parents=True, exist_ok=True)
    CACHE.mkdir(parents=True, exist_ok=True)

    # 1. script -> episode.json, preserving any emotion tagging already done
    out_json = audio_dir / f"ep{ep:02d}.json"
    previous = read_json(out_json) if out_json.exists() else None
    write_json(out_json, script_to_episode.build(story, ep, previous=previous))

    staged = WORK / f"{story}_ep{ep:02d}.json"
    shutil.copy(out_json, staged)

    if provider != "mock":
        _requires("SARVAM_API_KEY")
        if bgm:
            _requires("ELEVENLABS_API_KEY")

    # 2 + 3. casting, then dialogue over a mood bed. `auto_cast_override` resolves
    #        any character without a voice — once, then locked for the series.
    episode_data, results, failures = run_episode(
        str(staged), provider_override=provider,
        cache_dir=str(CACHE), auto_cast_override=True)
    if failures:
        log(f"{len(failures)} lines failed to synthesise", "warn")

    mp3, manifest, duration_ms = build_episode(
        episode_data, results, output_dir=str(audio_dir),
        cache_dir=str(CACHE), bgm_enabled=bgm)

    log(f"dialogue mixed: {duration_ms / 1000:.0f}s")

    # 4 + 5. spot effects, dynamics, master
    if sfx:
        from src.audio.sfx import apply as apply_sfx
        return apply_sfx(story, ep)

    return pathlib.Path(mp3)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--story", required=True)
    ap.add_argument("--ep", type=int, default=1)
    ap.add_argument("--provider", default=None,
                    help="sarvam | elevenlabs | mock (mock costs nothing)")
    ap.add_argument("--no-bgm", action="store_true")
    ap.add_argument("--no-sfx", action="store_true")
    args = ap.parse_args()

    from src.util import load_env
    load_env()

    try:
        out = build(args.story, args.ep, args.provider,
                    bgm=not args.no_bgm, sfx=not args.no_sfx)
    except RuntimeError as exc:
        log(str(exc), "error")
        return 1

    log(f"finished: {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
