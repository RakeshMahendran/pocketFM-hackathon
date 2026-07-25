"""
The one rule the director must not break.

bulbul:v3 has no emotion parameter — it reads the text and infers the
performance from it. So the director returns the line re-punctuated, and that
text is what gets synthesised. Which means it is now editing the thing the
script and the canon beats are written in, and the only thing standing between
"a stammer" and "a rewrite" is `_rewords`.
"""

from src.audio.director import _rewords


def test_punctuation_is_the_directors_to_change():
    """The whole point: same words, different read."""
    assert not _rewords("Maa?", "Maa…?")
    assert not _rewords("Girls, stay where you are.", "Girls — stay where you are.")
    assert not _rewords("Stop! I am Kaveri. Which murder did he solve?",
                        "Stop! I am Kaveri! Which murder did he solve?")


def test_a_stammer_is_a_performance_not_a_rewrite():
    assert not _rewords("Don't say things like that.",
                        "Don't… don't say things like that.")
    assert not _rewords("I did not die near any canal.",
                        "I did not… I did not die near any canal.")


def test_a_filler_is_allowed():
    """Sarvam's own guidance names these as what makes a read conversational."""
    assert not _rewords("She knows my name.", "Arre… she knows my name.")


def test_casing_is_free():
    assert not _rewords("Stop.", "STOP.")


def test_changing_a_word_is_refused():
    assert _rewords("My daughter is dead.", "My daughter is gone.")


def test_adding_a_phrase_is_refused():
    """The tempting failure: it reads better and it is still not the script."""
    assert _rewords("Quiet.", "Quiet, both of you.")


def test_cutting_a_clause_is_refused():
    assert _rewords("Take my fingerprints. Ask me anything.",
                    "Take my fingerprints.")


def test_reordering_is_refused():
    assert _rewords("I know my father. I know my daughters.",
                    "I know my daughters. I know my father.")
