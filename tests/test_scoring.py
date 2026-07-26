"""
`check()` and `unmapped_names()` are the only things standing between a
plausible-looking dossier and a season built on one.

The map test is the important one: three of four generated test dossiers keyed
their fictionalization map by role description rather than by name, so the map
covered nobody, and one leaked a real surname into a script.
"""

import json

from src.scoring.run import check, merge_dossier, unmapped_names, _fold_map


def _season(n, statuses=None, hooks=None, payoffs=None):
    statuses = statuses or ([1] + [5] * (n - 2) + [9])
    hooks = hooks or [f"H{i % 4}" for i in range(n)]
    if payoffs is None:
        # A healthy season settles something mid-run as well as at the end —
        # roughly one episode in six.
        payoffs = [None] * n
        payoffs[n // 2] = "a debt is collected"
        payoffs[-1] = "everything settles"
    return [{"ep": i + 1, "turn": "t", "hook_type": hooks[i],
             "ends_on": "a fact", "pays_off": payoffs[i], "status": statuses[i]}
            for i in range(n)]


def _dossier(**over):
    d = {"season": _season(14), "cast": [{"char_id": "nayan"}],
         "people": [{"name": "The accused"}],
         "fictionalization_map": {"The accused": "harshad"}}
    d.update(over)
    return d


def test_a_sound_dossier_passes():
    assert check(_dossier(), 14) == []


def test_a_real_name_with_no_fictional_counterpart_is_caught():
    d = _dossier(people=[{"name": "Nepali Manjhi"}],
                 fictionalization_map={"The rescued labourer": "birju"})

    assert unmapped_names(d) == ["Nepali Manjhi"]


def test_a_map_keyed_by_name_covers_everyone():
    d = _dossier(people=[{"name": "Nepali Manjhi"}],
                 fictionalization_map={"Nepali Manjhi": "birju"})

    assert unmapped_names(d) == []


def test_a_season_that_only_opens_wounds_is_caught():
    """One payoff in fourteen used to pass a rule written to demand about two."""
    d = _dossier(season=_season(14, payoffs=[None] * 13 + ["settles"]))

    assert any("pay anything off" in p for p in check(d, 14))


def test_duplicate_episode_numbers_are_caught():
    season = _season(14)
    season[5]["ep"] = 5
    d = _dossier(season=season)

    assert any("episode numbers" in p for p in check(d, 14))


def test_a_story_that_does_not_resolve_is_caught():
    d = _dossier(season=_season(14, payoffs=[None] * 14))

    assert any("does not resolve" in p for p in check(d, 14))


def test_a_flat_status_curve_is_caught():
    d = _dossier(season=_season(14, statuses=[5] * 14))

    problems = check(d, 14)
    assert any("flat" in p for p in problems)
    assert any("humiliation" in p for p in problems)


def test_folding_a_duplicated_mapping_keeps_the_last_and_does_not_crash():
    folded = _fold_map([{"real": "A", "fictional": "x"},
                        {"real": "A", "fictional": "y"}])

    assert folded == {"A": "y"}


# ---------------------------------------------------------------------------
# THE COMMISSION LIST
# ---------------------------------------------------------------------------

def test_a_new_commission_does_not_erase_the_earlier_ones(tmp_path):
    """
    `write_json(DOSSIERS_PATH, [dossier])` threw the file away on every run.
    `serial.load_dossier` reads it, so scoring a second story left the first with
    no dossier to rewrite from — the state the delivered repo was actually in,
    one entry against seven stories.
    """
    path = tmp_path / "dossiers.json"
    path.write_text(json.dumps([{"event_id": "evt_one", "title": "One"}]),
                    encoding="utf-8")

    merged = merge_dossier({"event_id": "evt_two", "title": "Two"}, path)

    assert [d["event_id"] for d in merged] == ["evt_one", "evt_two"]


def test_re_planning_the_same_event_replaces_it_and_stays_last(tmp_path):
    """
    Newest-last is a contract, not a side effect of appending: `commission.py`
    reads `written[-1]` to learn the `event_id` the planner minted, which it
    cannot know in advance. A second entry for the same event would also make
    `load_dossier` a coin toss between two versions of one story.
    """
    path = tmp_path / "dossiers.json"
    path.write_text(json.dumps([{"event_id": "evt_one", "title": "One"},
                                {"event_id": "evt_two", "title": "Two"}]),
                    encoding="utf-8")

    merged = merge_dossier({"event_id": "evt_one", "title": "One, corrected"}, path)

    assert [d["event_id"] for d in merged] == ["evt_two", "evt_one"]
    assert merged[-1]["title"] == "One, corrected"


def test_the_first_commission_starts_the_list(tmp_path):
    merged = merge_dossier({"event_id": "evt_one"}, tmp_path / "nothing.json")

    assert [d["event_id"] for d in merged] == ["evt_one"]
