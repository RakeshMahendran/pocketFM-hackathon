"""
Lakebase connection.

Lakebase has no static password. Auth is a Databricks OAuth token that is
valid for an hour and checked only at login, so the token is minted on
demand and cached until shortly before it expires. SSL is mandatory -
token auth sends the token as a plaintext password.

On Databricks Apps the PG* variables are injected by the attached database
resource. Locally they are derived from the instance name.
"""

import os
import time
from typing import Optional

import psycopg

from src.util import log

INSTANCE = os.environ.get("LAKEBASE_INSTANCE", "canonforge")
DATABASE = os.environ.get("PGDATABASE", "databricks_postgres")

# Tokens last an hour. Refresh early so a connection opened just before the
# boundary is not racing the clock.
_TOKEN_TTL = 45 * 60

_token: Optional[str] = None
_token_at: float = 0.0


def _workspace():
    from databricks.sdk import WorkspaceClient

    return WorkspaceClient()


def credential(force: bool = False) -> str:
    """Current OAuth token for the instance, minting a new one when stale."""
    global _token, _token_at
    if not force and _token and (time.time() - _token_at) < _TOKEN_TTL:
        return _token
    cred = _workspace().database.generate_database_credential(
        instance_names=[INSTANCE],
        request_id="canonforge",
    )
    _token = cred.token
    _token_at = time.time()
    return _token


def _host() -> str:
    host = os.environ.get("PGHOST")
    if host:
        return host
    return _workspace().database.get_database_instance(name=INSTANCE).read_write_dns


def _user() -> str:
    user = os.environ.get("PGUSER")
    if user:
        return user
    return _workspace().current_user.me().user_name


def connect() -> psycopg.Connection:
    """A new SSL connection authenticated with a fresh-enough token."""
    return psycopg.connect(
        host=_host(),
        port=int(os.environ.get("PGPORT", "5432")),
        dbname=DATABASE,
        user=_user(),
        password=credential(),
        sslmode=os.environ.get("PGSSLMODE", "require"),
        application_name=os.environ.get("PGAPPNAME", "canonforge"),
    )


def healthcheck() -> bool:
    try:
        with connect() as conn, conn.cursor() as cur:
            cur.execute("SELECT 1")
            return cur.fetchone()[0] == 1
    except Exception as exc:  # surfaced to /api/health, never swallowed silently
        log(f"lakebase healthcheck failed: {exc}", "error")
        return False
