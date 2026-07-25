"""
Lay spot sound effects into a finished episode.

    python -m src.audio.sfx --story story1_denied_identity --ep 1

The voice pipeline produces dialogue over a mood bed and ignores `sfx_cue`
entirely, so the stamp coming down on the word REJECTED is currently silent.
This reads the cues back out of the episode, generates each one, and lays it at
the line's own start time from the manifest.

Two layers already exist — voices and ambience. This is the third: discrete
sounds at discrete moments, which is most of the difference between an audiobook
and an audio drama.

Effects are GENERATED, not sourced. A library hands you a file ten thousand other
shows already use, and no library contains "ninety people breathing in a
corridor" — our cues are prose, which is exactly what a text-to-audio model
takes as input.
"""

import os
import re
import sys
import json
import hashlib
import pathlib
import argparse
from typing import Any, Dict, List

from src.util import DATA, CACHE, log, read_json

STORIES = DATA / "stories"
SFX_CACHE = CACHE / "sfx"

# A cue lands just before the line it belongs to — sound establishes a place,
# then someone speaks in it. Cutting the effect and the voice on the same frame
# reads as a mistake.
LEAD_MS = 700

# How far a spot effect sits below the dialogue it plays under, in dB.
#
# NOT a raw gain offset. Generated clips arrive at wildly different levels, so
# applying a fixed -14 dB to all of them put three effects into the opening and
# measurably *lowered* the level there — they were inaudible. Each effect is
# normalised to the track's own average first, then offset by this.
#
# A stamp landing on the word REJECTED should be heard clearly. Under the voice,
# not under the carpet.
DUCK_DB = -6.0

SECONDS = 3

# Measured off a professionally produced Indian audio drama with the same tool,
# so these are matched targets rather than guessed ones. -1.0 dBTP is also the
# EBU R128 / Apple ceiling: above it, lossy decoding overshoots and clips on a
# phone.
TARGET_LUFS = -17.0
TARGET_TP = -1.0

# Silence is written as an SFX line in our scripts — "SFX: Nothing. Long." —
# and generating a sound for it would invert the writer's intent.
SILENCE = re.compile(r"^\s*(nothing|silence)\b", re.IGNORECASE)

# Direction, not sound. No model renders "too slow to matter", and leaving it in
# the prompt pulls the generation toward something vague.
UNRENDERABLE = re.compile(
    r"\b(too slow to matter|the way a \w+ does|as if|somehow|that is the thing about it)\b",
    re.IGNORECASE)

# A sound ending is the absence of a sound. Generating "the tapping stops"
# produces tapping — the exact opposite of what the line asks for. These are
# handled by cutting, not by adding.
CESSATION = re.compile(r"\b(stops?|stopping|ceases?|going quiet|falls? silent|dies away)\b",
                       re.IGNORECASE)

# Written on the page, not heard in the room: colour, text, what a thing says.
# "REJECTED, in violet, across her study certificate" is the stamp's imprint,
# and the stamp itself is already its own cue.
VISUAL_ONLY = re.compile(r"\b(in (violet|red|blue|black) ink|in violet|[A-Z]{4,},)\b")


def split_cues(prose: str) -> List[str]:
    """
    One SFX line is often three effects.

        "A ceiling fan turning too slow to matter. Ninety people breathing in a
         corridor. A rubber stamp coming down, twice, on wood."

    Written for a human to read; generated one sound at a time.
    """
    out = []
    for part in re.split(r"(?<=[.!?])\s+", prose.strip()):
        part = UNRENDERABLE.sub("", part).strip(" .,")
        if not part or SILENCE.match(part):
            continue
        if CESSATION.search(part) or VISUAL_ONLY.search(part):
            continue
        # Strip a leading article so the prompt starts on the sound itself.
        part = re.sub(r"^(a|an|the)\s+", "", part, flags=re.IGNORECASE)
        if len(part.split()) >= 2:
            out.append(part)
    return out


def _generate(cue: str, client: Any) -> pathlib.Path:
    """One effect, cached by its text. The same stamp across a season costs once."""
    SFX_CACHE.mkdir(parents=True, exist_ok=True)
    path = SFX_CACHE / f"{hashlib.sha1(cue.encode('utf-8')).hexdigest()[:12]}.mp3"
    if path.exists():
        return path

    log(f"generating sfx: \"{cue}\"")
    audio = client.text_to_sound_effects.convert(
        text=cue,
        duration_seconds=SECONDS,
        prompt_influence=0.45,   # higher than the beds: we want the literal sound
        loop=False,
    )
    with open(path, "wb") as fh:
        for chunk in audio:
            fh.write(chunk)
    return path


def apply(story: str, ep: int, duck_db: float = DUCK_DB) -> pathlib.Path:
    from pydub import AudioSegment
    from elevenlabs.client import ElevenLabs

    audio_dir = STORIES / story / "audio"
    episode = read_json(audio_dir / f"ep{ep:02d}.json")
    manifest = next(audio_dir.glob("*_manifest.json"))
    timings = {l["line_id"]: l for l in read_json(manifest)["lines"]}

    source = next(p for p in audio_dir.glob("*.mp3") if "_sfx" not in p.name)
    track = AudioSegment.from_mp3(source)

    client = ElevenLabs(api_key=os.environ["ELEVENLABS_API_KEY"])
    laid, skipped = 0, 0

    for line in episode["lines"]:
        cue_text = line.get("sfx_cue")
        if not cue_text:
            continue
        timing = timings.get(line["line_id"])
        if not timing:
            continue

        cues = split_cues(cue_text)
        if not cues:
            skipped += 1
            continue

        at = max(0, timing["start_ms"] - LEAD_MS)
        for i, cue in enumerate(cues):
            effect = AudioSegment.from_mp3(_generate(cue, client))
            # Normalise to the track, then duck. Without this the effect's own
            # arbitrary level decides whether it is heard at all.
            effect = effect.apply_gain(track.dBFS + duck_db - effect.dBFS)
            effect = effect.fade_in(40).fade_out(180)
            # Stagger stacked effects so three sounds in one cue read as a place
            # rather than a collision.
            track = track.overlay(effect, position=min(at + i * 400, len(track) - 1))
            laid += 1

    # Re-impose the dynamic curve the pipeline levelled away, before mastering —
    # the limiter should see the mix as it is meant to sound.
    from src.audio.dynamics import restore
    track = restore(track, list(timings.values()))

    out = audio_dir / f"{source.stem}_sfx.mp3"
    raw = audio_dir / f".{source.stem}_premaster.mp3"
    track.export(raw, format="mp3", bitrate="128k")
    _master(raw, out)
    raw.unlink(missing_ok=True)

    log(f"laid {laid} effects, skipped {skipped} unrenderable cues -> {out.name}")
    return out


def _master(src: pathlib.Path, dest: pathlib.Path) -> None:
    """
    Final loudness pass, two-pass and linear.

    Overlaying effects onto a mix that already peaked near full scale pushed true
    peak to +2.39 dBTP — clipping, audible as crackle on a phone. So a limiter is
    needed. But single-pass `loudnorm` applies ADAPTIVE gain, which compressed the
    dynamics restored a moment earlier and put loudness range straight back where
    it started.

    Measuring first and then applying `linear=true` moves the whole mix by one
    static gain instead: level fixed, peak capped, dynamics untouched. This is
    also how the reference was almost certainly made.

    Targets are measured off a professionally produced Indian audio drama with
    the same tool. -1.0 dBTP is the EBU R128 / Apple ceiling.
    """
    import json as _json
    import subprocess

    measure = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", "-i", str(src),
         "-af", f"loudnorm=I={TARGET_LUFS}:TP={TARGET_TP}:LRA=7:print_format=json",
         "-f", "null", "-"],
        capture_output=True, text=True)

    blob = measure.stderr[measure.stderr.rfind("{"):measure.stderr.rfind("}") + 1]
    try:
        m = _json.loads(blob)
    except ValueError:
        raise RuntimeError("could not measure the mix before mastering")

    second = (f"loudnorm=I={TARGET_LUFS}:TP={TARGET_TP}:LRA=7:linear=true"
              f":measured_I={m['input_i']}:measured_LRA={m['input_lra']}"
              f":measured_TP={m['input_tp']}:measured_thresh={m['input_thresh']}"
              f":offset={m['target_offset']}")

    result = subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(src),
         "-af", second, "-b:a", "128k", str(dest)],
        capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"mastering failed: {result.stderr[:200]}")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--story", required=True)
    ap.add_argument("--ep", type=int, default=1)
    ap.add_argument("--duck", type=float, default=DUCK_DB, help="dB below dialogue")
    args = ap.parse_args()

    if not os.environ.get("ELEVENLABS_API_KEY"):
        log("ELEVENLABS_API_KEY is not set", "error")
        return 1
    apply(args.story, args.ep, args.duck)
    return 0


if __name__ == "__main__":
    sys.exit(main())
