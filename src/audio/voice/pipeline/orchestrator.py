"""
Reads an episode.json, resolves provider(s) via the factory, synthesizes
each line (using the cache where possible), and returns an ordered list of
SynthesisResult ready for audio_post to stitch.

Most runs use exactly one provider throughout (config.yaml's active_provider,
or --provider). A line may optionally name its own "provider" as a manual
escape hatch (e.g. one line still sounds better on a different vendor) —
providers are instantiated lazily, once each, the first time a line needs
them. This file still has ZERO provider-specific synthesis logic in it.
"""

import json
import logging

from src.audio.voice.providers.factory import get_provider, load_config
from src.audio.voice.providers.base import SynthesisRequest, ProviderError
from src.audio.voice.pipeline.cache import line_hash, load_from_cache, save_to_cache
from src.audio.voice.pipeline.casting_resolver import resolve_casting, casting_key
from src.audio.voice.pipeline.validate import validate_episode, validate_provider_coverage, ValidationError

import os as _os
_HERE = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))

logger = logging.getLogger("orchestrator")


def load_episode(episode_path: str) -> dict:
    with open(episode_path, "r", encoding="utf-8") as f:
        return json.load(f)


def _load_casting() -> dict:
    with open(_os.path.join(_HERE, "config", "casting.json"), encoding="utf-8") as f:
        return json.load(f)


def _effective_casting(casting: dict, characters: list, series_id: str = None) -> dict:
    """Remap series-namespaced casting.json keys back to bare character ids
    so providers' resolve_voice_id() can stay a simple lookup, unaware of
    series scoping."""
    return {
        c["id"]: casting.get(casting_key(c["id"], series_id)) or casting.get(c["id"], {})
        for c in characters
    }


def run_episode(episode_path: str, provider_override: str = None, cache_dir: str = "data/cache",
                 auto_cast_override: bool = None):
    episode = load_episode(episode_path)
    validate_episode(episode)

    config = load_config()
    default_provider, default_provider_name = get_provider(
        config=config, override_name=provider_override, cache_dir=cache_dir
    )
    providers = {default_provider_name: default_provider}

    def get_or_create(name: str):
        if name not in providers:
            providers[name], _ = get_provider(config=config, override_name=name, cache_dir=cache_dir)
        return providers[name]

    series_id = episode.get("series_id")

    # Which provider will actually voice each line — usually all the same
    # (default_provider_name), but a per-line "provider" override pulls in
    # extra providers on demand. --provider forces every line, bypassing
    # per-line overrides entirely (keeps the existing `--provider mock`
    # testing workflow unambiguous).
    lines_by_provider = {}
    for line in episode["lines"]:
        name = provider_override or line.get("provider") or default_provider_name
        lines_by_provider.setdefault(name, []).append(line)

    auto_cast = (
        auto_cast_override if auto_cast_override is not None
        else config.get("pipeline", {}).get("auto_cast_missing", False)
    )
    if auto_cast:
        for name in lines_by_provider:
            resolve_casting(episode, get_or_create(name), cache_dir=cache_dir)

    # Fail loud and early: validate casting + emotion coverage for every
    # provider this run will actually touch, before a single API call.
    for name, lines in lines_by_provider.items():
        provider = get_or_create(name)
        relevant_characters = {l["speaker"] for l in lines}
        relevant_emotions = {l["emotion"] for l in lines}
        validate_provider_coverage(
            episode, provider, name, characters=relevant_characters, emotions=relevant_emotions
        )

    casting = _load_casting()
    effective_casting = _effective_casting(casting, episode["characters"], series_id)

    results = []
    failures = []

    for line in episode["lines"]:
        provider_name = provider_override or line.get("provider") or default_provider_name
        provider = providers[provider_name]

        # Before the cache lookup: the voice is part of what makes the audio,
        # so it has to be part of the key.
        try:
            voice_id = provider.resolve_voice_id(line["speaker"], effective_casting)
        except ProviderError as e:
            logger.error(f"[FAILED] {line['line_id']}: {e}")
            failures.append({"line_id": line["line_id"], "error": str(e)})
            continue

        cache_key = line_hash(line, provider_name, voice_id)
        cached = load_from_cache(cache_key, cache_dir=cache_dir)
        if cached:
            logger.info(f"[cache hit] {line['line_id']} ({line['speaker']})")
            results.append(cached)
            continue

        request = SynthesisRequest(
            text=line["text"],
            character_id=line["speaker"],
            emotion=line["emotion"],
            intensity=line.get("intensity", 0.5),
            language=line["language"],
            pace=line.get("pace", "normal"),
            line_id=line["line_id"],
        )

        try:
            logger.info(
                f"[synthesizing] {line['line_id']} ({line['speaker']}, {line['emotion']}) via {provider_name}"
            )
            result = provider.synthesize(request, voice_id)
            save_to_cache(cache_key, result, cache_dir=cache_dir)
            results.append(result)
        except ProviderError as e:
            logger.error(f"[FAILED] {line['line_id']}: {e}")
            failures.append({"line_id": line["line_id"], "error": str(e)})

    return episode, results, failures
