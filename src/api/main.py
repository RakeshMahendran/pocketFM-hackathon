"""
The HTTP layer. Thin by contract - queries and serialization, no logic.

One process serves both halves: /api/* here, everything else falls through
to the Next.js static export. The static mount is registered last because
it is a catch-all and would otherwise shadow the API.

load_env() runs at import because uvicorn does not go through tasks.py, so
nothing else would ever read .env in a deployed app.
"""

import pathlib
from typing import Any, Optional

from fastapi import Depends, FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from src.util import ROOT, IPL_BEATS, read_json, load_env, log
from src.canon.views import character_view as _character_view

load_env()

app = FastAPI(title="CanonForge", docs_url="/api/docs", openapi_url="/api/openapi.json")

WEB_OUT = ROOT / "web" / "out"


def beat_source() -> list[dict[str, Any]]:
    """
    Canon, from Lakebase when it is reachable and from the committed beat
    sheet when it is not.

    The fallback is deliberate: the demo must survive a dead database, and
    the sample sheet is the same canon the store was seeded from.
    """
    try:
        from src.canon.db import connect
        from src.canon import store

        with connect() as conn:
            return store.all_beats(conn)
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


# --- static frontend, registered last -------------------------------------

if WEB_OUT.is_dir():
    app.mount("/", StaticFiles(directory=str(WEB_OUT), html=True), name="web")
else:
    log(f"no static build at {WEB_OUT}; API-only. Run `npm run build` in web/.", "warn")
