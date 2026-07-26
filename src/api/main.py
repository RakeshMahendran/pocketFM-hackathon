"""
The HTTP layer. Thin by contract - queries and serialization, no logic.

Two route families, merged rather than chosen between. `/api/*` serves canon
from Lakebase with the committed beat sheet as its fallback; `/stories/*`
serves the spinoff half from `data/stories/` and `data/spinoffs/`. They share
one app, one `character_view` rule, and nothing else.

Listens on loopback only. Next owns the public port and proxies /api/* here
through a rewrite, so this never serves the UI and never needs CORS.

load_env() runs at import because uvicorn does not go through tasks.py, so
nothing else would ever read .env in a deployed app.
"""

from typing import Any, Dict, List, Optional

from fastapi import Depends, FastAPI, HTTPException, Query

from src.util import IPL_BEATS, read_json, load_env, log, offline
from src.canon.views import character_view_from_beats as _character_view
from src.canon import store, views
from src.generation import promote as promote_mod
from src.generation import spinoff as spinoff_mod
from src.util import write_json
from src.validation import run as validate_mod

load_env()

app = FastAPI(title="CanonForge", docs_url="/api/docs", openapi_url="/api/openapi.json")



def beat_source() -> list[dict[str, Any]]:
    """
    Canon, from Lakebase when it is reachable and from the committed beat
    sheet when it is not.

    The fallback is deliberate: the demo must survive a dead database, and
    the sample sheet is the same canon the store was seeded from.
    """
    if offline():
        return read_json(IPL_BEATS)
    try:
        from src.canon.db import connect
        from src.canon import store

        with connect() as conn:
            beats = store.all_beats(conn)
        if beats:
            return beats
        # An empty table is not an empty season. Without this, a schema that
        # was created but never seeded serves [] under a green health check.
        log("lakebase reachable but holds no beats; serving disk canon", "warn")
    except Exception as exc:
        log(f"lakebase unavailable, serving beats from disk: {exc}", "warn")
    return read_json(IPL_BEATS)


@app.get("/api/health")
def health() -> dict[str, Any]:
    """Answers even when the database does not, so a crashed app and an
    unreachable database are distinguishable."""
    try:
        from src.canon.db import healthcheck

        db_ok = healthcheck()
    except Exception:
        db_ok = False
    return {"status": "ok", "database": "up" if db_ok else "down"}


@app.get("/api/beats")
def list_beats(beats: list[dict] = Depends(beat_source)) -> list[dict]:
    return beats


@app.get("/api/beats/{beat_id}")
def get_beat(beat_id: str, beats: list[dict] = Depends(beat_source)) -> dict:
    for beat in beats:
        if beat["beat_id"] == beat_id:
            return beat
    raise HTTPException(status_code=404, detail=f"no beat {beat_id}")


@app.get("/api/characters/{char_id}/view")
def character_view(char_id: str, beats: list[dict] = Depends(beat_source)) -> dict:
    """
    knows / blind / gaps - the query the whole product rests on.

    A name nobody in this canon has is a 404, not an empty view. The fail-closed
    complement means an unknown id comes back "knows nothing, blind to
    everything" - which is a well-formed, confident answer about a person who
    does not exist. In a product whose claim is that it knows exactly what each
    character was told, that is the worst possible way to be wrong: a caller
    cannot tell it apart from a real character who was kept out of the entire
    season.
    """
    known = {
        name
        for beat in beats
        for key in ("present", "witnessed_by", "hidden_from")
        for name in (beat.get(key) or [])
    }
    if char_id not in known:
        raise HTTPException(
            status_code=404,
            detail=f"no character '{char_id}' in this canon",
        )
    return _character_view(beats, char_id)



# ---------------------------------------------------------------------------
# THE SPINOFF HALF
# ---------------------------------------------------------------------------

def _story(story_id: str) -> Dict[str, Any]:
    try:
        return store.load_story(story_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@app.get("/api/stories")
def list_stories() -> Dict[str, Any]:
    """Every delivered serial. One line, and it saves the UI hardcoding an id."""
    return {"stories": store.story_ids()}


@app.get("/api/stories/{story_id}/cast")
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


@app.post("/api/stories/{story_id}/characters/{char_id}/spinoff")
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


def _season(story_id: str, char_id: str) -> Dict[str, Any]:
    """The season outline, if this character has been promoted. Empty otherwise —
    a spinoff can be written without one, it just has no shape around it."""
    path = promote_mod.bible_path(story_id, char_id)
    if not path.exists():
        return {}
    record = read_json(path)
    return {"title": record.get("title", ""), "logline": record.get("logline", ""),
            "episodes": record.get("season", [])}


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
        # Her whole season, structured from the canon with no model reading it.
        # The one episode below is written; the rest is the shape it sits in.
        "season": _season(story["story_id"], char_id),
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


# Registered last on purpose: a catch-all declared before a route shadows it.
@app.api_route("/api/{rest:path}", methods=["GET", "POST", "PUT", "DELETE"])
def api_not_found(rest: str):
    """
    Claim the whole /api namespace before the static catch-all does.

    Without this, StaticFiles answers a mistyped endpoint with an HTML 404
    and the frontend fails somewhere far from the cause.
    """
    raise HTTPException(status_code=404, detail=f"no such endpoint: /api/{rest}")


# --- static frontend, registered last -------------------------------------

