"""
Stings and buttons — the hits the bed cannot make.

    python -m src.audio.music --story evt_gandhinagar_tribunal --ep 1

`bgm.py` writes one steady mood bed under the whole episode, deliberately mild so
dialogue always sits on top. That is right for ninety per cent of an episode and
wrong for the two or three lines it turns on. This platform's register is built
on those lines: the insult that lands, the promise the narrator makes, the last
sentence before the cut. They need a hit, and a hit is a one-shot, not a loop.

Four cues, set by the director:

    sting    a short hard hit ON the line — a reveal, an insult that lands
    button   the hit that ends the episode, allowed to ring out under the cut
    drop     bed cuts to silence for the line, so it lands in a hole
    swell    bed rises under the line instead of ducking

`drop` and `swell` are the bed's own behaviour and live in `bgm.py`. This module
owns the two that add audio: `sting` and `button`.

Never fatal. No key, a refusal, a rate limit — the episode is still a finished
mix, just a flatter one.
"""

import os
import sys
import json
import hashlib
import pathlib
import argparse
from typing import Any, Dict, List, Optional

from src.util import DATA, log, read_json

STORIES = DATA / "stories"
CACHE = DATA / "cache" / "music"

# Generated, not sourced, for the same reason the beds are: one prompt per cue
# beats a folder of licensed stabs nobody can regenerate.
PROMPTS = {
    "sting": "single sharp dramatic orchestral stab, sudden impact hit, no melody, "
             "cinematic trailer sting, dry, ends abruptly",
    "button": "dramatic rising orchestral swell into a low impact hit, cinematic "
              "episode ending button, tail rings out and fades",
}

SECONDS = {"sting": 2, "button": 5}

# A hit is an accent, not an event. Above the bed, under the voice — loud enough
# to feel in the chest, quiet enough that the line stays intelligible.
LEVEL_DB = {"sting": -13.0, "button": -11.0}

# A sting hits ON the word, which means slightly before the line's first sample:
# an orchestral stab has an attack, and lining up its onset with the syllable
# puts the impact late.
LEAD_MS = 120


def _client() -> Any:
    from elevenlabs.client import ElevenLabs

    return ElevenLabs()


def _generate(cue: str, client: Any) -> pathlib.Path:
    """One hit, cached by its cue. Two cues per season, not per episode."""
    CACHE.mkdir(parents=True, exist_ok=True)
    prompt = PROMPTS[cue]
    path = CACHE / f"{cue}_{hashlib.sha1(prompt.encode('utf-8')).hexdigest()[:10]}.mp3"
    if path.exists():
        return path

    log(f"generating music cue: {cue}")
    audio = client.text_to_sound_effects.convert(
        text=prompt,
        duration_seconds=SECONDS[cue],
        prompt_influence=0.4,
        loop=False,
    )
    with open(path, "wb") as fh:
        for chunk in audio:
            fh.write(chunk)
    return path


def cues_from(manifest: Dict[str, Any], episode: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Where each hit goes, in milliseconds into the finished mix.

    Timing comes from the manifest because that is the record of what was
    actually synthesised; the episode file only says what was asked for. A line
    that failed to synthesise has no timing and cannot carry a hit.
    """
    at = {l["line_id"]: l for l in manifest.get("lines", [])}
    out = []
    for line in episode.get("lines", []):
        cue = (line.get("music_cue") or "").lower()
        if cue not in PROMPTS:
            continue
        timing = at.get(line.get("line_id"))
        if not timing:
            log(f"{line.get('line_id')} has a {cue} but never synthesised", "warn")
            continue
        out.append({"cue": cue, "line_id": line["line_id"],
                    "at_ms": max(0, int(timing["start_ms"]) - LEAD_MS)})
    return out


def apply(story: str, ep: int, stem: Optional[str] = None) -> pathlib.Path:
    """Lay the hits over the finished mix. Returns the path it wrote."""
    from pydub import AudioSegment

    audio_dir = STORIES / story / "audio"
    stem = stem or f"ep{ep:02d}"
    source = next((audio_dir / f"{n}.mp3" for n in
                   (f"{story}_{stem}_sfx", f"{story}_{stem}")
                   if (audio_dir / f"{n}.mp3").exists()), None)
    if source is None:
        raise RuntimeError(f"no mixed episode in {audio_dir} — build the audio first")

    episode = read_json(audio_dir / f"{stem}.json")
    manifest = read_json(audio_dir / f"{story}_{stem}_manifest.json")
    hits = cues_from(manifest, episode)
    if not hits:
        log("no music cues on this episode — the director set none", "warn")
        return source

    track = AudioSegment.from_mp3(source)
    client = _client()
    laid = 0
    for hit in hits:
        clip = AudioSegment.from_mp3(_generate(hit["cue"], client))
        # Level-matched to the track, like the effects: a generated clip's own
        # level is arbitrary and decides nothing about how loud it should be.
        clip = clip.apply_gain(track.dBFS + LEVEL_DB[hit["cue"]] - clip.dBFS)
        clip = clip.fade_out(min(400, len(clip)))
        track = track.overlay(clip, position=min(hit["at_ms"], len(track) - 1))
        laid += 1
        log(f"  {hit['cue']:6} at {hit['at_ms'] / 1000:6.1f}s  ({hit['line_id']})")

    out = audio_dir / f"{source.stem}_music.mp3"
    track.export(out, format="mp3", bitrate="128k")
    log(f"laid {laid} music cue(s) -> {out.name}")
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--story", required=True)
    ap.add_argument("--ep", type=int, default=1)
    args = ap.parse_args()

    from src.util import load_env

    load_env()
    if not os.environ.get("ELEVENLABS_API_KEY"):
        log("ELEVENLABS_API_KEY is not set", "error")
        return 1
    try:
        apply(args.story, args.ep)
    except RuntimeError as exc:
        log(str(exc), "error")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
