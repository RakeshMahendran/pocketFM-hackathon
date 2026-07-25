"""
The HTTP layer. Thin by contract - queries and serialization, no logic.

Listens on loopback only. Next owns the public port and proxies /api/* here
through a rewrite, so this never serves the UI and never needs CORS.

load_env() runs at import because uvicorn does not go through tasks.py, so
nothing else would ever read .env in a deployed app.
"""

from typing import Any

from fastapi import Depends, FastAPI, HTTPException

from src.util import IPL_BEATS, read_json, load_env, log, offline
from src.canon.views import character_view as _character_view

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
    """knows / blind / gaps - the query the whole product rests on."""
    return _character_view(beats, char_id)


@app.api_route("/api/{rest:path}", methods=["GET", "POST", "PUT", "DELETE"])
def api_not_found(rest: str):
    """
    Claim the whole /api namespace before the static catch-all does.

    Without this, StaticFiles answers a mistyped endpoint with an HTML 404
    and the frontend fails somewhere far from the cause.
    """
    raise HTTPException(status_code=404, detail=f"no such endpoint: /api/{rest}")


# --- static frontend, registered last -------------------------------------

