"""
Pragmatic gain-based loudness leveling (not true LUFS mastering — that would
need pyloudnorm). Applied to every line clip before stitching so switching
providers mid-episode (or between --provider runs) never produces an
audible volume jump between two vendors' differently-mastered output.
"""

from pydub import AudioSegment

DEFAULT_TARGET_DBFS = -20.0


def normalize_to_target(seg: AudioSegment, target_dbfs: float = DEFAULT_TARGET_DBFS) -> AudioSegment:
    if seg.dBFS == float("-inf"):
        return seg  # silent clip (e.g. mock tone at very low gain) — nothing to normalize
    return seg.apply_gain(target_dbfs - seg.dBFS)
