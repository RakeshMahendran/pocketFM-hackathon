"""
Stitches per-line clips into a single episode audio file, applies loudness
normalization so switching providers never causes an audible volume jump,
optionally layers generated background ambience, and writes a manifest
mapping each line to its timing plus the synthesis metadata that produced
it (provider, voice_id, emotion...) — useful later for subtitles, targeted
re-edits, QA, or swapping a single line without touching the rest.
"""

import os
import json
import logging

from pydub import AudioSegment

from src.audio.voice.pipeline.loudness import normalize_to_target

logger = logging.getLogger("audio_post")


def build_episode(episode: dict, results: list, output_dir: str = "data/output",
                   inter_line_silence_ms: int = 200, cache_dir: str = "data/cache",
                   target_dbfs: float = -20.0, bgm_enabled: bool = False):
    os.makedirs(output_dir, exist_ok=True)
    episode_id = episode["episode_id"]
    lines_by_id = {l["line_id"]: l for l in episode["lines"]}

    combined = AudioSegment.empty()
    manifest_lines = []
    line_timings = []  # emotion/pace/intensity + timing per line, for BGM
    cursor_ms = 0

    for r in results:
        clip = AudioSegment.from_file(r.audio_path)
        clip = normalize_to_target(clip, target_dbfs)

        line = lines_by_id.get(r.line_id, {})
        # Per-line pause when the script specifies one (e.g. a longer beat
        # after a big emotional moment, a quick clip during a rapid
        # exchange), falling back to the global default. This gap is what
        # gets filled with BGM ambience — the BGM track spans the full
        # timeline including gaps, so a real pause is what makes ambience
        # audible between lines rather than a near-instant blip.
        pause_ms = line.get("pause_after_ms", inter_line_silence_ms)
        silence = AudioSegment.silent(duration=pause_ms)
        combined += clip + silence

        start_ms = cursor_ms
        end_ms = cursor_ms + len(clip)

        manifest_lines.append({
            "line_id": r.line_id,
            "speaker": line.get("speaker", ""),
            "provider": r.provider,
            "voice_id": r.voice_id,
            "emotion": line.get("emotion", ""),
            "intensity": line.get("intensity"),
            "language": line.get("language", ""),
            "pace": line.get("pace", "normal"),
            "start_ms": start_ms,
            "end_ms": end_ms,
            "audio_path": r.audio_path,
            "bgm_cue": line.get("bgm_cue") or line.get("emotion", ""),
        })
        line_timings.append({
            "line_id": r.line_id,
            "emotion": line.get("emotion", "neutral"),
            "intensity": line.get("intensity", 0.5),
            "pace": line.get("pace", "normal"),
            "bgm_cue": line.get("bgm_cue"),
            # `sting` and `button` are laid over the finished mix by
            # src/audio/music.py; `drop` and `swell` are read here, because
            # they change the bed itself rather than adding to it.
            "music_cue": line.get("music_cue"),
            "start_ms": start_ms,
            "end_ms": end_ms,
        })
        cursor_ms = end_ms + pause_ms

    manifest = {
        "episode_id": episode_id,
        "title": episode.get("title", ""),
        "providers_used": sorted({l["provider"] for l in manifest_lines}),
        "lines": manifest_lines,
    }

    if bgm_enabled:
        try:
            from src.audio.voice.pipeline.bgm import build_bgm_track
            bgm_track = build_bgm_track(line_timings, len(combined), cache_dir=cache_dir)
            combined = combined.overlay(bgm_track)
            manifest["bgm"] = {
                "enabled": True,
                "moods_used": sorted({l.get("bgm_cue") or l["emotion"] for l in line_timings}),
            }
            logger.info("[bgm] background ambience mixed in")
        except Exception as e:  # noqa: BLE001 - BGM must never break a run
            detail = getattr(e, "body", None) or str(e)
            logger.warning(f"[bgm] skipped due to error: {detail}")
            manifest["bgm"] = {"enabled": False, "error": str(detail)[:300]}

    out_path = os.path.join(output_dir, f"{episode_id}.mp3")
    combined.export(out_path, format="mp3")

    manifest_path = os.path.join(output_dir, f"{episode_id}_manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)

    return out_path, manifest_path, len(combined)
