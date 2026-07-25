"""
Usage:
  python main.py --episode data/episodes/ep_014.json
  python main.py --episode data/episodes/ep_014.json --provider mock   # test without API credits
  python main.py --episode data/episodes/ep_014.json --provider sarvam
  python main.py --episode data/episodes/ep_014.json --auto-cast        # resolve casting gaps automatically
  python main.py --episode data/episodes/ep_014.json --bgm              # force-enable generated background ambience
"""

import argparse
import logging
import sys

from dotenv import load_dotenv

from src.audio.voice.pipeline.orchestrator import run_episode
from src.audio.voice.pipeline.audio_post import build_episode
from src.audio.voice.pipeline.validate import ValidationError
from src.audio.voice.providers.base import ProviderError
from src.audio.voice.providers.factory import load_config

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("main")


def main():
    parser = argparse.ArgumentParser(description="Pocket FM voice pipeline runner")
    parser.add_argument("--episode", required=True, help="Path to episode.json")
    parser.add_argument("--provider", default=None,
                         help="Override active_provider from config.yaml (e.g. mock, elevenlabs)")
    parser.add_argument("--cache-dir", default="data/cache")
    parser.add_argument("--output-dir", default="data/output")
    parser.add_argument("--auto-cast", action="store_true",
                         help="Auto-resolve any casting gaps before synthesis (overrides config.yaml)")
    parser.add_argument("--bgm", action="store_true",
                         help="Force-enable generated background ambience (overrides config.yaml)")
    args = parser.parse_args()

    try:
        episode, results, failures = run_episode(
            args.episode, provider_override=args.provider, cache_dir=args.cache_dir,
            auto_cast_override=True if args.auto_cast else None,
        )
    except (ValidationError, ProviderError) as e:
        logger.error(f"Aborting before/during synthesis: {e}")
        sys.exit(1)

    if failures:
        logger.warning(f"{len(failures)} line(s) failed to synthesize and were skipped:")
        for f in failures:
            logger.warning(f"  - {f['line_id']}: {f['error']}")

    if not results:
        logger.error("No lines synthesized successfully. Aborting.")
        sys.exit(1)

    config = load_config()
    silence_ms = config.get("pipeline", {}).get("inter_line_silence_ms", 200)
    target_dbfs = config.get("pipeline", {}).get("target_dbfs", -20.0)
    bgm_enabled = args.bgm or config.get("pipeline", {}).get("bgm_enabled", False)

    out_path, manifest_path, duration_ms = build_episode(
        episode, results, output_dir=args.output_dir, inter_line_silence_ms=silence_ms,
        cache_dir=args.cache_dir, target_dbfs=target_dbfs, bgm_enabled=bgm_enabled,
    )

    logger.info(f"Episode built: {out_path}")
    logger.info(f"Manifest: {manifest_path}")
    logger.info(f"Duration: {duration_ms / 1000:.1f}s | Lines synthesized: {len(results)} | Failed: {len(failures)}")


if __name__ == "__main__":
    main()
