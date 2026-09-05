#!/usr/bin/env bash
# Freeze / verify the tested source revision + content fingerprint (lesson 2).
#
# The fingerprint = HEAD sha + a sha256 folded over the sorted (git blob hash, path)
# of every tracked + untracked (non-ignored) file in the SERVED-APP scope below —
# the exact tree that determines what the running dev server serves. It changes the
# instant any of that source/config changes, so the verifier can re-check it before
# every on-chain mutation and fail safely if a hot-reload/edit altered the tested
# code mid-run.
#
# Scope (lesson 7): the app is more than poa-app/src. The build/serve behaviour also
# depends on abi/ (imported by the app), public/ (static assets served as-is),
# posts/ (read at build time by src/util/posts.js for /blog + /docs), and the root
# config that shapes the bundle (next.config.mjs env inlining, jsconfig path aliases,
# package.json deps). Ignored/generated/runtime artifacts (.next, node_modules, out,
# *.gif) are excluded automatically by `--exclude-standard`. Test/docs/scripts/lock
# files are intentionally left out — they don't affect the served app, so an edit to
# one shouldn't force a re-freeze. Override the whole scope with $SOURCE_FP_SCOPE.
#
# Subcommands:
#   compute                 -> print the fingerprint string "<rev>-<contenthash>"
#   files                   -> print the sorted file list that feeds the fingerprint
#   freeze <snapshot.json>  -> write {rev,dirtyHash,fingerprint,...} JSON + print it
#   check  <snapshot.json>  -> exit 0 if current == frozen, 1 (+diagnostic) if drifted
#
# Deterministic + portable: NUL-safe listing, C-locale sort, macOS/Linux sha256.
set -u

CMD="${1:-}"
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd -P)"

# Served-app scope. A space-separated $SOURCE_FP_SCOPE overrides the default list.
if [ -n "${SOURCE_FP_SCOPE:-}" ]; then
  read -r -a SCOPE_PATHS <<< "$SOURCE_FP_SCOPE"
else
  SCOPE_PATHS=(
    poa-app/src
    poa-app/abi
    poa-app/public
    poa-app/posts
    poa-app/next.config.mjs
    poa-app/jsconfig.json
    poa-app/package.json
  )
fi

cd "$REPO_ROOT" 2>/dev/null || { echo "source-fingerprint: ERROR missing repo root $REPO_ROOT" >&2; exit 1; }

# Portable single-stream sha256 (macOS: shasum -a 256, Linux: sha256sum).
_sha256() {
  if command -v shasum >/dev/null 2>&1; then shasum -a 256 | awk '{print $1}'
  elif command -v sha256sum >/dev/null 2>&1; then sha256sum | awk '{print $1}'
  else openssl dgst -sha256 | awk '{print $NF}'; fi
}

_list_files() {
  # tracked + untracked, excluding .gitignored; keep only existing regular files,
  # C-locale sorted for a stable order across machines.
  git ls-files --cached --others --exclude-standard -- "${SCOPE_PATHS[@]}" 2>/dev/null \
    | LC_ALL=C sort -u \
    | while IFS= read -r f; do [ -f "$f" ] && printf '%s\n' "$f"; done
}

_content_hash() {
  local files
  files="$(_list_files)"
  {
    echo "scope:${SCOPE_PATHS[*]}"
    # Pair each path with its working-tree git blob hash (batched in ONE
    # hash-object process, so this stays fast even for hundreds of files) — an edit
    # or a rename both move the fingerprint.
    if [ -n "$files" ]; then
      paste -d ' ' \
        <(printf '%s\n' "$files" | git hash-object --stdin-paths 2>/dev/null) \
        <(printf '%s\n' "$files")
    fi
  } | _sha256
}

_compute() {
  local rev
  rev="$(git rev-parse HEAD 2>/dev/null || echo nogit)"
  printf '%s-%s\n' "$rev" "$(_content_hash)"
}

case "$CMD" in
  compute)
    _compute
    ;;
  files)
    _list_files
    ;;
  freeze)
    OUT="${2:?usage: source-fingerprint.sh freeze <snapshot.json>}"
    REV="$(git rev-parse HEAD 2>/dev/null || echo nogit)"
    CONTENT="$(_content_hash)"
    FP="$REV-$CONTENT"
    mkdir -p "$(dirname "$OUT")"
    NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    printf '{\n  "rev": "%s",\n  "dirtyHash": "%s",\n  "fingerprint": "%s",\n  "workspace": "%s",\n  "snapshotFile": "%s",\n  "capturedAt": "%s"\n}\n' \
      "$REV" "$CONTENT" "$FP" "$REPO_ROOT" "$OUT" "$NOW" | tee "$OUT"
    ;;
  check)
    SNAP="${2:?usage: source-fingerprint.sh check <snapshot.json>}"
    if [ ! -f "$SNAP" ]; then echo "source-fingerprint: ERROR missing snapshot $SNAP" >&2; exit 2; fi
    EXPECTED="$(sed -n 's/.*"fingerprint"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$SNAP" | head -1)"
    CURRENT="$(_compute)"
    if [ "$EXPECTED" = "$CURRENT" ]; then
      echo "source-fingerprint: OK ($CURRENT)"
      exit 0
    fi
    echo "source-fingerprint: DRIFT — tested source changed since freeze" >&2
    echo "  expected: $EXPECTED" >&2
    echo "  current:  $CURRENT" >&2
    exit 1
    ;;
  *)
    echo "usage: source-fingerprint.sh {compute|files|freeze <file>|check <file>}" >&2
    exit 64
    ;;
esac
