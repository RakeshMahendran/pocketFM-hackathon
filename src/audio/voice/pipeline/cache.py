"""
Line-level synthesis cache, keyed on (provider, character, text, emotion,
intensity). Editing one line in an episode and re-running only re-synthesizes
that line — everything else is served from disk. This matters a lot on
free-tier API credits.
"""

import os
import json
import hashlib

from src.audio.voice.providers.base import SynthesisResult

DEFAULT_CACHE_DIR = "data/cache"


def line_hash(line: dict, provider_name: str) -> str:
    key = "|".join([
        provider_name,
        line["speaker"],
        line["text"],
        line["emotion"],
        str(line.get("intensity", "")),
        line.get("pace", "normal"),
    ])
    return hashlib.sha256(key.encode("utf-8")).hexdigest()[:20]


def _index_path(cache_dir: str) -> str:
    return os.path.join(cache_dir, "index.json")


def _load_index(cache_dir: str) -> dict:
    index_path = _index_path(cache_dir)
    if os.path.exists(index_path):
        with open(index_path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def _save_index(index: dict, cache_dir: str) -> None:
    os.makedirs(cache_dir, exist_ok=True)
    with open(_index_path(cache_dir), "w", encoding="utf-8") as f:
        json.dump(index, f, indent=2, ensure_ascii=False)


def load_from_cache(cache_key: str, cache_dir: str = DEFAULT_CACHE_DIR):
    index = _load_index(cache_dir)
    entry = index.get(cache_key)
    if entry and os.path.exists(entry["audio_path"]):
        return SynthesisResult(**entry)
    return None


def save_to_cache(cache_key: str, result: SynthesisResult, cache_dir: str = DEFAULT_CACHE_DIR) -> None:
    index = _load_index(cache_dir)
    index[cache_key] = {
        "audio_path": result.audio_path,
        "duration_ms": result.duration_ms,
        "provider": result.provider,
        "line_id": result.line_id,
        "voice_id": result.voice_id,
        "raw_meta": result.raw_meta,
    }
    _save_index(index, cache_dir)
