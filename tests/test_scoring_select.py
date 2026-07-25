"""
The scout ranks; the editor commissions. Expanding the winner unconditionally
left an editor who disliked the pick with nothing to do but rerun the hunt.

Clearance is the exception: taste is advisory, legal is binding, so a `blocked`
candidate is refused no matter who chose it.
"""

import json

import pytest

from src.scoring.run import select


def corpus(tmp_path, items):
    path = tmp_path / "corpus.json"
    path.write_text(json.dumps({"items": items}), encoding="utf-8")
    return path


def item(id_, title, winner=False, clearance="fictionalize_first"):
    return {"id": id_, "title": title, "winner": winner,
            "clearance": {"status": clearance, "reasons": []}}


THREE = [
    item("aaa111", "The Station on the First Floor", winner=True),
    item("bbb222", "The Branch That Appeared Overnight"),
    item("ccc333", "Two Names, One Body"),
]


def test_defaults_to_the_scouts_pick(tmp_path):
    assert select(corpus(tmp_path, THREE))["id"] == "aaa111"


def test_editor_can_commission_a_loser_by_id(tmp_path):
    assert select(corpus(tmp_path, THREE), ref="ccc333")["title"] == "Two Names, One Body"


def test_editor_can_commission_by_title_fragment(tmp_path):
    chosen = select(corpus(tmp_path, THREE), ref="branch that appeared")
    assert chosen["id"] == "bbb222"


def test_blocked_is_refused_even_when_it_is_the_winner(tmp_path):
    items = [item("aaa111", "Untouchable", winner=True, clearance="blocked")]
    with pytest.raises(RuntimeError, match="blocked"):
        select(corpus(tmp_path, items))


def test_blocked_is_refused_when_an_editor_picks_it(tmp_path):
    items = THREE + [item("ddd444", "Untouchable", clearance="blocked")]
    with pytest.raises(RuntimeError, match="blocked"):
        select(corpus(tmp_path, items), ref="ddd444")


def test_unknown_ref_lists_what_is_available(tmp_path):
    with pytest.raises(RuntimeError) as exc:
        select(corpus(tmp_path, THREE), ref="nothing like this")
    # The error is the only place an editor learns the ids, so it must carry them.
    assert "aaa111" in str(exc.value)
    assert "Two Names, One Body" in str(exc.value)


def test_ambiguous_ref_refuses_rather_than_guessing(tmp_path):
    items = [item("aaa111", "The Long Con", winner=True),
             item("bbb222", "The Long Deception")]
    with pytest.raises(RuntimeError, match="matches 2"):
        select(corpus(tmp_path, items), ref="the long")


def test_empty_corpus_is_not_an_empty_result(tmp_path):
    with pytest.raises(RuntimeError, match="empty"):
        select(corpus(tmp_path, []))


def test_missing_corpus_says_how_to_build_one(tmp_path):
    with pytest.raises(RuntimeError, match="tasks.py corpus"):
        select(tmp_path / "absent.json")


def test_corpus_without_a_winner_is_an_error_not_a_silent_first_item(tmp_path):
    items = [item("aaa111", "One"), item("bbb222", "Two")]
    with pytest.raises(RuntimeError, match="no winner"):
        select(corpus(tmp_path, items))
