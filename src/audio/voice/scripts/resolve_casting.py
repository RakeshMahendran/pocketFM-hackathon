"""
Usage:
  python scripts/resolve_casting.py --episode data/episodes/ep_014.json
  python scripts/resolve_casting.py --episode data/episodes/ep_014.json --provider sarvam
  python scripts/resolve_casting.py --episode data/episodes/ep_014.json --provider sarvam --force

Resolves any casting gaps in config/casting.json for the given episode's
characters against one or more providers, without spending a single TTS
synthesis call. Safe to re-run — already-cast characters (manual or
previously auto-resolved) are left alone unless --force is passed, and
--force only touches entries this resolver itself wrote.
"""

import sys
import argparse
import logging

sys.path.insert(0, ".")

from dotenv import load_dotenv

from src.audio.voice.pipeline.casting_resolver import resolve_casting
from src.audio.voice.pipeline.orchestrator import load_episode
from src.audio.voice.providers.factory import get_provider, load_config, PROVIDERS
from src.audio.voice.providers.base import ProviderError

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("resolve_casting")


def main():
    parser = argparse.ArgumentParser(description="Resolve dynamic voice casting for an episode")
    parser.add_argument("--episode", required=True, help="Path to episode.json")
    parser.add_argument("--provider", nargs="*", default=None,
                         help="Provider(s) to resolve casting for (default: active_provider from config.yaml)")
    parser.add_argument("--cache-dir", default="data/cache")
    parser.add_argument("--force", action="store_true",
                         help="Re-resolve entries this resolver previously auto-cast (never touches manual overrides)")
    parser.add_argument("--refresh-voices", action="store_true",
                         help="Bypass the cached voice-roster listing and re-fetch from the provider")
    args = parser.parse_args()

    episode = load_episode(args.episode)
    config = load_config()
    provider_names = args.provider or [config["active_provider"]]

    for name in provider_names:
        if name not in PROVIDERS:
            logger.error(f"Unknown provider '{name}'. Available: {list(PROVIDERS.keys())}")
            sys.exit(1)
        try:
            provider, provider_name = get_provider(config=config, override_name=name, cache_dir=args.cache_dir)
        except ProviderError as e:
            logger.error(f"Could not initialize provider '{name}': {e}")
            sys.exit(1)

        resolved = resolve_casting(
            episode, provider, cache_dir=args.cache_dir,
            force=args.force, refresh_voices=args.refresh_voices,
        )
        if resolved:
            logger.info(f"[{provider_name}] resolved casting for: {resolved}")
        else:
            logger.info(f"[{provider_name}] nothing to resolve (all characters already cast)")


if __name__ == "__main__":
    main()
