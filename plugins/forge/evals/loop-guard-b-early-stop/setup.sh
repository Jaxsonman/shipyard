#!/usr/bin/env bash
# devQaCap is the default (3). Round 1 and round 2's findings are
# byte-for-byte identical (same id, same evidence text — a fully static,
# deterministic defect the dev round did not change at all). Because the
# findings are byte-identical, the id set is trivially equal too, so
# guard A also fires here (state.escalated becomes true) -- but guard B's
# no-progress override wins and stops the run EARLY at round 2 with cause
# no-progress, NOT proceeding to round 3 as an ordinary FAIL would (2 < 3)
# if guard B did not exist. loop-guard-a-escalation is the separate
# scenario where evidence text differs each round, so only guard A fires
# and the cap terminal (not guard B) ends the run.
set -euo pipefail

git init -q
git config user.email "eval@example.com"
git config user.name "Eval Runner"
git symbolic-ref HEAD refs/heads/main
MAIN_ROOT="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")"
REPO_DIR="$(basename "$MAIN_ROOT")"

mkdir -p .forge/static-header/context

cat > .forge/static-header/intent.md <<'EOF'
---
slug: static-header
status: approved
baseBranch: main
created: 2026-09-15
---

# Intent: static-header

## Problem

The page header shows a hard-coded environment name instead of the real one.

## Desired outcome

The header always shows the actual running environment's name.

## Done means

- The header text matches the ENVIRONMENT_NAME the app was started with.

## Constraints

No new dependencies.

## Context

None.

## Out of scope

Per-user environment overrides.

## How to run

npm install && npm test
EOF

git add -A
git commit -q -m "eval fixture: approved intent for static-header"

ORIGIN_DIR="$(mktemp -d)/origin.git"
git init -q --bare "$ORIGIN_DIR"
git remote add origin "$ORIGIN_DIR"
git push -q origin main

EXCLUDE="$(git rev-parse --path-format=absolute --git-common-dir)/info/exclude"
echo ".forge/" >> "$EXCLUDE"

WORKTREE="$(dirname "$MAIN_ROOT")/${REPO_DIR}-forge/static-header"
git worktree add -q -b forge/static-header "$WORKTREE" main

pushd "$WORKTREE" >/dev/null

# .forge/static-header/intent.md and context/ are already tracked in
# this worktree -- they were committed on main above, before the
# exclude rule was added, and `git worktree add ... main` checked them
# out along with everything else main had at that commit. No separate
# copy-and-recommit is needed (or possible: it would be a no-op commit,
# which fails under `set -e`).

echo "// attempt 1 (no-op)" > src-header-attempt1.js
git add src-header-attempt1.js
git commit -q -m "feat(static-header): attempt 1 at reading ENVIRONMENT_NAME"
COMMIT_1="$(git rev-parse HEAD)"

mkdir -p .forge/static-header/run/round-1/qa .forge/static-header/run/round-2/qa

FINDINGS_JSON='[{"id":"qa-1-1","severity":"blocking","criterion":"The header text matches the ENVIRONMENT_NAME the app was started with.","repro":["Start the app with ENVIRONMENT_NAME=staging","Load the header"],"evidence":[{"kind":"command","command":"curl -s http://localhost:4173/ | grep -o \"env-badge.*\\/env-badge\"","exitCode":0,"excerpt":"<span class=\"env-badge\">production<\/span>"}]}]'

cat > .forge/static-header/run/round-1/dev-handoff.json <<EOF
{
  "version": 1,
  "round": 1,
  "commit": "$COMMIT_1",
  "summary": "Attempted to read ENVIRONMENT_NAME for the header, but the change was a no-op.",
  "filesChanged": ["src-header-attempt1.js"],
  "testsAdded": [],
  "howToRun": "npm install && npm test",
  "selfCheck": {"suite": "fail", "lint": "pass", "typecheck": "absent"},
  "deferred": [],
  "fixListAddressed": []
}
EOF

cat > .forge/static-header/run/round-1/qa/report.json <<EOF
{
  "version": 1,
  "round": 1,
  "verdict": "FAIL",
  "findings": $FINDINGS_JSON,
  "unverified": [],
  "observations": [],
  "verifierFiles": ["round-1/qa/verifier-1.json"]
}
EOF

echo "// attempt 2 (also a no-op)" > src-header-attempt2.js
git add src-header-attempt2.js
git commit -q -m "fix(static-header): attempt 2, still hard-coded [qa-1-1]"
COMMIT_2="$(git rev-parse HEAD)"

cat > .forge/static-header/run/round-2/dev-handoff.json <<EOF
{
  "version": 1,
  "round": 2,
  "commit": "$COMMIT_2",
  "summary": "Second attempt; the header string is still hard-coded to 'production'.",
  "filesChanged": ["src-header-attempt2.js"],
  "testsAdded": [],
  "howToRun": "npm install && npm test",
  "selfCheck": {"suite": "fail", "lint": "pass", "typecheck": "absent"},
  "deferred": [],
  "fixListAddressed": ["qa-1-1"]
}
EOF

# Byte-identical findings (same id, same criterion/repro/evidence text)
# to round 1 -- guard B must fire.
cat > .forge/static-header/run/round-2/qa/report.json <<EOF
{
  "version": 1,
  "round": 2,
  "verdict": "FAIL",
  "findings": $FINDINGS_JSON,
  "unverified": [],
  "observations": [],
  "verifierFiles": ["round-2/qa/verifier-1.json"]
}
EOF

popd >/dev/null

mkdir -p .forge/static-header/run
cat > .forge/static-header/run/state.json <<EOF
{
  "version": 1,
  "slug": "static-header",
  "phase": "dev",
  "devRound": 0,
  "reviewRound": 0,
  "escalated": false,
  "pendingFix": null,
  "regressionPass": false,
  "reviewPending": false,
  "branch": "forge/static-header",
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
  echo "https://github.com/eval-org/eval-repo/pull/104"
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
