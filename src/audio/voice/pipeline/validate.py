"""
Pre-flight checks, run before a single API call is made. Catches:
  - malformed episode.json (schema)
  - characters missing a voice mapping for the active provider
  - emotions used in the script that aren't in the active provider's map

Fail loud and early — an episode with 40 lines shouldn't burn 39 API
calls before discovering line 40 has no cast voice.
"""

import json
import yaml
import jsonschema

from src.audio.voice.pipeline.casting_resolver import casting_key

import os as _os
_HERE = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))

SCHEMA_PATH = _os.path.join(_HERE, "schemas", "episode_schema.json")
CASTING_PATH = _os.path.join(_HERE, "config", "casting.json")
EMOTION_MAP_PATH = _os.path.join(_HERE, "config", "emotion_map.yaml")


class ValidationError(Exception):
    pass


def validate_episode(episode: dict) -> None:
    with open(SCHEMA_PATH, "r", encoding="utf-8") as f:
        schema = json.load(f)
    try:
        jsonschema.validate(instance=episode, schema=schema)
    except jsonschema.ValidationError as e:
        raise ValidationError(f"episode.json failed schema validation: {e.message}") from e

    # line_id uniqueness — not expressible cleanly in draft-07 without $data
    seen = set()
    for line in episode["lines"]:
        if line["line_id"] in seen:
            raise ValidationError(f"Duplicate line_id '{line['line_id']}' in episode.")
        seen.add(line["line_id"])

    speakers = {c["id"] for c in episode["characters"]}
    for line in episode["lines"]:
        if line["speaker"] not in speakers:
            raise ValidationError(
                f"Line '{line['line_id']}' has speaker '{line['speaker']}' "
                f"not declared in the characters list."
            )


def validate_provider_coverage(episode: dict, provider, provider_name: str,
                                characters: set = None, emotions: set = None) -> None:
    """Checks casting + emotion-map coverage for `provider`. When `characters`/
    `emotions` are given, the check is scoped to just those (so a provider only
    used for a subset of lines, via a per-line override, isn't required to
    have every character in the whole episode cast). Defaults to the full
    episode when omitted."""
    if not provider.requires_casting:
        return

    with open(CASTING_PATH, "r", encoding="utf-8") as f:
        casting = json.load(f)
    with open(EMOTION_MAP_PATH, "r", encoding="utf-8") as f:
        emotion_map = yaml.safe_load(f).get(provider_name, {})

    all_characters = episode["characters"]
    series_id = episode.get("series_id")
    # casting.json entries may be series-namespaced (see casting_resolver.casting_key)
    # — remap back to bare character ids so provider.validate_casting() can stay
    # a simple lookup, unaware of series scoping.
    effective_casting = {
        c["id"]: casting.get(casting_key(c["id"], series_id)) or casting.get(c["id"], {})
        for c in all_characters
    }
    relevant_characters = (
        [c for c in all_characters if c["id"] in characters] if characters is not None else all_characters
    )

    missing_casting = provider.validate_casting(relevant_characters, effective_casting)
    if missing_casting:
        raise ValidationError(
            f"Characters missing a '{provider_name}' voice in config/casting.json: "
            f"{missing_casting}"
        )

    used_emotions = emotions if emotions is not None else {line["emotion"] for line in episode["lines"]}
    missing_emotions = used_emotions - set(emotion_map.keys())
    if missing_emotions:
        raise ValidationError(
            f"Emotions used in the script but missing from config/emotion_map.yaml "
            f"under '{provider_name}': {missing_emotions}"
        )
