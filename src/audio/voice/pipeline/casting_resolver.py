"""
Rule-based voice casting resolver.

Matches each character's persona/gender/accent against a provider's
available voices (VoiceInfo, from provider.list_voices()) and writes the
winner into config/casting.json, ONCE. This file is the only place a
character gets ASSIGNED a voice — every subsequent run just reads that
locked assignment back out of casting.json, which is what makes "the same
character always sounds the same" true by construction rather than
convention (see the plan's consistency design principle).

Rule-based, not LLM-based: both ElevenLabs and Sarvam already expose
structured gender/description metadata, so there's no free-text
understanding problem to solve, and a deterministic scorer is instantly
debuggable ("why did riya get this voice?" -> print the score breakdown).
"""

import os
import re
import json
import logging

from src.audio.voice.providers.base import VoiceInfo

import os as _os
_HERE = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))

logger = logging.getLogger("casting_resolver")

CASTING_PATH = _os.path.join(_HERE, "config", "casting.json")
META_PATH = _os.path.join(_HERE, "config", "casting.meta.json")


def score_voice(character: dict, voice: VoiceInfo) -> float:
    score = 0.0
    char_gender = (character.get("gender") or "").lower()
    # Only score gender when the character has a clear binary preference —
    # rosters are typically labeled male/female only, so a "neutral"/other
    # character shouldn't be penalized against every voice equally (that
    # just makes gender a no-op tie-breaker via persona keywords instead).
    if char_gender in ("male", "female") and voice.gender:
        score += 3 if char_gender == voice.gender.lower() else -5
    if character.get("accent") and voice.accent:
        score += 2 if character["accent"].lower() in voice.accent.lower() else 0
    persona_kw = set(re.findall(r"[a-z]+", character.get("persona", "").lower()))
    voice_kw = set(re.findall(r"[a-z]+", (voice.description + " " + voice.name).lower()))
    score += len(persona_kw & voice_kw)
    return score


def casting_key(character_id: str, series_id: str = None) -> str:
    """Namespace casting entries by series when series_id is present, so two
    unrelated shows with a same-named character (e.g. both have a 'priya')
    don't silently share a cast voice. Falls back to the bare character id
    when no series_id is given (single-series / back-compat)."""
    return f"{series_id}:{character_id}" if series_id else character_id


def _load_json(path: str, default):
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return default


def _save_json(path: str, data: dict) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def cached_voices(provider, cache_dir: str = "data/cache", refresh: bool = False) -> list:
    """list_voices() results cached to disk — cheap for Sarvam (a local file
    read anyway) but avoids repeated live API calls for ElevenLabs."""
    cache_path = os.path.join(cache_dir, f"voices_{provider.name}.json")
    if not refresh and os.path.exists(cache_path):
        with open(cache_path, "r", encoding="utf-8") as f:
            raw = json.load(f)
        return [VoiceInfo(**v) for v in raw]

    voices = provider.list_voices()
    os.makedirs(cache_dir, exist_ok=True)
    with open(cache_path, "w", encoding="utf-8") as f:
        json.dump([v.__dict__ for v in voices], f, indent=2, ensure_ascii=False)
    return voices


def resolve_casting(episode: dict, provider, cache_dir: str = "data/cache",
                     casting_path: str = CASTING_PATH, meta_path: str = META_PATH,
                     force: bool = False, refresh_voices: bool = False) -> list:
    """Fill casting.json gaps for `provider` from episode["characters"].

    - Entry missing or a "REPLACE*" placeholder -> eligible for resolution.
    - Any other non-empty value -> manual override; never touched, even with force.
    - `force` only re-resolves entries this resolver itself wrote previously
      (tracked via casting.meta.json's "source": "auto").

    Returns the list of character ids that were (re-)resolved.
    """
    if not provider.requires_casting:
        return []

    casting = _load_json(casting_path, {})
    meta = _load_json(meta_path, {})
    voices = cached_voices(provider, cache_dir=cache_dir, refresh=refresh_voices)
    if not voices:
        logger.warning(f"No voices available from provider '{provider.name}' — skipping casting resolution.")
        return []

    series_id = episode.get("series_id")
    resolved = []

    # Track voices already spoken-for (manual casting entries plus anything
    # this pass assigns) so two different characters don't end up on the
    # identical voice when an unused alternative is available — distinct
    # characters should sound distinct. Reuse is still allowed as a
    # fallback once every voice is taken (e.g. more characters than voices).
    all_characters = episode.get("characters", [])
    taken_voice_ids = set()
    for character in all_characters:
        existing = casting.get(casting_key(character["id"], series_id), {}).get(provider.name)
        if existing and not existing.startswith("REPLACE"):
            taken_voice_ids.add(existing)

    for character in all_characters:
        char_id = character["id"]
        key = casting_key(char_id, series_id)
        entry = casting.setdefault(key, {})
        existing = entry.get(provider.name)

        is_placeholder = not existing or existing.startswith("REPLACE")
        is_auto_forceable = force and meta.get(key, {}).get(provider.name, {}).get("source") == "auto"
        if not (is_placeholder or is_auto_forceable):
            continue

        available = [v for v in voices if v.voice_id not in taken_voice_ids] or voices
        best = max(available, key=lambda v: (score_voice(character, v), v.voice_id))
        best_score = score_voice(character, best)
        taken_voice_ids.add(best.voice_id)
        entry[provider.name] = best.voice_id
        meta.setdefault(key, {})[provider.name] = {
            "source": "auto",
            "voice_name": best.name,
            "score": best_score,
        }
        resolved.append(char_id)
        logger.info(
            f"[cast] {key} -> {provider.name}:{best.voice_id} "
            f"({best.name}, score={best_score:.1f})"
        )

    _save_json(casting_path, casting)
    _save_json(meta_path, meta)
    return resolved
