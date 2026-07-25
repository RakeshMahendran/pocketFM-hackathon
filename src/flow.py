"""
The whole pipeline, one command, event to audio.

    python -m src.flow --story story1_denied_identity --ep 1

    corpus    ranked candidates, scored and cleared      (frozen, never live)
    dossier   the winner becomes a cast and a season
    season    episodes, beats, promises, calendar
    audio     voices, bed, spot effects, master

Each stage reports whether it ran or was already done, and how long it took. A
stage that already has its output is skipped rather than repeated — so the demo
can start from any point, and a stage that fails on stage can be resumed rather
than restarted.

Discovery is deliberately not runnable from here. `CLAUDE.md` hard rule 5: the
corpus is frozen once and committed, and nothing on the demo path opens a socket
to a search engine. Everything after it can be generated live.
"""

import sys
import time
import argparse
import datetime as dt
from typing import Any, Callable, Dict, List, Optional

from src.util import CORPUS_PATH, DATA, DOSSIERS_PATH, log, load_env, read_json

STORIES = DATA / "stories"


class Stage:
    def __init__(self, name: str, done: Callable[[], bool],
                 run: Callable[[], Any], why: str):
        self.name, self.done, self.run, self.why = name, done, run, why


def _plan(story: str, ep: int, language: Optional[str],
          force: List[str]) -> List[Stage]:
    story_dir = STORIES / story
    audio_dir = story_dir / "audio"
    stem = f"ep{ep:02d}_{language}" if language else f"ep{ep:02d}"

    def corpus_done():
        return CORPUS_PATH.exists()

    def corpus_run():
        raise RuntimeError(
            "no corpus, and discovery must not run on the demo path — "
            "`python tasks.py corpus` deliberately, once, then commit it")

    def dossier_done():
        return (story_dir / "dossier.json").exists()

    def dossier_run():
        from src.scoring.run import main as expand_main
        if expand_main() != 0:
            raise RuntimeError("expansion failed")

    def season_done():
        return (story_dir / "beats.json").exists() and \
            any((story_dir / "episodes").glob("ep*.md"))

    def season_run():
        from src.generation.serial import main as serial_main
        if serial_main() != 0:
            raise RuntimeError("the serial writer failed")

    def audio_done():
        return any(audio_dir.glob(f"*{stem.replace('ep01', 'ep01')}*_sfx.mp3")) or \
            any(audio_dir.glob("*_sfx.mp3"))

    def audio_run():
        from src.audio.build import build
        build(story, ep, language=language)

    stages = [
        Stage("corpus", corpus_done, corpus_run,
              "ranked candidates, scored and cleared"),
        Stage("dossier", dossier_done, dossier_run,
              "the winner becomes a cast and a season plan"),
        Stage("season", season_done, season_run,
              "episodes, beats, promises, calendar"),
        Stage("audio", audio_done, audio_run,
              "voices, bed, spot effects, master"),
    ]
    for s in stages:
        if s.name in force:
            s.done = lambda: False
    return stages


def run(story: str, ep: int = 1, language: str = None,
        force: List[str] = None, dry: bool = False) -> int:
    force = force or []
    started = time.perf_counter()
    log(f"flow: {story} episode {ep}" + (f" [{language}]" if language else ""))

    for stage in _plan(story, ep, language, force):
        if stage.done():
            log(f"  {stage.name:9} ready      {stage.why}")
            continue
        if dry:
            log(f"  {stage.name:9} WOULD RUN  {stage.why}", "warn")
            continue

        log(f"  {stage.name:9} running    {stage.why}")
        t = time.perf_counter()
        try:
            stage.run()
        except Exception as exc:
            log(f"  {stage.name:9} FAILED after {time.perf_counter() - t:.1f}s: {exc}",
                "error")
            log("nothing downstream ran — fix this stage and run the same command "
                "again; everything before it is already done", "error")
            return 1
        log(f"  {stage.name:9} done in {time.perf_counter() - t:.1f}s")

    log(f"flow complete in {time.perf_counter() - started:.1f}s")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--story", required=True)
    ap.add_argument("--ep", type=int, default=1)
    ap.add_argument("--language", default=None)
    ap.add_argument("--force", default="",
                    help="comma-separated stages to rerun: dossier,season,audio")
    ap.add_argument("--dry-run", action="store_true",
                    help="say what would run without running it")
    args = ap.parse_args()

    load_env()
    return run(args.story, args.ep, args.language,
               [f.strip() for f in args.force.split(",") if f.strip()],
               args.dry_run)


if __name__ == "__main__":
    sys.exit(main())
