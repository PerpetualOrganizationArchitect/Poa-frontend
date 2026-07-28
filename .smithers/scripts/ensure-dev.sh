#!/usr/bin/env bash
# Ensure EXACTLY ONE clean Next dev server (E2E passkey mode) on $1 (default 3100),
# under node 20.10 (the repo's required runtime, NOT bun). Idempotent:
#   - healthy server already on the port  -> reuse it (fast)
#   - otherwise                            -> kill stale, clear corrupted .next,
#                                             start ONE clean server, wait for ready
# Multiple servers sharing poa-app/.next/ corrupt each other's webpack chunks
# (Cannot find module .../react-icons.js -> 500s in Chromium), so this guarantees one.
set -u
PORT="${1:-3100}"
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
APP="$REPO_ROOT/poa-app"
URL="http://localhost:$PORT"

code() { curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$URL" 2>/dev/null; }

# 1. Reuse a healthy server.
if [ "$(code)" = "200" ]; then echo "ensure-dev: reusing healthy server on $PORT"; exit 0; fi

# 2. Resolve node 20.10 (repo runtime); fall back to any node on PATH.
NODE_BIN=""
for c in "$HOME/.nvm/versions/node/v20.10.0/bin/node" "$(command -v node 2>/dev/null || true)"; do
  [ -n "$c" ] && [ -x "$c" ] && { NODE_BIN="$c"; break; }
done
[ -z "$NODE_BIN" ] && { echo "ensure-dev: ERROR no node runtime found"; exit 1; }
NODE_DIR="$(dirname "$NODE_BIN")"

# 3. Kill anything stale on the port (by port -> catches workers) and clear the build.
lsof -ti:"$PORT" 2>/dev/null | xargs -r kill -9 2>/dev/null || true
sleep 2
rm -rf "$APP/.next"

# 4. Start ONE clean server, fully detached (nohup + disown) so it outlives this script.
cd "$APP" || { echo "ensure-dev: ERROR missing $APP"; exit 1; }
PATH="$NODE_DIR:$PATH" PORT="$PORT" NEXT_PUBLIC_E2E_MODE=true NEXT_PUBLIC_E2E_AS=passkey \
  nohup "$NODE_BIN" node_modules/.bin/next dev > "/tmp/poa-dev-$PORT.log" 2>&1 &
disown

# 5. Wait for ready (fresh .next compile is slow).
for _ in $(seq 1 100); do
  [ "$(code)" = "200" ] && { echo "ensure-dev: started clean node dev server on $PORT"; exit 0; }
  sleep 3
done
echo "ensure-dev: ERROR server did not become ready on $PORT"; exit 1
