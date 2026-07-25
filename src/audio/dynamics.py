"""
Put the dynamics back into a finished mix.

The voice pipeline normalises every dialogue clip to one loudness target, which
keeps levels consistent but flattens the intensity each line was directed with.
This re-applies that curve afterwards: the manifest carries every line's start,
end and intensity, so nothing was lost, only levelled.

Loudness range is how much a mix moves. Around 2.5 is a read; 4-6 is a
performance.
"""

import sys
import pathlib
import argparse
from typing import Any, Dict, List

from src.util import DATA, log, read_json

STORIES = DATA / "stories"

# Intensity that plays at unity. Below it a line pulls back, above it leans in.
# 0.55 rather than 0.5 because tagged episodes sit slightly above centre — most
# lines in a drama are doing something.
PIVOT = 0.55

# Half the peak-to-trough swing, in dB. Roughly LRA 4.5 on a dialogue episode.
#
# Deliberately below the ~6 a headphone-listened drama would use: this audience
# is on cheap earphones in traffic, often at 1.5x, and a line 6 dB down is a line
# they lose.
SPREAD_DB = 10.0


def gain_for(intensity: float, spread_db: float = SPREAD_DB) -> float:
    """Linear map from intensity to gain, centred on PIVOT."""
    return max(-spread_db, min(spread_db, (intensity - PIVOT) / PIVOT * spread_db))


def restore(track, lines: List[Dict[str, Any]], spread_db: float = SPREAD_DB):
    """
    Re-gain each line's window in place.

    No fades at the boundaries: the pipeline separates lines with silence, so a
    gain step lands in a gap where nothing is sounding. Fading would dip the
    start of every line instead, which is audible and worse.
    """
    from pydub import AudioSegment

    ordered = sorted((l for l in lines if l.get("end_ms")), key=lambda l: l["start_ms"])
    out = AudioSegment.empty()
    cursor = 0

    for line in ordered:
        start, end = int(line["start_ms"]), int(line["end_ms"])
        if start < cursor or end > len(track):
            continue
        if start > cursor:
            out += track[cursor:start]
        out += track[start:end].apply_gain(gain_for(line.get("intensity", PIVOT), spread_db))
        cursor = end

    out += track[cursor:]
    return out


def apply(story: str, ep: int, spread_db: float = SPREAD_DB) -> pathlib.Path:
    from pydub import AudioSegment

    audio_dir = STORIES / story / "audio"
    manifest = next(audio_dir.glob("*_manifest.json"))
    lines = read_json(manifest)["lines"]

    # Prefer the version with sound effects if it exists.
    source = next((p for p in audio_dir.glob("*_sfx.mp3")), None) or \
        next(p for p in audio_dir.glob("*.mp3") if "_dyn" not in p.name)

    track = restore(AudioSegment.from_mp3(source), lines, spread_db)
    out = audio_dir / f"{source.stem.replace('_sfx', '')}_final.mp3"
    track.export(out, format="mp3", bitrate="128k")

    quiet = [l["line_id"] for l in lines if l.get("intensity", 0) < 0.4]
    loud = [l["line_id"] for l in lines if l.get("intensity", 0) > 0.7]
    log(f"re-gained {len(lines)} lines: {len(quiet)} pulled back, {len(loud)} leaning in")
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--story", required=True)
    ap.add_argument("--ep", type=int, default=1)
    ap.add_argument("--spread", type=float, default=SPREAD_DB,
                    help="half the peak-to-trough swing in dB")
    args = ap.parse_args()
    apply(args.story, args.ep, args.spread)
    return 0


if __name__ == "__main__":
    sys.exit(main())
