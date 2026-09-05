#!/usr/bin/env bash
# Ensure EXACTLY ONE clean Next dev server (E2E passkey mode) on $1, under node
# 20.10 (the repo's required runtime, NOT bun). Mirrors decideDevServer() in
# lib/test6.ts — keep the two in sync.
#
#   args: PORT [SNAPSHOT_FILE]
#     PORT           the resolved dev port (Conductor allocated or fallback)
#     SNAPSHOT_FILE  optional frozen source-fingerprint.json (lesson 2 gate)
#
# Reuse rules (lesson 1/2): a listener is reused/restarted ONLY when its process
# cwd resolves to EXACTLY this workspace's poa-app dir (the dir `next dev` is
# spawned in below) AND (when a snapshot is given) the current source fingerprint
# still matches the frozen one. Anything else — another Conductor checkout, an
# unknown process, or even our own repo root / a nested source dir — is REFUSED
# outright: never reused, never killed. On a restart we terminate ONLY that one
# validated PID (never a broad kill-by-port), so we can never take down a foreign
# process. Drift from the frozen snapshot is refused so HMR can't slip different
# code under the tested run.
#
# Multiple servers sharing poa-app/.next/ corrupt each other's webpack chunks
# (Cannot find module .../react-icons.js -> 500s in Chromium), so this guarantees one.
set -u
PORT="${1:?usage: ensure-dev.sh PORT [SNAPSHOT_FILE]}"
SNAPSHOT_FILE="${2:-}"
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd -P)"
# Resolve the exact app dir (physical path) so listener-cwd comparison is robust to
# symlinks. `next dev` runs here, so a server we own reports precisely this cwd.
APP="$(cd "$REPO_ROOT/poa-app" 2>/dev/null && pwd -P || echo "$REPO_ROOT/poa-app")"
URL="http://localhost:$PORT"
FP_SCRIPT="$(dirname "$0")/source-fingerprint.sh"

code() { curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$URL" 2>/dev/null; }

listener_pid() { lsof -ti tcp:"$PORT" -sTCP:LISTEN 2>/dev/null | head -1; }

proc_cwd() { # $1=pid -> absolute physical cwd, or empty if unresolvable
  local pid="$1" c
  c="$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -1)"
  [ -z "$c" ] && [ -r "/proc/$pid/cwd" ] && c="$(readlink -f "/proc/$pid/cwd" 2>/dev/null)"
  [ -n "$c" ] && ( cd "$c" 2>/dev/null && pwd -P )
}

is_our_app_cwd() { # $1=path -> 0 ONLY if it is EXACTLY our poa-app dir
  [ -n "$1" ] && [ "${1%/}" = "${APP%/}" ]
}

fingerprint_ok() { # 0 if no gate or current matches frozen snapshot
  [ -z "$SNAPSHOT_FILE" ] && return 0
  bash "$FP_SCRIPT" check "$SNAPSHOT_FILE" >/dev/null 2>&1
}

resolve_node() { # echo an executable node (prefer repo's 20.10), or empty
  local c
  for c in "$HOME/.nvm/versions/node/v20.10.0/bin/node" "$(command -v node 2>/dev/null || true)"; do
    [ -n "$c" ] && [ -x "$c" ] && { echo "$c"; return 0; }
  done
  return 1
}

terminate_pid() { # $1=pid — SIGTERM then SIGKILL, SCOPED to this one validated pid
  local pid="${1:-}" i                       # (+ its direct children, our own compile
  [ -z "$pid" ] && return 0                   # workers); never a broad kill-by-port.
  kill -0 "$pid" 2>/dev/null || return 0
  pkill -TERM -P "$pid" 2>/dev/null || true
  kill -TERM "$pid" 2>/dev/null || true
  for i in $(seq 1 20); do
    kill -0 "$pid" 2>/dev/null || return 0
    sleep 0.3
  done
  pkill -KILL -P "$pid" 2>/dev/null || true
  kill -KILL "$pid" 2>/dev/null || true
}

start_clean() { # $1=validated pid to stop first (empty=nothing running); clear .next,
                # start ONE detached server, wait for ready.
  local stop_pid="${1:-}" node_bin node_dir
  node_bin="$(resolve_node)" || { echo "ensure-dev: ERROR no node runtime found" >&2; exit 1; }
  node_dir="$(dirname "$node_bin")"
  terminate_pid "$stop_pid"
  sleep 1
  rm -rf "$APP/.next"
  cd "$APP" || { echo "ensure-dev: ERROR missing $APP" >&2; exit 1; }
  PATH="$node_dir:$PATH" PORT="$PORT" NEXT_PUBLIC_E2E_MODE=true NEXT_PUBLIC_E2E_AS=passkey \
    nohup "$node_bin" node_modules/.bin/next dev > "/tmp/poa-dev-$PORT.log" 2>&1 &
  disown
  local _
  for _ in $(seq 1 100); do
    [ "$(code)" = "200" ] && { echo "ensure-dev: started clean node dev server on $PORT"; exit 0; }
    sleep 3
  done
  echo "ensure-dev: ERROR server did not become ready on $PORT" >&2; exit 1
}

PID="$(listener_pid)"

if [ -z "$PID" ]; then
  # No listener. Refuse to serve drifted code; otherwise start fresh (nothing to stop).
  if fingerprint_ok; then start_clean ""
  else echo "ensure-dev: REFUSE — source drifted from frozen snapshot; re-freeze before verifying" >&2; exit 4; fi
fi

CWD="$(proc_cwd "$PID")"
if ! is_our_app_cwd "$CWD"; then
  echo "ensure-dev: REFUSE — port $PORT is held by a process that is not our poa-app dev server" >&2
  echo "            (pid=$PID cwd=${CWD:-unknown}, expected cwd=$APP). Not reusing and not killing it." >&2
  echo "            Set CONDUCTOR_PORT/TEST6_DEV_PORT to a free port." >&2
  exit 3
fi

# Our own server (cwd is EXACTLY our poa-app). Gate on the frozen snapshot, then health.
if ! fingerprint_ok; then
  echo "ensure-dev: REFUSE — tested source drifted from frozen snapshot since freeze (pid=$PID)." >&2
  exit 4
fi
if [ "$(code)" = "200" ]; then echo "ensure-dev: reusing healthy server on $PORT (pid=$PID)"; exit 0; fi
echo "ensure-dev: our server on $PORT is unhealthy — restarting clean (pid=$PID)"
start_clean "$PID"
