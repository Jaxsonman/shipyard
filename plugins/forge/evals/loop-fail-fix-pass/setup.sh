#!/usr/bin/env bash
# Round 1 FAILs with one finding (qa-1-1); round 2's handoff addresses it
# and QA PASSes; review APPROVEs. state.json starts at phase="dev",
# devRound=0 (a totally fresh resume), so this exercises the FULL walk:
# Step 1(round 1, skip dispatch)->Step 3 FAIL, N<cap->Step 1(round 2,
# skip dispatch)->Step 3 PASS->Step 4(skip dispatch)->Terminal(ready).
# Every dispatch is skipped by the idempotency rule because every
# artifact already exists.
set -euo pipefail

git init -q
git config user.email "eval@example.com"
git config user.name "Eval Runner"
git symbolic-ref HEAD refs/heads/main
MAIN_ROOT="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")"
REPO_DIR="$(basename "$MAIN_ROOT")"

mkdir -p .forge/search-highlight/context

cat > .forge/search-highlight/intent.md <<'EOF'
---
slug: search-highlight
status: approved
baseBranch: main
created: 2026-09-15
---

# Intent: search-highlight

## Problem

Search results do not highlight the matched term, making results hard to scan.

## Desired outcome

Every search result highlights the exact matched term.

## Done means

- A search for a term highlights that term, case-insensitively, in every result.

## Constraints

No new dependencies.

## Context

None.

## Out of scope

Fuzzy/typo-tolerant matching.

## How to run

npm install && npm test
EOF

git add -A
git commit -q -m "eval fixture: approved intent for search-highlight"

ORIGIN_DIR="$(mktemp -d)/origin.git"
git init -q --bare "$ORIGIN_DIR"
git remote add origin "$ORIGIN_DIR"
git push -q origin main

EXCLUDE="$(git rev-parse --path-format=absolute --git-common-dir)/info/exclude"
echo ".forge/" >> "$EXCLUDE"

WORKTREE="$(dirname "$MAIN_ROOT")/${REPO_DIR}-forge/search-highlight"
git worktree add -q -b forge/search-highlight "$WORKTREE" main

pushd "$WORKTREE" >/dev/null

# .forge/search-highlight/intent.md and context/ are already tracked in
# this worktree -- they were committed on main above, before the
# exclude rule was added, and `git worktree add ... main` checked them
# out along with everything else main had at that commit. No separate
# copy-and-recommit is needed (or possible: it would be a no-op commit,
# which fails under `set -e`).

mkdir -p src/search
cat > src/search/highlight.js <<'EOF'
function highlight(text, term) {
  return text; // round 1: forgot to actually highlight
}
module.exports = { highlight };
EOF
git add src/search/highlight.js
git commit -q -m "feat(search-highlight): add highlight helper (round 1, incomplete)"
COMMIT_1="$(git rev-parse HEAD)"

mkdir -p .forge/search-highlight/run/round-1/qa .forge/search-highlight/run/round-2/qa .forge/search-highlight/run/review-1

cat > .forge/search-highlight/run/round-1/dev-handoff.json <<EOF
{
  "version": 1,
  "round": 1,
  "commit": "$COMMIT_1",
  "summary": "Added a highlight() helper, but it returns the text unmodified.",
  "filesChanged": ["src/search/highlight.js"],
  "testsAdded": ["src/search/highlight.test.js: wraps the matched term"],
  "howToRun": "npm install && npm test",
  "selfCheck": {"suite": "fail", "lint": "pass", "typecheck": "absent"},
  "deferred": [],
  "fixListAddressed": []
}
EOF

cat > .forge/search-highlight/run/round-1/qa/report.json <<'EOF'
{
  "version": 1,
  "round": 1,
  "verdict": "FAIL",
  "findings": [
    {
      "id": "qa-1-1",
      "severity": "blocking",
      "criterion": "A search for a term highlights that term, case-insensitively, in every result.",
      "repro": ["Call highlight('Widget A', 'widget')", "Observe the returned string has no highlight markup"],
      "evidence": [{"kind": "test", "test": "src/search/highlight.test.js: wraps the matched term", "excerpt": "expected '<mark>Widget</mark> A' but received 'Widget A'"}]
    }
  ],
  "unverified": [],
  "observations": [],
  "verifierFiles": ["round-1/qa/verifier-1.json"]
}
EOF

sed 's/return text; \/\/ round 1: forgot to actually highlight/const re = new RegExp("(" + term + ")", "ig"); return text.replace(re, "<mark>$1<\/mark>");/' src/search/highlight.js > /tmp/highlight-fixed.js
cp /tmp/highlight-fixed.js src/search/highlight.js
git add src/search/highlight.js
git commit -q -m "fix(search-highlight): actually wrap the matched term [qa-1-1]"
COMMIT_2="$(git rev-parse HEAD)"

cat > .forge/search-highlight/run/round-2/dev-handoff.json <<EOF
{
  "version": 1,
  "round": 2,
  "commit": "$COMMIT_2",
  "summary": "Fixed highlight() to wrap the matched term in <mark> tags, case-insensitively.",
  "filesChanged": ["src/search/highlight.js"],
  "testsAdded": [],
  "howToRun": "npm install && npm test",
  "selfCheck": {"suite": "pass", "lint": "pass", "typecheck": "absent"},
  "deferred": [],
  "fixListAddressed": ["qa-1-1"]
}
EOF

cat > .forge/search-highlight/run/round-2/qa/report.json <<'EOF'
{
  "version": 1,
  "round": 2,
  "verdict": "PASS",
  "findings": [],
  "unverified": [],
  "observations": [],
  "verifierFiles": ["round-2/qa/verifier-1.json", "round-2/qa/verifier-2.json", "round-2/qa/verifier-3.json"]
}
EOF

cat > .forge/search-highlight/run/review-1/review.json <<'EOF'
{
  "version": 1,
  "round": 1,
  "verdict": "APPROVE",
  "findings": []
}
EOF

popd >/dev/null

mkdir -p .forge/search-highlight/run
cat > .forge/search-highlight/run/state.json <<EOF
{
  "version": 1,
  "slug": "search-highlight",
  "phase": "dev",
  "devRound": 0,
  "reviewRound": 0,
  "escalated": false,
  "pendingFix": null,
  "regressionPass": false,
  "reviewPending": false,
  "branch": "forge/search-highlight",
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
  echo "https://github.com/eval-org/eval-repo/pull/102"
  exit 0
fi
echo "gh eval-shim: unexpected call for this case: gh $*" >&2
exit 1
EOF
chmod +x .bin/gh
git add -A && git commit -q -m "eval fixture: gh shim"
BIN_DIR="$PWD/.bin"
for RC in "$HOME/.bashrc" "$HOME/.zshrc"; do
  touch "$RC"
  if ! grep -qF "$BIN_DIR" "$RC" 2>/dev/null; then
    echo "export PATH=\"$BIN_DIR:\$PATH\"" >> "$RC"
  fi
done
export PATH="$BIN_DIR:$PATH"
