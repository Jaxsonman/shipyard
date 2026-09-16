#!/usr/bin/env bash
# devQaCap is set to 2 so guard A's escalation and the qa-cap terminal
# land in the same fixture without needing a round 3. Round 1 and round
# 2 both FAIL with the SAME finding id (qa-1-1 -- qa-orchestrator's id
# stability rule keeps an unresolved defect's id unchanged across
# rounds), but round 2's evidence path differs from round 1's (a fresh
# screenshot each time). Per running-forge SKILL.md Step 3, guard B now
# compares findings[] EXACTLY, including evidence paths, so a differing
# path means guard B does NOT fire here -- and per Step 3's ordering
# (both guards run before the cap check), guard B not firing is exactly
# what lets N == devQaCap fall through to cause `qa-cap` instead of
# guard B's `no-progress` overriding it. loop-guard-b-early-stop is the
# separate scenario where the paths (and everything else) match exactly.
set -euo pipefail

git init -q
git config user.email "eval@example.com"
git config user.name "Eval Runner"
git symbolic-ref HEAD refs/heads/main
MAIN_ROOT="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")"
REPO_DIR="$(basename "$MAIN_ROOT")"

mkdir -p .claude .forge/flaky-summary/context

cat > .claude/forge.config.json <<'EOF'
{"version": 1, "baseBranch": "main", "devQaCap": 2}
EOF

cat > .forge/flaky-summary/intent.md <<'EOF'
---
slug: flaky-summary
status: approved
baseBranch: main
created: 2026-09-15
---

# Intent: flaky-summary

## Problem

The order summary page sometimes shows a stale total after a coupon is applied.

## Desired outcome

The summary total always reflects the currently applied coupon.

## Done means

- Applying a coupon updates the summary total within one render.

## Constraints

No new dependencies.

## Context

None.

## Out of scope

Stacking multiple coupons.

## How to run

npm install && npm test
EOF

git add -A
git commit -q -m "eval fixture: approved intent for flaky-summary"

ORIGIN_DIR="$(mktemp -d)/origin.git"
git init -q --bare "$ORIGIN_DIR"
git remote add origin "$ORIGIN_DIR"
git push -q origin main

EXCLUDE="$(git rev-parse --path-format=absolute --git-common-dir)/info/exclude"
echo ".forge/" >> "$EXCLUDE"

WORKTREE="$(dirname "$MAIN_ROOT")/${REPO_DIR}-forge/flaky-summary"
git worktree add -q -b forge/flaky-summary "$WORKTREE" main

pushd "$WORKTREE" >/dev/null

# .forge/flaky-summary/intent.md and context/ are already tracked in
# this worktree -- they were committed on main above, before the
# exclude rule was added, and `git worktree add ... main` checked them
# out along with everything else main had at that commit. No separate
# copy-and-recommit is needed (or possible: it would be a no-op commit,
# which fails under `set -e`).

echo "// attempt 1" > src-summary-attempt1.js
git add src-summary-attempt1.js
git commit -q -m "feat(flaky-summary): attempt 1 at summary recompute"
COMMIT_1="$(git rev-parse HEAD)"

mkdir -p .forge/flaky-summary/run/round-1/qa .forge/flaky-summary/run/round-2/qa

cat > .forge/flaky-summary/run/round-1/dev-handoff.json <<EOF
{
  "version": 1,
  "round": 1,
  "commit": "$COMMIT_1",
  "summary": "Attempted to recompute the summary total on coupon apply.",
  "filesChanged": ["src-summary-attempt1.js"],
  "testsAdded": [],
  "howToRun": "npm install && npm test",
  "selfCheck": {"suite": "fail", "lint": "pass", "typecheck": "absent"},
  "deferred": [],
  "fixListAddressed": []
}
EOF

cat > .forge/flaky-summary/run/round-1/qa/report.json <<'EOF'
{
  "version": 1,
  "round": 1,
  "verdict": "FAIL",
  "findings": [
    {
      "id": "qa-1-1",
      "severity": "blocking",
      "criterion": "Applying a coupon updates the summary total within one render.",
      "repro": ["Apply coupon SAVE10", "Observe the total does not change on the first render"],
      "evidence": [{"kind": "screenshot", "path": "round-1/qa/verifier-1/screenshots/f1.png"}]
    }
  ],
  "unverified": [],
  "observations": [],
  "verifierFiles": ["round-1/qa/verifier-1.json"]
}
EOF

echo "// attempt 2 (still wrong)" > src-summary-attempt2.js
git add src-summary-attempt2.js
git commit -q -m "fix(flaky-summary): attempt 2 at summary recompute [qa-1-1]"
COMMIT_2="$(git rev-parse HEAD)"

cat > .forge/flaky-summary/run/round-2/dev-handoff.json <<EOF
{
  "version": 1,
  "round": 2,
  "commit": "$COMMIT_2",
  "summary": "Second attempt at recomputing the summary total; still not reflecting the coupon in time.",
  "filesChanged": ["src-summary-attempt2.js"],
  "testsAdded": [],
  "howToRun": "npm install && npm test",
  "selfCheck": {"suite": "fail", "lint": "pass", "typecheck": "absent"},
  "deferred": [],
  "fixListAddressed": ["qa-1-1"]
}
EOF

# Same finding id (qa-1-1, per the stability rule), different evidence
# text/path this round -> guard A (id-set equality) fires, guard B
# (byte-identical) does not.
cat > .forge/flaky-summary/run/round-2/qa/report.json <<'EOF'
{
  "version": 1,
  "round": 2,
  "verdict": "FAIL",
  "findings": [
    {
      "id": "qa-1-1",
      "severity": "blocking",
      "criterion": "Applying a coupon updates the summary total within one render.",
      "repro": ["Apply coupon SAVE10", "Observe the total does not change on the first render"],
      "evidence": [{"kind": "screenshot", "path": "round-2/qa/verifier-1/screenshots/f1-round2.png"}]
    }
  ],
  "unverified": [],
  "observations": [],
  "verifierFiles": ["round-2/qa/verifier-1.json"]
}
EOF

popd >/dev/null

mkdir -p .forge/flaky-summary/run
cat > .forge/flaky-summary/run/state.json <<EOF
{
  "version": 1,
  "slug": "flaky-summary",
  "phase": "dev",
  "devRound": 0,
  "reviewRound": 0,
  "escalated": false,
  "pendingFix": null,
  "regressionPass": false,
  "reviewPending": false,
  "branch": "forge/flaky-summary",
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
  echo "https://github.com/eval-org/eval-repo/pull/103"
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
