"""
Single switch point for choosing a TTS vendor.

To add a new provider:
  1. Write providers/<name>_provider.py implementing TTSProvider (see base.py)
  2. Import it below and add it to PROVIDERS
  3. Add its section to config/emotion_map.yaml and config/casting.json
  4. Set active_provider: <name> in config/config.yaml

Nothing outside this file and the new adapter needs to change.
"""

import os
import yaml

from src.audio.voice.providers.elevenlabs_provider import ElevenLabsProvider
from src.audio.voice.providers.sarvam_provider import SarvamProvider
from src.audio.voice.providers.mock_provider import MockProvider
from src.audio.voice.providers.base import ProviderError

PROVIDERS = {
    "sarvam": SarvamProvider,
    "elevenlabs": ElevenLabsProvider,
    "mock": MockProvider,
}


CONFIG_PATH = os.path.join(os.path.dirname(__file__), "..", "config", "config.yaml")


def load_config(config_path: str = CONFIG_PATH) -> dict:
    with open(config_path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def get_provider(config: dict = None, override_name: str = None, cache_dir: str = "data/cache"):
    """Returns (provider_instance, provider_name). override_name lets the
    CLI force a provider (e.g. --provider mock) without editing config.yaml."""
    config = config or load_config()
    name = override_name or config["active_provider"]

    if name not in PROVIDERS:
        raise ProviderError(
            f"Unknown provider '{name}'. Available: {list(PROVIDERS.keys())}. "
            f"Did you register it in providers/factory.py?"
        )

    provider_config = config.get(name, {})
    pipeline_config = config.get("pipeline", {})
    provider = PROVIDERS[name](provider_config, pipeline_config, cache_dir=cache_dir)
    return provider, name
