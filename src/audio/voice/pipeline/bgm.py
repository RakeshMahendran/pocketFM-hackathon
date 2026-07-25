"""
Generates and mixes a mood-driven, pace/intensity-aware, ducked background
ambience track under the stitched dialogue track.

BGM beds are GENERATED from text prompts via ElevenLabs' Sound Effects API
(a separate API surface from TTS, so it works fine even though Sarvam is
the dialogue provider) and cached to disk like dialogue clips — no
manually-sourced loop files needed. Entirely pydub-native: gain-staged
slicing plus pydub's own crossfade primitive, no custom DSP.

Degrades gracefully: any failure here (missing config, missing API key,
API error) should be caught by the caller (pipeline/audio_post.py), logged
as a warning, and the run should fall back to dialogue-only output — BGM
must never break a run.
"""

import os
import hashlib
import logging

import yaml
from pydub import AudioSegment

from src.audio.voice.pipeline.loudness import normalize_to_target

import os as _os
_HERE = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))

logger = logging.getLogger("bgm")

BGM_MAP_PATH = _os.path.join(_HERE, "config", "bgm_map.yaml")


def load_bgm_config(path: str = BGM_MAP_PATH) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def _lerp(range_pair, t: float) -> float:
    lo, hi = range_pair
    t = max(0.0, min(1.0, t))
    return lo + (hi - lo) * t


def _mood_cfg(mood: str, cfg: dict) -> dict:
    return cfg["moods"].get(mood, cfg["moods"][cfg.get("default_mood", "neutral")])


def _mood_for_line(line: dict, cfg: dict) -> str:
    mood = line.get("bgm_cue") or line.get("emotion") or cfg.get("default_mood", "neutral")
    return mood if mood in cfg["moods"] else cfg.get("default_mood", "neutral")


def _target_gain_db(mood_cfg: dict, pace: str, intensity: float, cfg: dict) -> float:
    base = mood_cfg["base_gain_db"]
    pace_bias = cfg.get("pace_energy_bias_db", {}).get(pace, 0)
    intensity_bias = _lerp(cfg.get("intensity_gain_range_db", [0, 0]), intensity)
    return base + pace_bias + intensity_bias


def _get_or_generate_mood_bed(mood: str, cfg: dict, cache_dir: str) -> AudioSegment:
    bgm_cache_dir = os.path.join(cache_dir, "bgm")
    os.makedirs(bgm_cache_dir, exist_ok=True)
    mood_cfg = _mood_cfg(mood, cfg)
    prompt = mood_cfg["prompt"]

    key = hashlib.sha256(
        f"{cfg.get('model_id')}:{prompt}:{cfg.get('clip_duration_seconds')}".encode("utf-8")
    ).hexdigest()[:16]
    out_path = os.path.join(bgm_cache_dir, f"{mood}_{key}.mp3")
    if os.path.exists(out_path):
        return AudioSegment.from_file(out_path)

    from elevenlabs.client import ElevenLabs

    api_key = os.environ.get("ELEVENLABS_API_KEY")
    if not api_key:
        raise RuntimeError("ELEVENLABS_API_KEY not set — required for BGM generation.")
    client = ElevenLabs(api_key=api_key)

    logger.info(f"[bgm] generating '{mood}' bed: \"{prompt}\"")
    audio_stream = client.text_to_sound_effects.convert(
        text=prompt,
        loop=True,
        duration_seconds=cfg.get("clip_duration_seconds", 22),
        prompt_influence=cfg.get("prompt_influence", 0.3),
        model_id=cfg.get("model_id", "eleven_text_to_sound_v2"),
        # Without an explicit output_format the response isn't a
        # standard-container mp3 ffmpeg can decode (confirmed: "Failed to
        # find two consecutive MPEG audio frames" on the raw stream bytes).
        output_format="mp3_44100_128",
    )
    with open(out_path, "wb") as f:
        for chunk in audio_stream:
            if chunk:
                f.write(chunk)
    return AudioSegment.from_file(out_path)


def _loop_to_length(bed: AudioSegment, length_ms: int, crossfade_ms: int) -> AudioSegment:
    if len(bed) >= length_ms:
        return bed[:length_ms]
    cf = min(crossfade_ms, len(bed) // 2)
    looped = bed
    while len(looped) < length_ms:
        looped = looped.append(bed, crossfade=cf)
    return looped[:length_ms]


def _group_into_blocks(line_timings: list, total_duration_ms: int, cfg: dict) -> list:
    """Group consecutive lines sharing the same mood into cue blocks, so
    emotion-stable stretches don't crossfade needlessly. Each block's end
    absorbs the inter-line silence up to the next block's first line, so
    mood stays coherent right up until the next cue starts."""
    blocks = []
    for line in line_timings:
        mood = _mood_for_line(line, cfg)
        if blocks and blocks[-1]["mood"] == mood:
            blocks[-1]["lines"].append(line)
        else:
            blocks.append({"mood": mood, "lines": [line]})

    cursor = 0
    for i, block in enumerate(blocks):
        block["start_ms"] = cursor
        block["end_ms"] = (
            blocks[i + 1]["lines"][0]["start_ms"] if i + 1 < len(blocks) else total_duration_ms
        )
        cursor = block["end_ms"]
    return blocks


def _apply_line_envelope(bed: AudioSegment, block: dict, mood_cfg: dict, duck_db: float, cfg: dict) -> AudioSegment:
    """Slice `bed` (already looped to this block's length) into gain-staged
    pieces: normal mood/pace/intensity gain during inter-line silence,
    ducked further under each line's actual dialogue span. Concatenated
    directly (`+`, no crossfade) since these slices are contiguous audio
    from the same bed — only the gain differs, not the content, so there's
    no seam to hide."""
    out = AudioSegment.silent(duration=0)
    cursor = 0  # relative to block start
    block_len = len(bed)
    for line in block["lines"]:
        start_rel = max(0, min(block_len, line["start_ms"] - block["start_ms"]))
        end_rel = max(0, min(block_len, line["end_ms"] - block["start_ms"]))
        # target_dbfs values are absolute levels (mirroring how dialogue is
        # loudness-normalized) — must use normalize_to_target, NOT
        # apply_gain(), which adds a delta on top of whatever level the raw
        # generated clip already happens to have and silently compounds
        # into a near-inaudible mix.
        target_dbfs = _target_gain_db(mood_cfg, line.get("pace", "normal"), line.get("intensity", 0.5), cfg)

        if start_rel > cursor:
            out += normalize_to_target(bed[cursor:start_rel], target_dbfs)
        if end_rel > start_rel:
            out += normalize_to_target(bed[start_rel:end_rel], target_dbfs + duck_db)
        cursor = max(cursor, end_rel)

    if cursor < block_len:
        out += normalize_to_target(bed[cursor:block_len], mood_cfg["base_gain_db"])
    return out


def build_bgm_track(line_timings: list, total_duration_ms: int, cache_dir: str = "data/cache") -> AudioSegment:
    """
    line_timings: one dict per synthesized line, each with line_id, emotion,
    intensity, pace, optional bgm_cue, and start_ms/end_ms (its dialogue
    span within the final stitched track).

    Returns an AudioSegment of exactly total_duration_ms, pre-gained and
    ducked, ready to `.overlay()` onto the dialogue track.
    """
    cfg = load_bgm_config()
    crossfade_ms = cfg.get("crossfade_ms", 800)
    duck_db = cfg.get("duck_db", -14)

    blocks = _group_into_blocks(line_timings, total_duration_ms, cfg)

    rendered = []
    for block in blocks:
        block_len = block["end_ms"] - block["start_ms"]
        if block_len <= 0:
            continue
        mood_cfg = _mood_cfg(block["mood"], cfg)
        bed = _get_or_generate_mood_bed(block["mood"], cfg, cache_dir)
        bed = _loop_to_length(bed, block_len, crossfade_ms)
        rendered.append(_apply_line_envelope(bed, block, mood_cfg, duck_db, cfg))

    if not rendered:
        return AudioSegment.silent(duration=total_duration_ms)

    track = rendered[0]
    for seg in rendered[1:]:
        cf = min(crossfade_ms, len(track), len(seg))
        track = track.append(seg, crossfade=cf)

    if len(track) < total_duration_ms:
        track += AudioSegment.silent(duration=total_duration_ms - len(track))
    return track[:total_duration_ms]
