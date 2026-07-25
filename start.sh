#!/usr/bin/env bash
#
# Databricks App entrypoint.
#
# Two processes, one container. Next owns the public port because the console
# needs a server - cookies and server actions cannot be statically exported.
# FastAPI holds the canon store and listens on loopback only; Next proxies
# /api/* to it, so there is one origin and no CORS.
#
# If uvicorn dies, Next keeps serving and /api returns 502. That is the right
# failure for a demo: the console still loads and says what is broken, rather
# than the whole app going dark.
set -euo pipefail

API_PORT="${CANONFORGE_API_PORT:-8001}"
PUBLIC_PORT="${DATABRICKS_APP_PORT:-8000}"

echo "starting uvicorn on 127.0.0.1:${API_PORT}"
python -m uvicorn src.api.main:app --host 127.0.0.1 --port "${API_PORT}" &
API_PID=$!

# Do not outlive the app: without this the API lingers if Next exits.
trap 'kill ${API_PID} 2>/dev/null || true' EXIT

# Port and host go through the environment, not flags: npm swallows --port
# and --hostname as its own config and forwards the bare values to next,
# which then reads the first one as a project directory.
echo "starting next on 0.0.0.0:${PUBLIC_PORT}"
export PORT="${PUBLIC_PORT}"
export HOSTNAME="0.0.0.0"
exec npm --prefix web run start
