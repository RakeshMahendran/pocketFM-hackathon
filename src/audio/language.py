"""
Which language a story is written and voiced in.

Selectable per story, and per line inside it. A bureaucrat quotes the rule in
English while the mother pleads in Hindi, in the same scene — that is how the
catalogue actually sounds, and both the writer prompt and the TTS schema carry
`language` per line for exactly that reason.
"""

import os
from typing import Dict

# What the voice pipeline's episode schema accepts. Not every language Sarvam
# supports: `bulbul:v3` also does Kannada, Telugu, Malayalam, Marathi, Gujarati,
# Punjabi, Bengali and Odia, but the episode schema enumerates only these five,
# so anything else needs a schema change upstream first.
MODES: Dict[str, str] = {
    "en": "English throughout. Indian English — the rhythm and idiom of the "
          "place, not translated Hindi.",
    "hi-en": "Hinglish. Hindi as the spoken base, English where English is what "
             "would actually be said.",
}

LINE_LANGUAGES = ("hi", "en", "hi-en", "ta", "ta-en")

DEFAULT = "en"


def mode() -> str:
    """Story-level default. Individual lines may still differ."""
    chosen = os.environ.get("CANONFORGE_LANGUAGE", DEFAULT)
    if chosen not in MODES:
        raise RuntimeError(
            f"CANONFORGE_LANGUAGE={chosen!r} is not a mode. Choose one of: "
            f"{', '.join(MODES)}"
        )
    return chosen


def describe(chosen: str) -> str:
    return MODES[chosen]
