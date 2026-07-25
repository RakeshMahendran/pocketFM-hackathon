"""
The command surface.

Registering a command takes three coordinated edits — a `cmd_*` function, an entry
in `COMMANDS`, and a branch in `build_parser`. Three places is two too many to keep
in your head at hour ten, so the first test here just walks all of them.
"""

import tasks
from src.canon import store


def test_every_registered_command_can_be_parsed():
    """Catches "added to the dict, forgot the elif", which is what a three-place
    registration invites."""
    parser = tasks.build_parser()

    for name in tasks.COMMANDS:
        argv = [name]
        if name in ("serial", "commission"):
            argv += ["--event", "e"]
        if name in ("promote", "spinoff"):
            argv += ["--char", "c"]
        parsed = parser.parse_args(argv)
        assert parsed.command == name


def test_every_story_scoped_command_accepts_a_story():
    parser = tasks.build_parser()

    for name in tasks.STORY_COMMANDS:
        argv = [name, "--story", "s"]
        if name in ("promote", "spinoff"):
            argv += ["--char", "c"]
        assert parser.parse_args(argv).story == "s"


def test_every_anchor_scoped_command_accepts_an_anchor():
    parser = tasks.build_parser()

    for name in tasks.ANCHOR_COMMANDS:
        argv = [name, "--anchor", "b001"]
        if name == "spinoff":
            argv += ["--char", "c"]
        assert parser.parse_args(argv).anchor == "b001"


def test_the_runner_and_the_store_agree_on_the_golden_path():
    """
    tasks.py holds these as literals so it keeps working when a module is missing —
    that is what owner_of() is for — which means nothing but a test stops them
    drifting apart.
    """
    assert tasks.DEFAULT_STORY == store.DEFAULT_STORY
    assert tasks.DEFAULT_CHAR == store.DEFAULT_CHAR


def test_the_default_character_exists_in_the_default_story():
    """Catches the old `jignesh` default, who lives in a hand-written fixture from
    a different world and in none of the delivered stories."""
    if tasks.DEFAULT_STORY not in store.story_ids():
        return
    story = store.load_story(tasks.DEFAULT_STORY)

    assert tasks.DEFAULT_CHAR in story["cast_index"]


def test_the_demo_character_has_the_counts_the_plan_promises():
    """The real data, not a fixture. If this moves, the demo script is wrong."""
    if tasks.DEFAULT_STORY not in store.story_ids():
        return
    from src.canon import views
    story = store.load_story(tasks.DEFAULT_STORY)

    assert len(story["beats"]) == 46
    assert len(views.knows(story, "ratnamma")) == 11
    assert len(views.blind(story, "ratnamma")) == 35
    assert [a["kind"] for a in views.anchors(story, "ratnamma")] == \
        ["offscreen", "witnessed", "offscreen"]


def test_every_delivered_story_builds_a_view_for_every_promotable_character():
    """
    The sweep that finds the data problems. Two characters in the delivered set are
    dead before episode one and have no lines at all — they must fail loudly rather
    than yield an empty voice block, and they must not be promotable.
    """
    from src.canon import views
    for story_id in store.story_ids():
        story = store.load_story(story_id)
        for row in views.promotable(story):
            if not row["promotable"]:
                continue
            view = views.character_view(story, row["char_id"])
            assert view["voice_samples"], f"{story_id}/{row['char_id']} has no voice"
            assert len(view["knows"]) + len(view["blind"]) == len(story["beats"])
