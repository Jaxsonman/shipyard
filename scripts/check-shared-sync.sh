#!/bin/bash
# check-shared-sync.sh — fail when a vendored copy of the shared tree has
# drifted from its source in shared/.
#
# Rebuilds the vendored tree into a temporary directory with sync-shared.sh
# and diffs it against the committed tree. Never modifies the working tree.
#
# Usage: bash scripts/check-shared-sync.sh [--quiet] [--help]
#
# Exit codes: 0 in sync, 1 drift found, 2 usage error.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
QUIET=0

while [ $# -gt 0 ]; do
  case "$1" in
    --help|-h)
      sed -n '2,10p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    --quiet) QUIET=1; shift ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

bash "$ROOT/scripts/sync-shared.sh" --dest "$TMP" --quiet

drift=0
report=""

# Every file the sync would write must exist and match.
while IFS= read -r expected; do
  rel="${expected#"$TMP"/}"
  actual="$ROOT/$rel"
  if [ ! -f "$actual" ]; then
    report+="  missing: $rel"$'\n'
    drift=1
  elif ! cmp -s "$expected" "$actual"; then
    report+="  drifted: $rel"$'\n'
    drift=1
  fi
done < <(find "$TMP" -type f | sort)

# Any vendored file the sync would NOT write is stale.
for plugin_dir in "$ROOT"/plugins/*/; do
  [ -d "$plugin_dir" ] || continue
  name="$(basename "$plugin_dir")"
  if [ -e "$plugin_dir/.no-shared-sync" ]; then continue; fi
  for existing in "$plugin_dir"scripts/*; do
    [ -e "$existing" ] || continue
    rel="plugins/$name/scripts/$(basename "$existing")"
    if [ ! -f "$TMP/$rel" ]; then
      report+="  stale:   $rel"$'\n'
      drift=1
    fi
  done
done

# Unresolved merge-conflict markers. The drift comparison above cannot catch
# these: sync-shared.sh copies shared/ verbatim, so a marker left in a source
# file is reproduced identically in every vendored copy and they all match.
# `=======` is checked anchored and alone on its line (a conflict marker never
# has a trailing space); `<<<<<<<` and `>>>>>>>` always carry a label.
conflicts=""
while IFS= read -r f; do
  if LC_ALL=C grep -nE '^(<<<<<<< |>>>>>>> |=======$)' "$f" >/dev/null 2>&1; then
    conflicts+="  $f"$'\n'
  fi
done < <(
  {
    find "$ROOT/shared" -type f
    find "$ROOT"/plugins/*/scripts -type f 2>/dev/null
    find "$ROOT"/plugins/*/references -name 'contract.md' 2>/dev/null
    echo "$ROOT/docs/contract.md"
  } | sort -u
)

if [ -n "$conflicts" ]; then
  {
    echo "Unresolved merge-conflict markers:"
    printf '%s' "$conflicts"
    echo "Resolve them before committing."
  } >&2
  exit 1
fi

if [ "$drift" -ne 0 ]; then
  {
    echo "Vendored copies are out of sync with shared/:"
    printf '%s' "$report"
    echo "Run: bash scripts/sync-shared.sh"
  } >&2
  exit 1
fi

[ "$QUIET" -eq 1 ] || echo "OK — vendored copies match shared/"
