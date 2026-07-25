"""
HTTP for the spinoff half.

    python tasks.py api          # uvicorn on :8000

Two endpoints: read a serial's cast, and generate one character's episode. Both
are thin — they import the same functions the CLI does, so there is no second
implementation of any rule and nothing here can disagree with `tasks.py`.

**Generation returns the saved artifact when one exists.** A full run is roughly
70 seconds for the episode plus 25 for the validator panel, which is longer than a
browser will hold a connection and far longer than anyone wants to stand in front
of. Everything already lands in `data/spinoffs/` as readable JSON, so a repeat
request is a file read. Pass `force=true` to actually spend the call — that way
generating live is something you choose on stage, not something you endure.

The Next.js app reads `data/` off the filesystem server-side and does not need
this. These endpoints are additive: use whichever fits the screen you are building.
"""

from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from src.canon import store, views
from src.generation import promote as promote_mod
from src.generation import spinoff as spinoff_mod
from src.util import load_env, log, read_json, write_json
from src.validation import run as validate_mod

load_env()

app = FastAPI(
    title="CanonForge — spinoff",
    description="A side character's own serial, provably unable to contradict the "
                "one they came from.",
)

# The console runs on another port in dev. Wide open deliberately: this serves a
# local demo over localhost and has nothing to protect.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _story(story_id: str) -> Dict[str, Any]:
    try:
        return store.load_story(story_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@app.get("/stories")
def list_stories() -> Dict[str, Any]:
    """Every delivered serial. One line, and it saves the UI hardcoding an id."""
    return {"stories": store.story_ids()}


@app.get("/stories/{story_id}/cast")
def get_cast(story_id: str) -> Dict[str, Any]:
    """
    The roster, with what each character saw and what they were shut out of.

    Returns the whole cast, not only the promotable ones — the mainline lead sitting
    at 43-of-46 next to a side character at 11-of-46 is the thing worth looking at,
    so the UI wants them both and greys one out.

    `moments` is included for promotable characters because choosing one is the next
    click, and computing it is pure code with no model call. Saving that round trip
    is worth the few extra bytes.
    """
    story = _story(story_id)
    rows: List[Dict[str, Any]] = []
    for row in views.promotable(story):
        entry = dict(row)
        if row["promotable"]:
            entry["moments"] = views.anchors(story, row["char_id"])
        rows.append(entry)

    return {
        "story_id": story_id,
        "title": story["dossier"].get("title", story_id),
        "n_beats": len(story["beats"]),
        "cast": rows,
    }


@app.post("/stories/{story_id}/characters/{char_id}/spinoff")
def create_spinoff(
    story_id: str,
    char_id: str,
    anchor: Optional[str] = Query(None, description="beat_id; defaults to the top "
                                                    "moment they witnessed"),
    force: bool = Query(False, description="regenerate instead of returning the "
                                           "saved episode"),
) -> Dict[str, Any]:
    """
    Generate one episode and validate it.

    Runs the whole chain — promotion if there is no bible yet, then the episode,
    then the panel — and returns the script and the verdict together. Three
    endpoints would make the caller orchestrate three slow calls and handle each
    one failing separately, for no benefit.
    """
    story = _story(story_id)
    if char_id not in story["cast_index"]:
        raise HTTPException(
            status_code=404,
            detail=f"no character {char_id} in {story_id}. "
                   f"Cast: {', '.join(sorted(story['cast_index']))}",
        )

    try:
        anchor_id = anchor or spinoff_mod.default_anchor(story, char_id)
        path = spinoff_mod.spinoff_path(story_id, char_id, anchor_id)
        verdict_path = path.with_name(path.stem + "__validation.json")

        if not force and path.exists() and verdict_path.exists():
            log(f"{char_id}/{anchor_id}: serving the saved episode")
            return _response(story, char_id, read_json(path),
                             read_json(verdict_path), cached=True)

        bible = promote_mod.load_bible(story_id, char_id)
        if bible is None:
            record = promote_mod.promote(story, char_id)
            write_json(promote_mod.bible_path(story_id, char_id), record)
            bible = record["bible"]

        episode = spinoff_mod.write_spinoff(story, char_id, anchor_id, bible=bible)
        write_json(path, episode)

        verdict = validate_mod.validate(episode, story)
        write_json(verdict_path, verdict)
    except RuntimeError as exc:
        # Our own failures are already written for a human — a missing beat, a
        # character with no lines, a refusal, an offline cache miss. Passing the
        # message through beats replacing it with "internal server error".
        raise HTTPException(status_code=422, detail=str(exc))

    return _response(story, char_id, episode, verdict, cached=False)


def _response(story: Dict[str, Any], char_id: str, episode: Dict[str, Any],
              verdict: Dict[str, Any], cached: bool) -> Dict[str, Any]:
    view = views.character_view(story, char_id)
    return {
        "story_id": story["story_id"],
        "char_id": char_id,
        "name": view["name"],
        "cached": cached,
        "anchor": episode["anchor"],
        "moments": view["anchors"],
        "episode": episode["episode"],
        "cites": episode["cites"],
        "crossings": episode["crossings"],
        # What the claim rests on, so a screen can show the split rather than
        # asserting it. `blind` carries the objective sentence for each beat, which
        # is what the side-by-side comparison needs.
        "knows": [{"beat_id": b["beat_id"], "ep": b["ep"],
                   "what_happened": b["what_happened"]} for b in view["knows"]],
        "blind": [{"beat_id": b["beat_id"], "ep": b["ep"],
                   "what_happened": b["what_happened"]} for b in view["blind"]],
        "validation": {
            "status": verdict["status"],
            "n_errors": verdict["n_errors"],
            "violations": verdict["violations"],
            "inconclusive": verdict["inconclusive"],
            # Printed on clean runs too: it is what turns "we found nothing" into
            # "we looked, and here is where".
            "attempts_that_failed": verdict["attempts_that_failed"],
            "members_run": verdict["members_run"],
        },
    }
