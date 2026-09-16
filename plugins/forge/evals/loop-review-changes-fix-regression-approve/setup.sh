#!/usr/bin/env bash
# Round 1 dev+QA PASS -> review round 1 CHANGES (one blocking finding,
# rv-1-1) -> per Step 5, one dev fix round (devRound becomes 2,
# addressing rv-1-1) -> one regression-only QA pass at round 2
# (verifiers 1, lens regression) PASS -> review round 2 APPROVE ->
# Terminal (ready). Every artifact through review-2 is pre-seeded so the
# idempotency rule skips every dispatch across this whole cycle.
set -euo pipefail

git init -q
git config user.email "eval@example.com"
git config user.name "Eval Runner"
git symbolic-ref HEAD refs/heads/main
MAIN_ROOT="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")"
REPO_DIR="$(basename "$MAIN_ROOT")"

mkdir -p .forge/duplicate-copy/context

cat > .forge/duplicate-copy/intent.md <<'EOF'
---
slug: duplicate-copy
status: approved
baseBranch: main
created: 2026-09-15
---

# Intent: duplicate-copy

## Problem

Users cannot duplicate a saved note.

## Desired outcome

A user can duplicate any saved note with one click.

## Done means

- Clicking "Duplicate" on a note creates a new note with the same content.

## Constraints

No new dependencies.

## Context

None.

## Out of scope

Duplicating a whole folder of notes at once.

## How to run

npm install && npm test
EOF

git add -A
git commit -q -m "eval fixture: approved intent for duplicate-copy"

ORIGIN_DIR="$(mktemp -d)/origin.git"
git init -q --bare "$ORIGIN_DIR"
git remote add origin "$ORIGIN_DIR"
git push -q origin main

EXCLUDE="$(git rev-parse --path-format=absolute --git-common-dir)/info/exclude"
echo ".forge/" >> "$EXCLUDE"

WORKTREE="$(dirname "$MAIN_ROOT")/${REPO_DIR}-forge/duplicate-copy"
git worktree add -q -b forge/duplicate-copy "$WORKTREE" main

pushd "$WORKTREE" >/dev/null

# .forge/duplicate-copy/intent.md and context/ are already tracked in
# this worktree -- they were committed on main above, before the
# exclude rule was added, and `git worktree add ... main` checked them
# out along with everything else main had at that commit. No separate
# copy-and-recommit is needed (or possible: it would be a no-op commit,
# which fails under `set -e`).

mkdir -p src/notes
cat > src/notes/duplicate.js <<'EOF'
function duplicateNote(note) {
  try {
    return { ...note, id: undefined };
  } catch (e) {
    return note; // swallowed error, silently returns the original
  }
}
module.exports = { duplicateNote };
EOF
git add src/notes/duplicate.js
git commit -q -m "feat(duplicate-copy): add duplicateNote helper"
COMMIT_1="$(git rev-parse HEAD)"

mkdir -p .forge/duplicate-copy/run/round-1/qa .forge/duplicate-copy/run/round-2/qa .forge/duplicate-copy/run/review-1 .forge/duplicate-copy/run/review-2

cat > .forge/duplicate-copy/run/round-1/dev-handoff.json <<EOF
{
  "version": 1,
  "round": 1,
  "commit": "$COMMIT_1",
  "summary": "Added duplicateNote(), which copies a note's fields and drops the id so a new one is assigned on save.",
  "filesChanged": ["src/notes/duplicate.js"],
  "testsAdded": ["src/notes/duplicate.test.js: copies content, drops id"],
  "howToRun": "npm install && npm test",
  "selfCheck": {"suite": "pass", "lint": "pass", "typecheck": "absent"},
  "deferred": [],
  "fixListAddressed": []
}
EOF

cat > .forge/duplicate-copy/run/round-1/qa/report.json <<'EOF'
{
  "version": 1,
  "round": 1,
  "verdict": "PASS",
  "findings": [],
  "unverified": [],
  "observations": [],
  "verifierFiles": ["round-1/qa/verifier-1.json", "round-1/qa/verifier-2.json", "round-1/qa/verifier-3.json"]
}
EOF

cat > .forge/duplicate-copy/run/review-1/review.json <<'EOF'
{
  "version": 1,
  "round": 1,
  "verdict": "CHANGES",
  "findings": [
    {
      "id": "rv-1-1",
      "blocking": true,
      "file": "src/notes/duplicate.js",
      "line": 4,
      "principle": "error handling",
      "summary": "The try/catch swallows any error and silently returns the original note (unduplicated) instead of surfacing a failure.",
      "suggestion": "Remove the try/catch — spreading a plain object cannot throw here — or, if it can in practice, rethrow instead of silently returning the original."
    }
  ]
}
EOF

cat > src/notes/duplicate.js <<'EOF'
function duplicateNote(note) {
  return { ...note, id: undefined };
}
module.exports = { duplicateNote };
EOF
git add src/notes/duplicate.js
git commit -q -m "fix(duplicate-copy): remove the swallowed-error try/catch [rv-1-1]"
COMMIT_2="$(git rev-parse HEAD)"

cat > .forge/duplicate-copy/run/round-2/dev-handoff.json <<EOF
{
  "version": 1,
  "round": 2,
  "commit": "$COMMIT_2",
  "summary": "Removed the try/catch that silently swallowed errors and returned the original note unduplicated.",
  "filesChanged": ["src/notes/duplicate.js"],
  "testsAdded": [],
  "howToRun": "npm install && npm test",
  "selfCheck": {"suite": "pass", "lint": "pass", "typecheck": "absent"},
  "deferred": [],
  "fixListAddressed": ["rv-1-1"]
}
EOF

cat > .forge/duplicate-copy/run/round-2/qa/report.json <<'EOF'
{
  "version": 1,
  "round": 2,
  "verdict": "PASS",
  "findings": [],
  "unverified": [],
  "observations": [],
  "verifierFiles": ["round-2/qa/verifier-1.json"]
}
EOF

cat > .forge/duplicate-copy/run/review-2/review.json <<'EOF'
{
  "version": 1,
  "round": 2,
  "verdict": "APPROVE",
  "findings": []
}
EOF

popd >/dev/null

mkdir -p .forge/duplicate-copy/run
cat > .forge/duplicate-copy/run/state.json <<EOF
{
  "version": 1,
  "slug": "duplicate-copy",
  "phase": "dev",
  "devRound": 0,
  "reviewRound": 0,
  "escalated": false,
  "pendingFix": null,
  "regressionPass": false,
  "reviewPending": false,
  "branch": "forge/duplicate-copy",
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
if [ "$1" = "pr" ] && [ "$2" = "create" ]; then
  echo "https://github.com/eval-org/eval-repo/pull/105"
  exit 0
fi
echo "gh eval-shim: unexpected call for this case: gh $*" >&2
exit 1
EOF
chmod +x .bin/gh
git add -A && git commit -q -m "eval fixture: gh shim"
export PATH="$PWD/.bin:$PATH"
