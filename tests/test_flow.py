"""
The chain runner.

Nothing here calls a model. What is being tested is the seam between flow and the
stages it drives — which is where it broke: each stage runner invoked another
module's `main()` with no argv, so argparse read *flow's* command line and the run
died on `--story`, an option the serial writer has never heard of. It failed as
`SystemExit`, a BaseException, so the handler that tells an operator the command
is safe to repeat never ran either.
"""

import json

import pytest

from src import flow


def _story_dir(tmp_path, story="story_test", event_id="evt_test_1999"):
    d = tmp_path / story
    (d / "episodes").mkdir(parents=True)
    (d / "dossier.json").write_text(json.dumps({"event_id": event_id}),
                                    encoding="utf-8")
    (d / "beats.json").write_text(json.dumps({"beats": []}), encoding="utf-8")
    (d / "episodes" / "ep01.md").write_text("# Episode 1\n", encoding="utf-8")
    return d


# ---------------------------------------------------------------------------
# ARGV
# ---------------------------------------------------------------------------

def test_the_season_stage_passes_its_own_argv_and_never_reads_flows(
    tmp_path, monkeypatch
):
    """
    `python -m src.flow --story x --ep 1 --force season` used to die with
    "tasks.py serial: error: the following arguments are required: --event",
    because `serial.main()` with no argv falls through to `sys.argv`.
    """
    monkeypatch.setattr(flow, "STORIES", tmp_path)
    monkeypatch.setattr(flow, "CORPUS_PATH", tmp_path / "corpus.json")
    (tmp_path / "corpus.json").write_text("[]", encoding="utf-8")
    _story_dir(tmp_path)
    monkeypatch.setattr("sys.argv",
                        ["flow", "--story", "story_test", "--ep", "1",
                         "--force", "season"])

    seen = {}

    def fake_main(argv=None):
        seen["argv"] = argv
        return 0

    monkeypatch.setattr("src.generation.serial.main", fake_main)

    stages = {s.name: s for s in flow._plan("story_test", 1, None, ["season"])}
    stages["season"].run()

    assert seen["argv"] == ["--event", "evt_test_1999", "--story", "story_test"]


def test_the_dossier_stage_passes_an_empty_argv_not_flows(tmp_path, monkeypatch):
    """Every option the planner takes is optional and the default is the scout's
    pick, so `[]` is right — but it has to be passed, not left to `sys.argv`."""
    monkeypatch.setattr(flow, "STORIES", tmp_path)
    monkeypatch.setattr("sys.argv", ["flow", "--story", "story_test", "--ep", "1"])

    seen = {}

    def fake_main(argv=None):
        seen["argv"] = argv
        return 0

    monkeypatch.setattr("src.scoring.run.main", fake_main)

    stages = {s.name: s for s in flow._plan("story_test", 1, None, ["dossier"])}
    stages["dossier"].run()

    assert seen["argv"] == []


def test_an_audio_variant_language_is_not_handed_to_the_serial_writer(
    tmp_path, monkeypatch
):
    """
    flow's `--language` names an audio *variant* — a Tamil dub of the same
    episode. The serial writer's names the register a season is written in and
    accepts only en / hi-en. Forwarding one to the other turns a dub request into
    an argparse exit.
    """
    monkeypatch.setattr(flow, "STORIES", tmp_path)
    _story_dir(tmp_path)

    seen = {}

    def fake_main(argv=None):
        seen["argv"] = argv
        return 0

    monkeypatch.setattr("src.generation.serial.main", fake_main)

    stages = {s.name: s for s in flow._plan("story_test", 1, "ta", ["season"])}
    stages["season"].run()

    assert "--language" not in seen["argv"]


def test_the_argv_flow_builds_is_one_the_serial_parser_accepts(tmp_path, monkeypatch):
    """
    The other half of the same bug, through the real parser. The stub tests above
    prove flow passes *an* argv; this proves it is a valid one, and that flow's
    own `--story`/`--ep` never reach a parser that would exit on them.
    """
    from src.generation import serial

    monkeypatch.setattr(flow, "STORIES", tmp_path)
    _story_dir(tmp_path)
    monkeypatch.setattr("sys.argv",
                        ["flow", "--story", "story_test", "--ep", "1",
                         "--force", "season"])

    produced = {}
    monkeypatch.setattr(serial, "produce",
                        lambda *a, **k: produced.update(args=a, kwargs=k))

    stages = {s.name: s for s in flow._plan("story_test", 1, None, ["season"])}
    stages["season"].run()  # no SystemExit

    assert produced["args"][0] == "evt_test_1999"


# ---------------------------------------------------------------------------
# THE EVENT ID
# ---------------------------------------------------------------------------

def test_the_event_id_comes_from_the_dossier_beside_the_season(tmp_path):
    """Not from the story id: the planner mints its own, and a story directory is
    named by whoever commissioned it."""
    d = _story_dir(tmp_path, story="the_century_hitters", event_id="evt_molipur_2022")

    assert flow.event_id_for(d) == "evt_molipur_2022"


def test_a_story_with_no_dossier_yet_takes_the_one_just_planned(tmp_path, monkeypatch):
    """First run on an empty repo: the dossier stage has just written the list and
    nothing has been persisted beside a season yet."""
    monkeypatch.setattr(flow, "DOSSIERS_PATH", tmp_path / "dossiers.json")
    (tmp_path / "dossiers.json").write_text(
        json.dumps([{"event_id": "evt_old"}, {"event_id": "evt_just_planned"}]),
        encoding="utf-8")

    assert flow.event_id_for(tmp_path / "unwritten") == "evt_just_planned"


def test_no_dossier_anywhere_says_so_rather_than_indexing_off_the_end(
    tmp_path, monkeypatch
):
    monkeypatch.setattr(flow, "DOSSIERS_PATH", tmp_path / "dossiers.json")

    with pytest.raises(RuntimeError, match="dossier stage"):
        flow.event_id_for(tmp_path / "unwritten")


# ---------------------------------------------------------------------------
# FAILURE REPORTING
# ---------------------------------------------------------------------------

def test_a_stage_that_calls_sys_exit_still_prints_the_resume_advice(
    tmp_path, monkeypatch, capsys
):
    """
    SystemExit is a BaseException, so `except Exception` let argparse take the
    whole process down with it and the operator never saw that nothing downstream
    ran. Caught by name now; KeyboardInterrupt still propagates.
    """
    monkeypatch.setattr(flow, "STORIES", tmp_path)
    monkeypatch.setattr(flow, "CORPUS_PATH", tmp_path / "corpus.json")
    (tmp_path / "corpus.json").write_text("[]", encoding="utf-8")

    def exits():
        raise SystemExit(2)

    monkeypatch.setattr(
        flow, "_plan",
        lambda *a, **k: [flow.Stage("dossier", lambda: False, exits, "why")])

    assert flow.run("story_test") == 1
    assert "fix this stage" in capsys.readouterr().err


def test_a_keyboard_interrupt_is_not_swallowed_as_a_stage_failure(
    tmp_path, monkeypatch
):
    def interrupted():
        raise KeyboardInterrupt

    monkeypatch.setattr(
        flow, "_plan",
        lambda *a, **k: [flow.Stage("dossier", lambda: False, interrupted, "why")])

    with pytest.raises(KeyboardInterrupt):
        flow.run("story_test")
