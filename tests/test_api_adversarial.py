"""
The HTTP surface, tested hostilely.

`test_api.py` proves the routes work on the fixture they were written against.
This file asks the harder questions: does the API agree with the rest of the
system, what does it do with input nobody meant it to receive, and does the
OpenAPI document describe the thing that is actually running.

Two conventions here:

  * Tests that pass describe behaviour that is *sound* and should stay sound.
  * Tests marked `xfail(strict=True)` assert the behaviour that *should* hold and
    currently does not. They are the findings, written as executable claims. Each
    carries the file and line of the code responsible. When one of them starts
    passing, pytest fails the run — which is the signal to delete the marker, not
    to weaken the assertion.

Nothing here spends money. The one POST is against a character whose episode and
verdict are both already on disk, which `src/api/main.py:190` returns without
reaching a model; the test asserts `cached is True` and that no file changed, so
a regression that made it generate would be caught rather than paid for.
"""

import json
import platform
import subprocess
import sys
import urllib.error
import urllib.request

import pytest
from fastapi.testclient import TestClient

from src.api.main import app, beat_source
from src.canon import store, views
from src.util import IPL_BEATS, ROOT, SPINOFFS, STORIES, read_json

WINDOWS = platform.system() == "Windows"
LIVE = "http://127.0.0.1:8001"
PROXY = "http://127.0.0.1:3000"


@pytest.fixture
def client():
    """The real routes over the committed beat sheet — the same substitution
    `test_api.py` makes, so these run offline."""
    app.dependency_overrides[beat_source] = lambda: read_json(IPL_BEATS)
    yield TestClient(app, raise_server_exceptions=False)
    app.dependency_overrides.clear()


@pytest.fixture
def raw_client():
    """No dependency override: `beat_source` runs its own Lakebase-or-disk choice."""
    return TestClient(app, raise_server_exceptions=False)


def _live(url: str, method: str = "GET"):
    """A live server response, or a skip. These tests are about uvicorn and the
    Next rewrite specifically, which TestClient cannot stand in for."""
    req = urllib.request.Request(url, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status, dict(resp.headers), resp.read()
    except urllib.error.HTTPError as exc:
        return exc.code, dict(exc.headers), exc.read()
    except OSError:
        pytest.skip(f"nothing listening at {url}")


# ---------------------------------------------------------------------------
# 1. DOES THE API AGREE WITH THE REST OF THE SYSTEM?
# ---------------------------------------------------------------------------

STORY_IDS = store.story_ids()


@pytest.mark.parametrize("story_id", STORY_IDS)
def test_cast_endpoint_agrees_with_the_module_the_console_shells_out_to(client, story_id):
    """
    Two independent readers of one truth.

    `web/lib/spinoffs.ts:579` runs `python -m src.canon.cast --story <id> --json`
    to build the roster screen. `/api/stories/<id>/cast` answers the same question
    over HTTP. If they ever disagree, one of them is lying to somebody and there
    is no way to tell which from either screen.
    """
    api = client.get(f"/api/stories/{story_id}/cast")
    assert api.status_code == 200
    api_rows = {r["char_id"]: r for r in api.json()["cast"]}

    proc = subprocess.run(
        [sys.executable, "-m", "src.canon.cast", "--story", story_id, "--json"],
        capture_output=True, text=True, encoding="utf-8", cwd=ROOT,
    )
    assert proc.returncode == 0, proc.stderr[-500:]
    cli_rows = {r["char_id"]: r for r in json.loads(proc.stdout)}

    assert set(api_rows) == set(cli_rows)
    for cid in cli_rows:
        for field in ("witnessed", "blind", "promotable", "name", "role", "want"):
            assert api_rows[cid][field] == cli_rows[cid][field], f"{cid}.{field}"

    # Order is an editorial judgement made in `views.promotable`; the console
    # documents that it keeps Python's order exactly, so the API must too.
    assert [r["char_id"] for r in api.json()["cast"]] == [
        r["char_id"] for r in json.loads(proc.stdout)
    ]


@pytest.mark.parametrize("story_id", STORY_IDS)
def test_every_cast_row_accounts_for_the_whole_season(client, story_id):
    """`blind` is the complement of `knows`, so the two must exhaust the season.
    A row that does not add up means one of the counts was computed against a
    different beat list than `n_beats` was."""
    body = client.get(f"/api/stories/{story_id}/cast").json()
    for row in body["cast"]:
        assert row["witnessed"] + row["blind"] == body["n_beats"], row["char_id"]


def test_stories_endpoint_lists_exactly_what_the_store_can_load(client):
    assert client.get("/api/stories").json()["stories"] == store.story_ids()


# ---------------------------------------------------------------------------
# 2. WHICH CANON IS THE CALLER BEING TOLD ABOUT?
# ---------------------------------------------------------------------------

@pytest.mark.xfail(strict=True, reason=(
    "FINDING: /api/beats is a bare array with no statement of whether it came "
    "from Lakebase or from the disk fallback. src/api/main.py:73"))
def test_beats_endpoint_says_which_canon_it_is_serving(raw_client):
    """
    `/api/beats` serves Lakebase when it is up and `schemas/samples/ipl_beats.json`
    when it is not (`src/api/main.py:34-57`). Those are different worlds — 22
    Molipur beats versus whatever the database holds — and the response is a bare
    array with nothing on it saying which one arrived. A caller cannot tell a
    seeded database from a dead one, and both answer 200.
    """
    body = raw_client.get("/api/beats").json()
    assert isinstance(body, dict), (
        "the beat list is served bare, with no envelope naming its source; "
        "src/api/main.py:73-75"
    )


@pytest.mark.xfail(strict=True, reason=(
    "FINDING: /api/characters/rafiq/view answers about the Molipur fixture's "
    "rafiq, not the only rafiq in the delivered stories. src/api/main.py:86"))
def test_character_view_and_the_cast_endpoint_describe_the_same_people(raw_client):
    """
    The two halves of the API disagree about who exists.

    `/api/characters/{id}/view` answers out of `beat_source` — the Molipur
    fixture — while `/api/stories/{id}/cast` answers out of `data/stories/`.
    `rafiq` is a name in both, and they are not the same man: the fixture's rafiq
    witnesses 18 of 22 beats, and `evt_dharampur_2025_ep1`'s rafiq is a jailed
    mechanic who witnesses none of his season's 5. Both endpoints answer 200 and
    neither names its world.
    """
    story = store.load_story("evt_dharampur_2025_ep1")
    truth = len(views.knows(story, "rafiq"))
    view = raw_client.get("/api/characters/rafiq/view").json()
    assert len(view["knows"]) == truth, (
        f"/api/characters/rafiq/view says knows={len(view['knows'])}; the only "
        f"rafiq in the delivered stories knows {truth}. src/api/main.py:86-110"
    )


@pytest.mark.xfail(strict=True, reason=(
    "FINDING: /api/characters/{id}/view only ever reads beat_source, so every "
    "character of the eight delivered stories 404s. src/api/main.py:86"))
@pytest.mark.parametrize("char_id", ["ratnamma", "chaitra", "babulal", "manjula"])
def test_delivered_characters_are_answerable_by_the_character_view(raw_client, char_id):
    """Every one of these is a real, promoted, spinoff-generating character. The
    endpoint the product claim rests on 404s on all of them, because it only ever
    looks at the fallback beat sheet."""
    assert raw_client.get(f"/api/characters/{char_id}/view").status_code == 200


@pytest.mark.xfail(strict=True, reason=(
    "FINDING: a beat is addressed and returned with no story qualifier, and "
    "b004 exists in eight canons. src/api/main.py:78"))
def test_beat_ids_are_not_unique_so_the_beat_endpoint_needs_a_story(raw_client):
    """
    `/api/beats/{beat_id}` addresses a beat by id alone. `b004` exists in the
    fixture and in seven of the eight delivered stories, meaning different things
    in each. The endpoint returns whichever one `beat_source` happened to hand it,
    with no story qualifier in the request or the response.
    """
    served = raw_client.get("/api/beats/b004").json()
    assert "story_id" in served, (
        "a beat is served with no statement of which story it belongs to, and "
        "b004 exists in eight different canons; src/api/main.py:78-83"
    )


@pytest.mark.xfail(strict=True, reason=(
    "FINDING: beat_source calls all_beats() with no story_id and no tier, so a "
    "Lakebase holding more than one story serves them merged. "
    "src/api/main.py:49"))
def test_beat_source_scopes_to_one_story(client):
    """
    `beat_source` calls `store.all_beats(conn)` with no `story_id` and no `tier`
    (`src/api/main.py:49`). `seed.py:6-9` states the table is keyed on
    `(story_id, beat_id)` precisely so several stories can sit in it at once, and
    `tasks.py ingest` adds `branch_canon` spinoff beats to the same table.

    So the day Lakebase holds a second story, `/api/beats` serves both mixed,
    `/api/beats/{id}` returns whichever row sorts first, and
    `/api/characters/{id}/view` computes `blind` across every story at once —
    inflating the prohibition set with another show's beats and silently merging
    two same-named characters' `knows`. `store._check_beat_ids` treats a duplicate
    beat id as fatal; this path has no equivalent.

    Simulated here with two delivered stories, because the demo database is down.
    """
    a = store.load_story("story1_denied_identity")
    b = store.load_story("story2_long_deception")
    app.dependency_overrides[beat_source] = lambda: a["beats"] + b["beats"]

    body = client.get("/api/beats").json()
    ids = [x["beat_id"] for x in body]
    assert len(ids) == len(set(ids)), (
        f"{len(ids) - len(set(ids))} duplicate beat_ids served as one canon; "
        "src/api/main.py:49"
    )


# ---------------------------------------------------------------------------
# 3. INPUT ABUSE
# ---------------------------------------------------------------------------

# Everything a caller can put in a path segment that is not a real id. None of
# these should ever be a 500.
JUNK = [
    "..", "../..", "%2e%2e", "%252e%252e%252f", "%00", "%20", ".", "....//",
    "a" * 300, "a" * 5000, "\U0001f600", "'; DROP TABLE beats;--", "1 OR 1=1",
    '{"$ne": null}', "{{7*7}}", "<script>alert(1)</script>", "con", "COM1",
    "nul", "story1_denied_identity.", "STORY1_DENIED_IDENTITY",
]


@pytest.mark.parametrize("junk", JUNK)
@pytest.mark.parametrize("template", [
    "/api/beats/{}",
    "/api/characters/{}/view",
])
def test_junk_in_a_path_segment_is_a_404_never_a_500(client, template, junk):
    assert client.get(template.format(junk)).status_code in (200, 404, 422)


# The three that reach a directory which exists but is not a story, and so get
# past `load_story`'s only guard. Split out so the rest can stay green.
CRASHES_THE_CAST_ENDPOINT = ["%2e%2e", "%2e", "%20", "nul"]


@pytest.mark.parametrize("junk", [j for j in JUNK if j not in CRASHES_THE_CAST_ENDPOINT])
def test_junk_story_id_is_a_404_never_a_500(client, junk):
    """
    `_story` (`src/api/main.py:118-122`) turns a `RuntimeError` from
    `store.load_story` into a 404, but `load_story` (`src/canon/store.py:50-56`)
    only raises when the *directory* is absent. It never checks the id against
    `story_ids()`, so a path that resolves to some other real directory sails
    past the guard and dies on `read_json(base / "dossier.json")` instead.

    On Windows that is reachable with a bare space, with a reserved device name,
    and with `..\\`. See the traversal test below.
    """
    assert client.get(f"/api/stories/{junk}/cast").status_code in (200, 404, 422)


# FIXED. `_story` now checks the id against `store.story_ids()` before touching
# the filesystem, so a path that resolves to a real directory which is not a
# story is refused by name rather than crashing on its missing dossier. Kept as
# a live test: the 500 was reachable through the public port and the only reason
# nothing leaked was that no directory outside data/stories/ happened to hold a
# dossier.json. src/api/main.py:_story
@pytest.mark.parametrize("junk", CRASHES_THE_CAST_ENDPOINT)
def test_a_story_id_that_resolves_to_a_non_story_directory_is_a_404(client, junk):
    assert client.get(f"/api/stories/{junk}/cast").status_code in (404, 422)


# FIXED by the allow-list in `_story`. Kept live, and on the widest vectors,
# because the escape was reachable through the public port and containment was
# accidental — no directory outside data/stories/ happened to hold a
# dossier.json. A regression here is a filesystem read, not a cosmetic 500.
@pytest.mark.skipif(not WINDOWS, reason="backslash is only a separator on Windows")
@pytest.mark.parametrize("target", ["..%5ccache", "..%5c..%5cweb", "..%5c..%5c.git"])
def test_story_id_cannot_escape_the_stories_directory(target):
    """
    `%5c` decodes to a backslash, which Starlette leaves in the path parameter
    because it is not a URL separator — and which Windows treats as a directory
    separator. `pathlib.Path(STORIES) / "..\\cache"` is `data/cache`, which
    exists, so `load_story`'s existence check passes and the read blows up.

    A directory that does not exist gives the correct 404; one that does gives a
    500. That difference is the escape, and it reaches the whole filesystem —
    `..\\..\\..\\` leaves the repository. Nothing is disclosed today only because
    no directory outside `data/stories/` happens to hold a `dossier.json`.
    """
    status, _, _ = _live(f"{LIVE}/api/stories/{target}/cast")
    assert status == 404, f"{target} -> {status}: the read escaped data/stories/"


# FIXED. The allow-list closes this too. It mattered beyond tidiness: the
# spinoff route builds a *filename* out of story_id, and its "already generated"
# check is a path existence test — so an aliased request missed the cache and
# would have paid for an episode already on disk, then written a duplicate under
# the alias. src/api/main.py:_story
@pytest.mark.parametrize("alias", ["STORY1_DENIED_IDENTITY", "story1_denied_identity."])
def test_the_api_only_answers_to_ids_it_publishes(client, alias):
    """
    Windows folds case and strips trailing dots, so these reach `story1`'s files.
    The response echoes the alias back as `story_id`, so a caller is handed an id
    that `/api/stories` does not list and that no other part of the system will
    recognise.

    It is not only cosmetic. `spinoff_path()` builds a filename out of `story_id`
    (`src/generation/spinoff.py:76-79`), so the same POST under an alias misses
    the "already generated" check at `src/api/main.py:190` and pays for a second
    generation of an episode that is already on disk under the canonical name.
    """
    assert client.get(f"/api/stories/{alias}/cast").status_code == 404


# FIXED as a side effect of the allow-list: an unknown id is refused before
# `load_story` is called, so its CLI-shaped message — which names the serving
# machine's absolute path and lists every story — never reaches the wire. That
# message is right for a terminal and wrong for an HTTP boundary; it is still
# there, and still correct, for the command line.
def test_an_unknown_story_does_not_report_the_server_filesystem(client):
    """`GET /api/stories/nope/cast` answers with the absolute path of the repo on
    the machine serving it, and enumerates every story id. It reaches the browser
    unchanged through the Next rewrite. `src/canon/store.py:52-54`."""
    detail = client.get("/api/stories/__nope__/cast").json()["detail"]
    assert str(ROOT) not in detail, detail


# ---------------------------------------------------------------------------
# 4. CONTRACT TRUTH
# ---------------------------------------------------------------------------

def test_every_documented_path_exists(client):
    spec = client.get("/api/openapi.json").json()
    assert set(spec["paths"]) == {
        "/api/health", "/api/beats", "/api/beats/{beat_id}",
        "/api/characters/{char_id}/view", "/api/stories",
        "/api/stories/{story_id}/cast",
        "/api/stories/{story_id}/characters/{char_id}/spinoff",
        "/api/{rest}",
    }


@pytest.mark.xfail(strict=True, reason=(
    "FINDING: one handler serves four methods, so FastAPI emits four operations "
    "with the same operationId and warns about it. Any generated client picks "
    "one and drops three. src/api/main.py:263"))
def test_operation_ids_are_unique(client):
    spec = client.get("/api/openapi.json").json()
    ids = [op["operationId"] for ops in spec["paths"].values() for op in ops.values()]
    assert len(ids) == len(set(ids)), [i for i in ids if ids.count(i) > 1]


@pytest.mark.xfail(strict=True, reason=(
    "FINDING: the spec declares 200 for GET/POST/PUT/DELETE on /api/{rest}; the "
    "handler raises 404 unconditionally. src/api/main.py:263"))
def test_the_catch_all_is_not_documented_as_a_success(client):
    """
    The spec declares `200` for GET/POST/PUT/DELETE on `/api/{rest}` — that is,
    for every path under `/api` that is not one of the six real ones. The handler
    raises 404 unconditionally (`src/api/main.py:263-271`). A generated client
    reads the whole namespace as a wildcard endpoint that returns success.
    """
    spec = client.get("/api/openapi.json").json()
    codes = {c for op in spec["paths"]["/api/{rest}"].values() for c in op["responses"]}
    assert codes == {"404", "422"}, codes


@pytest.mark.xfail(strict=True, reason=(
    "FINDING: no endpoint declares a response_model or a `responses` block, so "
    "404 — the designed answer of four of them — is undocumented, and every 200 "
    "is typed as an untyped object. src/api/main.py:60-160"))
def test_404_is_a_documented_response_somewhere(client):
    """Four of the six endpoints answer 404 by design and it appears nowhere in
    the spec, because none of them declares a `response_model` or `responses`."""
    spec = client.get("/api/openapi.json").json()
    documented = {
        code
        for path, ops in spec["paths"].items()
        for op in ops.values()
        for code in op["responses"]
    }
    assert "404" in documented


@pytest.mark.xfail(strict=True, reason=(
    "FINDING: the pipeline-failure 422 puts a string in `detail` under a spec "
    "declaring an array of ValidationError. src/api/main.py:210"))
def test_the_two_kinds_of_422_have_the_same_shape(client):
    """
    The spec says every 422 is an `HTTPValidationError`, whose `detail` is an
    array of error objects. FastAPI's own 422 is that shape. The one the spinoff
    endpoint raises for a pipeline failure (`src/api/main.py:210`) puts a bare
    string there instead. A client that unpacks `detail[0]["msg"]` per the spec
    gets a character.
    """
    validation = client.post(
        "/api/stories/__nope__/characters/__nope__/spinoff?force=notabool"
    )
    assert validation.status_code == 422
    assert isinstance(validation.json()["detail"], list)

    spec = client.get("/api/openapi.json").json()
    post = spec["paths"]["/api/stories/{story_id}/characters/{char_id}/spinoff"]["post"]
    schema = post["responses"]["422"]["content"]["application/json"]["schema"]
    assert schema["$ref"] == "#/components/schemas/HTTPValidationError"
    detail = spec["components"]["schemas"]["HTTPValidationError"]["properties"]["detail"]
    assert detail["type"] == "array"

    # The endpoint's *other* 422 — `src/api/main.py:210`, raised when the pipeline
    # itself fails — puts a bare string there. Read out of the source rather than
    # provoked, because provoking it means paying for a generation run.
    source = (ROOT / "src" / "api" / "main.py").read_text(encoding="utf-8")
    assert "raise HTTPException(status_code=422, detail=str(exc))" not in source, (
        "src/api/main.py:210 raises 422 with `detail` as a string, under a spec "
        "that declares `detail` as an array of ValidationError"
    )


@pytest.mark.xfail(strict=True, reason=(
    "FINDING: the catch-all claims POST/PUT/DELETE for the whole namespace, so "
    "a method mistake on a real endpoint is reported as a missing endpoint. "
    "src/api/main.py:263"))
def test_a_real_endpoint_with_the_wrong_method_says_so(client):
    """
    `POST /api/health` answers `{"detail": "no such endpoint: /api/health"}`.
    The endpoint exists; the method does not. The catch-all claims POST/PUT/DELETE
    for the whole namespace (`src/api/main.py:263`) and so answers before Starlette
    can raise the 405 it would otherwise raise, turning every method mistake into
    a false report that the route is missing.
    """
    resp = client.post("/api/health")
    assert resp.status_code == 405, resp.json()


@pytest.mark.xfail(strict=True, reason=(
    "FINDING: HEAD returns 405 on every route including /api/health, whose "
    "whole job is to be probed. src/api/main.py:60"))
def test_head_works_on_the_health_endpoint(client):
    """A liveness probe that uses HEAD gets 405 from every route on this app,
    including `/api/health`, whose entire purpose is to be probed."""
    assert client.head("/api/health").status_code == 200


# ---------------------------------------------------------------------------
# 5. THE PROXY SEAM
# ---------------------------------------------------------------------------

SEAM = [
    "/api/health", "/api/beats", "/api/beats/b014", "/api/beats/nope",
    "/api/characters/jignesh/view", "/api/characters/nope/view",
    "/api/stories", "/api/stories/story1_denied_identity/cast",
    "/api/stories/nope/cast", "/api/nope", "/api/openapi.json",
]


@pytest.mark.parametrize("path", SEAM)
def test_the_rewrite_changes_nothing(path):
    """Next owns the public port and proxies `/api/*` to uvicorn. Status, body
    and content-type must survive the hop, or a bug reproduces on one port and
    not the other."""
    direct_status, direct_headers, direct_body = _live(LIVE + path)
    proxy_status, proxy_headers, proxy_body = _live(PROXY + path)
    assert direct_status == proxy_status
    assert direct_body == proxy_body
    assert direct_headers["content-type"] == proxy_headers["content-type"]


# FIXED. The two ports disagreed only because one of them was crashing: Next
# collapses dot-segments before forwarding and uvicorn does not, so the same id
# was a 404 on :3000 and a 500 on :8001. With the id checked against the list
# before the filesystem is touched, normalisation stops mattering and both ports
# answer alike.
@pytest.mark.parametrize("junk", ["%2e", "%2e%2e"])
def test_the_two_ports_treat_a_malformed_id_alike(junk):
    direct, _, _ = _live(f"{LIVE}/api/stories/{junk}/cast")
    proxied, _, _ = _live(f"{PROXY}/api/stories/{junk}/cast")
    assert direct == proxied


# FIXED. These are the three vectors Next does not normalise, so they were the
# ones that reached a 500 from a browser rather than only from loopback.
@pytest.mark.parametrize("junk", ["..%5ccache", "%20", "nul"])
def test_the_public_port_does_not_expose_the_500s(junk):
    """The vectors Next does not normalise."""
    proxied, _, _ = _live(f"{PROXY}/api/stories/{junk}/cast")
    assert proxied < 500, f"{junk} -> {proxied} through the public port"


def test_an_error_body_never_carries_a_trace_or_a_path():
    """
    Whatever an error turns out to be, it says nothing about this machine.

    This asserted `status == 500` when there was a reachable 500 to assert on.
    There no longer is, and rewriting it to expect one would have meant keeping
    a crash alive to keep a test honest. What it was actually protecting — that
    an error body carries no traceback and no filesystem path — is the part
    worth keeping, so it now holds for whatever the server answers.
    """
    if not WINDOWS:
        pytest.skip("these vectors only resolve to directories on Windows")
    for junk in ("%20", "nul", "..%5ccache"):
        status, _, body = _live(f"{PROXY}/api/stories/{junk}/cast")
        assert status < 500, f"{junk} -> {status}"
        low = body.lower()
        assert b"traceback" not in low
        assert b"canonforge" not in low
        assert b":\\" not in low and b"/users/" not in low


# ---------------------------------------------------------------------------
# 6. CONCURRENCY AND STATE
# ---------------------------------------------------------------------------

def test_parallel_cast_reads_return_one_answer(client):
    """`/api/stories/{id}/cast` re-reads `dossier.json` and `beats.json` on every
    request and holds no state between them. Thirty-two at once must be
    thirty-two identical answers."""
    from concurrent.futures import ThreadPoolExecutor

    url = "/api/stories/story1_denied_identity/cast"
    with ThreadPoolExecutor(max_workers=32) as pool:
        bodies = [f.result() for f in
                  [pool.submit(client.get, url) for _ in range(32)]]
    assert {b.status_code for b in bodies} == {200}
    assert len({b.text for b in bodies}) == 1


def test_health_reports_the_database_honestly(raw_client):
    """`database: up` must mean a query would succeed. It is derived from
    `db.healthcheck()` on every call rather than cached, so it cannot go stale —
    but note that `/api/beats` will happily serve the disk fixture under a
    `database: down` health check with no other signal."""
    body = raw_client.get("/api/health").json()
    assert body["database"] in ("up", "down")
    from src.canon import db
    try:
        expected = "up" if db.healthcheck() else "down"
    except Exception:
        expected = "down"
    assert body["database"] == expected


# ---------------------------------------------------------------------------
# 7. THE SPINOFF POST — the cached arm only
# ---------------------------------------------------------------------------

CACHED = SPINOFFS / "story1_denied_identity__ratnamma__b014.json"
CACHED_VERDICT = SPINOFFS / "story1_denied_identity__ratnamma__b014__validation.json"


@pytest.mark.skipif(not (CACHED.exists() and CACHED_VERDICT.exists()),
                    reason="the cached arm needs the episode and its verdict on disk")
def test_the_spinoff_post_returns_the_saved_episode_without_generating(client):
    """
    The one POST this suite makes. Both files exist, so `src/api/main.py:190`
    returns before `promote` or `write_spinoff` is reached and nothing is written.

    The assertions are the contract a caller depends on: the episode is flagged
    cached, `knows` and `blind` partition the season, and every beat the episode
    cites is one the character witnessed — hard rule 1, checked at the boundary.
    """
    before = {p.name: p.stat().st_mtime_ns for p in SPINOFFS.iterdir()}

    resp = client.post(
        "/api/stories/story1_denied_identity/characters/ratnamma/spinoff",
        params={"anchor": "b014"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["cached"] is True

    after = {p.name: p.stat().st_mtime_ns for p in SPINOFFS.iterdir()}
    assert before == after, "a cached read wrote to data/spinoffs/"

    knows = {b["beat_id"] for b in body["knows"]}
    blind = {b["beat_id"] for b in body["blind"]}
    assert not (knows & blind)
    assert len(knows) + len(blind) == len(store.load_story("story1_denied_identity")["beats"])
    assert body["anchor"]["beat_id"] in knows
    assert [c for c in body["cites"] if c not in knows] == []


def test_the_spinoff_post_refuses_an_unknown_character_before_doing_work(client):
    resp = client.post(
        "/api/stories/story1_denied_identity/characters/__nope__/spinoff")
    assert resp.status_code == 404


@pytest.mark.xfail(strict=True, reason=(
    "FINDING: the API quotes the verdict file's own status and n_errors; the "
    "console recomputes both from the rows and keeps the file's number only for "
    "comparison. src/api/main.py:250 vs web/lib/spinoffs.ts:396"))
def test_the_spinoff_verdict_is_recomputed_rather_than_quoted(client):
    """
    `src/api/main.py:250-251` forwards the verdict file's own `status` and
    `n_errors`. `web/lib/spinoffs.ts:396-413` deliberately does not: it derives
    both from the violation rows and keeps the file's number only as
    `declaredErrorCount`, so the two can be compared.

    So a verdict file whose header disagrees with its own rows reads clean over
    HTTP and reads as violations on the console. The API is the reader that
    should be least willing to take a number on trust, and it is the one that
    does.
    """
    verdict = read_json(CACHED_VERDICT)
    rows = [v for v in verdict["violations"] if v.get("severity") != "warn"]
    assert verdict["n_errors"] == len(rows), "the delivered verdict file is self-consistent"

    # The API must not be able to disagree with the rows in the first place.
    source = (ROOT / "src" / "api" / "main.py").read_text(encoding="utf-8")
    assert '"status": verdict["status"]' not in source, (
        "src/api/main.py:250 quotes the verdict file's own header instead of "
        "counting its rows, which is what web/lib/spinoffs.ts does"
    )


# ---------------------------------------------------------------------------
# What is sound. These should never start failing.
# ---------------------------------------------------------------------------

def test_unknown_ids_are_404_with_a_json_body(client):
    for path in ("/api/beats/b999", "/api/characters/nobody/view",
                 "/api/stories/__nope__/cast", "/api/does-not-exist"):
        resp = client.get(path)
        assert resp.status_code == 404, path
        assert resp.headers["content-type"].startswith("application/json"), path
        assert "detail" in resp.json(), path


def test_the_character_view_fails_closed_on_an_unknown_name(client):
    """A name nobody has must be a 404, not a confident "knows nothing, blind to
    everything" — which is indistinguishable from a real character kept out of a
    whole season. `src/api/main.py:99-109`."""
    assert client.get("/api/characters/nobody-at-all/view").status_code == 404


def test_knows_and_blind_never_intersect_in_the_character_view(client):
    for char in ("jignesh", "rafiq", "pankaj", "bettor_tver"):
        view = client.get(f"/api/characters/{char}/view").json()
        assert not ({b["beat_id"] for b in view["knows"]}
                    & {b["beat_id"] for b in view["blind"]}), char


def test_the_beat_list_is_ordered_and_the_ordering_is_the_query_order(client):
    order = [(b["ep"], b["seq"]) for b in client.get("/api/beats").json()]
    assert order == sorted(order)
