#!/bin/bash
# sync-shared.sh — vendor the shared tree into every plugin.
#
# Source of truth is `shared/`:
#   shared/scripts/*.js          (excluding *.test.js and fixtures/)
#   shared/references/contract.md
#
# Copies to:
#   plugins/<x>/scripts/*.js
#   plugins/<x>/references/contract.md
#   docs/contract.md
#
# Every directory under plugins/ is synced — there is no per-plugin list, so a
# plugin added later is picked up automatically. Vendored scripts with no
# counterpart in shared/scripts/ are removed, so a rename does not leave a
# stale copy behind. A plugin that ships no shared code opts out with an
# empty `.no-shared-sync` marker file at its root (forge does).
#
# Usage: bash scripts/sync-shared.sh [--dest <dir>] [--quiet] [--help]
#   --dest <dir>  Write the vendored tree under <dir> instead of the repo root.
#                 Used by check-shared-sync.sh to build a comparison tree.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="$ROOT"
QUIET=0

while [ $# -gt 0 ]; do
  case "$1" in
    --help|-h)
      sed -n '2,22p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    --dest) DEST="$2"; shift 2 ;;
    --quiet) QUIET=1; shift ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

SRC_SCRIPTS="$ROOT/shared/scripts"
SRC_CONTRACT="$ROOT/shared/references/contract.md"

[ -d "$SRC_SCRIPTS" ] || { echo "missing $SRC_SCRIPTS" >&2; exit 1; }
[ -f "$SRC_CONTRACT" ] || { echo "missing $SRC_CONTRACT" >&2; exit 1; }

# The shared scripts that get vendored: *.js minus *.test.js. fixtures/ is a
# directory and is never matched by the glob.
shared_names=()
for f in "$SRC_SCRIPTS"/*.js; do
  [ -e "$f" ] || continue
  base="$(basename "$f")"
  case "$base" in
    *.test.js) continue ;;
  esac
  shared_names+=("$base")
done

[ ${#shared_names[@]} -gt 0 ] || { echo "no shared scripts found in $SRC_SCRIPTS" >&2; exit 1; }

say() { [ "$QUIET" -eq 1 ] || echo "$@"; }

for plugin_dir in "$ROOT"/plugins/*/; do
  [ -d "$plugin_dir" ] || continue
  name="$(basename "$plugin_dir")"
  if [ -e "$plugin_dir/.no-shared-sync" ]; then say "skipped plugins/$name (.no-shared-sync)"; continue; fi

  out_scripts="$DEST/plugins/$name/scripts"
  out_refs="$DEST/plugins/$name/references"
  mkdir -p "$out_scripts" "$out_refs"

  for base in "${shared_names[@]}"; do
    cp "$SRC_SCRIPTS/$base" "$out_scripts/$base"
  done

  # Remove vendored scripts that no longer exist in shared/scripts/.
  for existing in "$out_scripts"/*.js; do
    [ -e "$existing" ] || continue
    base="$(basename "$existing")"
    keep=0
    for want in "${shared_names[@]}"; do
      [ "$base" = "$want" ] && keep=1 && break
    done
    [ "$keep" -eq 1 ] || { rm -f "$existing"; say "removed stale plugins/$name/scripts/$base"; }
  done

  cp "$SRC_CONTRACT" "$out_refs/contract.md"
  say "synced plugins/$name"
done

mkdir -p "$DEST/docs"
cp "$SRC_CONTRACT" "$DEST/docs/contract.md"
say "synced docs/contract.md"
