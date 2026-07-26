"""
Lay spot sound effects into a finished episode, then master it.

    python -m src.audio.sfx --story story1_denied_identity --ep 1

The voice pipeline gives dialogue over a mood bed and ignores `sfx_cue`. This is
the third layer: discrete sounds at discrete moments, read from the cues and laid
at each line's start time from the manifest.

Effects are generated, not sourced. No library contains "ninety people breathing
in a corridor", and the cues are prose — which is what a text-to-audio model
takes as input.
"""

import os
import re
import sys
import json
import hashlib
import pathlib
import argparse
from typing import Any, Dict, List, Optional

from src.util import DATA, CACHE, log, read_json

STORIES = DATA / "stories"
SFX_CACHE = CACHE / "sfx"

# A cue lands just before the line it belongs to — sound establishes a place,
# then someone speaks in it. Cutting the effect and the voice on the same frame
# reads as a mistake.
LEAD_MS = 700

# How far a spot effect sits below the dialogue, in dB. Not a raw offset:
# generated clips arrive at wildly different levels, so each is normalised to the
# track's own average first and then ducked by this.
DUCK_DB = -6.0

SECONDS = 3

# Measured off a professionally produced Indian audio drama with the same tool,
# so these are matched targets rather than guessed ones. -1.0 dBTP is also the
# EBU R128 / Apple ceiling: above it, lossy decoding overshoots and clips on a
# phone.
TARGET_LUFS = -17.0
TARGET_TP = -1.0

# Where the limiter starts, not where it ends. `_master` measures the encoded
# file and gives back whatever the overshoot actually was, so this only decides
# how often a second pass is needed.
TP_OVERSHOOT_DB = 0.5

# Each pass is one encode plus one measure — a few seconds. Two corrections is
# more than enough; a mix still hot after that has something else wrong with it.
MASTER_ATTEMPTS = 3

# How far over the ceiling still counts as on it. EBU R128 is a broadcast spec,
# not a physical limit, and nothing on earth can hear a twentieth of a decibel.
TP_TOLERANCE_DB = 0.1

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


def apply(story: str, ep: int, duck_db: float = DUCK_DB,
          stem: str = None) -> pathlib.Path:
    from pydub import AudioSegment
    from elevenlabs.client import ElevenLabs

    stem = stem or f"ep{ep:02d}"
    audio_dir = STORIES / story / "audio"
    episode = read_json(audio_dir / f"{stem}.json")

    # The manifest and mp3 the pipeline just wrote for THIS cut. A language
    # variant sits beside the original, so picking "the first mp3" would mix the
    # Hinglish cues into the English take.
    episode_id = episode["episode_id"]
    manifest = audio_dir / f"{episode_id}_manifest.json"
    timings = {l["line_id"]: l for l in read_json(manifest)["lines"]}

    source = audio_dir / f"{episode_id}.mp3"
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
    Final loudness pass: measure, then apply one static gain, then limit.

    Single-pass `loudnorm` applies adaptive gain, which compresses the dynamics
    restored a moment earlier. Measuring first and applying `linear=true` moves
    the whole mix by one
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

    # `linear=true` moves the mix by one static gain, keeping the dynamics — but
    # a static gain cannot enforce a ceiling, so alimiter provides it. It engages
    # only on peaks that would breach, leaving everything below untouched.
    #
    # alimiter caps the SAMPLE peak of the pre-encode signal. What the ceiling is
    # specified against is the TRUE peak of the mp3, and lossy encoding
    # reconstructs peaks above the samples it was given. The gap is not a
    # constant: it was 0.56 dB on a sparse mix and 1.33 dB on a dense one, so a
    # fitted number passes the file it was fitted to and fails the next.
    # Measure the encode and give back exactly what it took.
    headroom = TP_OVERSHOOT_DB
    for attempt in range(1, MASTER_ATTEMPTS + 1):
        second = (f"loudnorm=I={TARGET_LUFS}:TP={TARGET_TP}:LRA=7:linear=true"
                  f":measured_I={m['input_i']}:measured_LRA={m['input_lra']}"
                  f":measured_TP={m['input_tp']}:measured_thresh={m['input_thresh']}"
                  f":offset={m['target_offset']}"
                  f",alimiter=limit={10 ** ((TARGET_TP - headroom) / 20):.4f}"
                  f":level=disabled")

        result = subprocess.run(
            ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(src),
             "-af", second, "-b:a", "128k", str(dest)],
            capture_output=True, text=True)
        if result.returncode != 0:
            raise RuntimeError(f"mastering failed: {result.stderr[:200]}")

        peak = _true_peak(dest)
        # Tolerance, because loudnorm reports to two decimals and a -0.99 against
        # a -1.0 target is a rounding artefact, not a breach. Without it the loop
        # re-encodes twice and reports failure over one hundredth of a decibel.
        if peak is None or peak <= TARGET_TP + TP_TOLERANCE_DB:
            return
        headroom += peak - TARGET_TP
        log(f"master: {peak:+.2f} dBTP is over the {TARGET_TP:+.1f} ceiling — "
            f"retrying with {headroom:.2f} dB headroom", "warn")

    log(f"master: still above {TARGET_TP:+.1f} dBTP after {MASTER_ATTEMPTS} "
        f"passes — shipping hot", "error")


def _true_peak(path: pathlib.Path) -> Optional[float]:
    """Measured true peak of a finished file, or None if it cannot be read."""
    import json as _json
    import subprocess

    out = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", "-i", str(path),
         "-af", "loudnorm=print_format=json", "-f", "null", "-"],
        capture_output=True, text=True).stderr
    try:
        return float(_json.loads(out[out.rfind("{"):out.rfind("}") + 1])["input_tp"])
    except (ValueError, KeyError):
        return None


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
