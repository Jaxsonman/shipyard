#!/usr/bin/env bash
# The branch/worktree/intent are pre-created exactly as Step 0 would
# have left them, but round 1 has NO dev-handoff.json — the prompt
# narrates that two dispatch attempts already happened and both
# returned non-JSON, per the "hand Claude the bad input directly"
# pattern used elsewhere in this marketplace for inputs that cannot be
# expressed as a valid fixture artifact.
set -euo pipefail

git init -q
git config user.email "eval@example.com"
git config user.name "Eval Runner"
git symbolic-ref HEAD refs/heads/main
MAIN_ROOT="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")"
REPO_DIR="$(basename "$MAIN_ROOT")"

mkdir -p .forge/broken-json-app/context

cat > .forge/broken-json-app/intent.md <<'EOF'
---
slug: broken-json-app
status: approved
baseBranch: main
created: 2026-09-15
---

# Intent: broken-json-app

## Problem

The settings page has no dark mode toggle.

## Desired outcome

A user can switch the app to dark mode from settings.

## Done means

- A toggle in settings switches the app's color scheme.

## Constraints

No new dependencies.

## Context

None.

## Out of scope

Per-page theme overrides.

## How to run

npm install && npm test
EOF

git add -A
git commit -q -m "eval fixture: approved intent for broken-json-app"

ORIGIN_DIR="$(mktemp -d)/origin.git"
git init -q --bare "$ORIGIN_DIR"
git remote add origin "$ORIGIN_DIR"
git push -q origin main

EXCLUDE="$(git rev-parse --path-format=absolute --git-common-dir)/info/exclude"
echo ".forge/" >> "$EXCLUDE"

WORKTREE="$(dirname "$MAIN_ROOT")/${REPO_DIR}-forge/broken-json-app"
git worktree add -q -b forge/broken-json-app "$WORKTREE" main

pushd "$WORKTREE" >/dev/null
# .forge/broken-json-app/intent.md and context/ are already tracked in
# this worktree -- they were committed on main above, before the
# exclude rule was added, and `git worktree add ... main` checked them
# out along with everything else main had at that commit. No separate
# copy-and-recommit is needed (or possible: it would be a no-op commit,
# which fails under `set -e`).
popd >/dev/null

mkdir -p .forge/broken-json-app/run
cat > .forge/broken-json-app/run/state.json <<EOF
{
  "version": 1,
  "slug": "broken-json-app",
  "phase": "dev",
  "devRound": 0,
  "reviewRound": 0,
  "escalated": false,
  "pendingFix": null,
  "regressionPass": false,
  "reviewPending": false,
  "branch": "forge/broken-json-app",
  "worktree": "$WORKTREE",
  "baseAheadOfOrigin": 0,
  "noProgress": [],
  "stageErrors": [],
  "terminal": {"kind": null, "cause": null, "pr": null}
}
EOF

mkdir -p .bin
cat > .bin/gh <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
if [ "$1" = "auth" ] && [ "$2" = "status" ]; then
  echo "eval-shim: Logged in to github.com as eval-bot" >&2
  exit 0
fi
if [ "$1" = "repo" ] && [ "$2" = "view" ]; then
  echo "eval-org/eval-repo"
  exit 0
fi
if [ "$1" = "label" ] && [ "$2" = "create" ]; then
  exit 0
fi
if [ "$1" = "pr" ] && [ "$2" = "create" ]; then
  echo "https://github.com/eval-org/eval-repo/pull/106"
  exit 0
fi
if [ "$1" = "pr" ] && [ "$2" = "edit" ]; then
  exit 0
fi
echo "gh eval-shim: unexpected call for this case: gh $*" >&2
exit 1
EOF
chmod +x .bin/gh
git add -A && git commit -q -m "eval fixture: gh shim"
export PATH="$PWD/.bin:$PATH"
