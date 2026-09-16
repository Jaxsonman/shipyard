#!/usr/bin/env bash
# Deterministic and fully offline: a local bare repo stands in for
# `origin` (matches plugins/pr/evals/*/setup.sh's pattern), and a `gh`
# shim answers auth/repo/pr calls. Every round-1 artifact (dev handoff,
# QA report, review) is pre-seeded as fixture JSON so running-forge's
# idempotency rule skips every agent dispatch — this exercises Step 2,
# Step 3 (PASS branch), Step 4, Step 5 (APPROVE branch), and Terminal
# (ready) purely by reading fixtures forward from state.phase="qa".
set -euo pipefail

git init -q
git config user.email "eval@example.com"
git config user.name "Eval Runner"
git symbolic-ref HEAD refs/heads/main
MAIN_ROOT="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")"
REPO_DIR="$(basename "$MAIN_ROOT")"

mkdir -p .forge/empty-cart-badge/context

cat > .forge/empty-cart-badge/intent.md <<'EOF'
---
slug: empty-cart-badge
status: approved
baseBranch: main
created: 2026-09-15
---

# Intent: empty-cart-badge

## Problem

The cart icon shows no distinction between an empty cart and one item.

## Desired outcome

The cart icon shows a small badge with the item count, hidden when empty.

## Done means

- The cart icon shows a numeric badge equal to the item count.
- The badge is hidden entirely when the cart is empty.

## Constraints

No new dependencies.

## Context

None.

## Out of scope

Cart contents preview on hover.

## How to run

npm install && npm test
EOF

git add -A
git commit -q -m "eval fixture: approved intent for empty-cart-badge"

ORIGIN_DIR="$(mktemp -d)/origin.git"
git init -q --bare "$ORIGIN_DIR"
git remote add origin "$ORIGIN_DIR"
git push -q origin main

EXCLUDE="$(git rev-parse --path-format=absolute --git-common-dir)/info/exclude"
echo ".forge/" >> "$EXCLUDE"

WORKTREE="$(dirname "$MAIN_ROOT")/${REPO_DIR}-forge/empty-cart-badge"
git worktree add -q -b forge/empty-cart-badge "$WORKTREE" main

pushd "$WORKTREE" >/dev/null

# .forge/empty-cart-badge/intent.md and context/ are already tracked in
# this worktree -- they were committed on main above, before the
# exclude rule was added, and `git worktree add ... main` checked them
# out along with everything else main had at that commit. No separate
# copy-and-recommit is needed (or possible: it would be a no-op commit,
# which fails under `set -e`).

mkdir -p src/cart
cat > src/cart/Badge.jsx <<'EOF'
export function CartBadge({ count }) {
  if (count <= 0) return null;
  return <span className="cart-badge">{count}</span>;
}
EOF
git add src/cart/Badge.jsx
git commit -q -m "feat(empty-cart-badge): add empty state badge to cart icon"
COMMIT_SHA="$(git rev-parse HEAD)"

mkdir -p .forge/empty-cart-badge/run/round-1/qa .forge/empty-cart-badge/run/review-1

cat > .forge/empty-cart-badge/run/round-1/dev-handoff.json <<EOF
{
  "version": 1,
  "round": 1,
  "commit": "$COMMIT_SHA",
  "summary": "Added a numeric badge to the cart icon, hidden when the cart is empty.",
  "filesChanged": ["src/cart/Badge.jsx"],
  "testsAdded": ["src/cart/Badge.test.jsx: shows count when > 0", "src/cart/Badge.test.jsx: hidden when count is 0"],
  "howToRun": "npm install && npm test",
  "selfCheck": {"suite": "pass", "lint": "pass", "typecheck": "absent"},
  "deferred": [],
  "fixListAddressed": []
}
EOF

cat > .forge/empty-cart-badge/run/round-1/qa/report.json <<'EOF'
{
  "version": 1,
  "round": 1,
  "verdict": "PASS",
  "findings": [],
  "unverified": [],
  "observations": ["Nice to have: an aria-label announcing the count for screen readers."],
  "verifierFiles": ["round-1/qa/verifier-1.json", "round-1/qa/verifier-2.json", "round-1/qa/verifier-3.json"]
}
EOF

cat > .forge/empty-cart-badge/run/review-1/review.json <<'EOF'
{
  "version": 1,
  "round": 1,
  "verdict": "APPROVE",
  "findings": [
    {"id": "rv-1-1", "blocking": false, "file": "src/cart/Badge.jsx", "line": 2, "principle": "naming", "summary": "Prop name `count` is fine but a JSDoc comment would help.", "suggestion": "Add a one-line JSDoc comment above the component."}
  ]
}
EOF

popd >/dev/null

mkdir -p .forge/empty-cart-badge/run
cat > .forge/empty-cart-badge/run/state.json <<EOF
{
  "version": 1,
  "slug": "empty-cart-badge",
  "phase": "qa",
  "devRound": 1,
  "reviewRound": 0,
  "escalated": false,
  "pendingFix": null,
  "regressionPass": false,
  "reviewPending": false,
  "branch": "forge/empty-cart-badge",
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
  echo "https://github.com/eval-org/eval-repo/pull/101"
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
