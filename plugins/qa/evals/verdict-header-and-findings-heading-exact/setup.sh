#!/usr/bin/env bash
set -euo pipefail

git init -q
git config user.email "eval@example.com"
git config user.name "Eval Runner"

mkdir -p .claude docs/ship/9 .bin

cat > .claude/kanban.config.json <<'EOF'
{
  "version": 1,
  "backend": "github",
  "target": "acme/widgets"
}
EOF

# Confirmed `qa` block, CLI-only app — no browser/port needed, so bring-up
# and per-criterion E2E stay fully deterministic for the eval.
cat > .claude/ship.config.json <<'EOF'
{
  "version": 1,
  "baseBranch": "main",
  "loopCap": 3,
  "approvers": [],
  "qa": {
    "setup": "true",
    "seed": "true",
    "run": "true",
    "test": "node test.js",
    "health": "http://localhost:{PORT}/",
    "basePort": 41200,
    "envFile": ".env.qa.local",
    "requiredEnv": [],
    "e2e": "cli"
  }
}
EOF
touch .env.qa.local
echo ".env.qa.local" >> .gitignore

cat > docs/ship/9/spec.md <<'EOF'
## Problem

Cart totals do not support percentage discount codes.

## Done means

1. Applying a 10% discount code to a $100.00 cart yields a $90.00 total.

## UX intent

Discount applies immediately when a valid code is entered; no page reload.

## Edge cases & failure modes

- A 0% discount leaves the total unchanged.

## Context for implementation

Pure function `applyDiscount(total, percent)` in `discount.js`.

## Out of scope

- Stacking multiple discount codes.
EOF

# main: correct implementation + passing test, so the merge-base
# classification run (Step 5 of the skill) genuinely passes here.
cat > discount.js <<'EOF'
function applyDiscount(total, percent) {
  return Math.round((total - (total * percent) / 100) * 100) / 100;
}

module.exports = { applyDiscount };
EOF

cat > test.js <<'EOF'
const assert = require("assert");
const { applyDiscount } = require("./discount");

assert.strictEqual(applyDiscount(100, 10), 90);
assert.strictEqual(applyDiscount(100, 0), 100);

console.log("2 passed, 0 failed");
EOF

git add -A
git commit -q -m "chore: seed ticket 9 spec + correct discount baseline"

# feature branch: introduces a genuine regression — percent is applied as
# a flat subtraction instead of a percentage, so 10% off $100 yields $10.00
# instead of $90.00. This fails deterministically on the branch AND passes
# at the merge-base (main), so QA's classification step (Step 5) counts it
# as a real regression, not pre-existing — guaranteeing a FAIL verdict.
git checkout -q -b feat/9-add-discount-code
cat > discount.js <<'EOF'
function applyDiscount(total, percent) {
  // BUG: divides by 1000 instead of 100, so a 10% discount on $100
  // only knocks a dime off instead of ten dollars ($100 -> $99.90
  // instead of $90.00). Deliberately wrong, deterministically so.
  return Math.round((total - (total * percent) / 1000) * 100) / 100;
}

module.exports = { applyDiscount };
EOF
git add -A
git commit -q -m "feat(9): add percentage discount codes"

# gh shim: offline, answers ticket 9 and accepts a comment post. Never
# talks to the real Jaxsonman/shipyard-e2e repo.
cat > .bin/gh <<'EOF'
#!/usr/bin/env bash
if [ "$1" = "auth" ] && [ "$2" = "status" ]; then
  echo "Logged in to github.com as eval-runner" >&2
  exit 0
fi
if [ "$1" = "issue" ] && [ "$2" = "view" ]; then
  cat <<'JSON'
{
  "number": 9,
  "title": "Add percentage discount codes",
  "body": "As a user I want to apply a percentage discount code at checkout.",
  "labels": [],
  "url": "https://github.com/acme/widgets/issues/9",
  "comments": []
}
JSON
  exit 0
fi
if [ "$1" = "issue" ] && [ "$2" = "comment" ]; then
  echo "https://github.com/acme/widgets/issues/9#issuecomment-1"
  exit 0
fi
echo "gh: unhandled invocation: $*" >&2
exit 1
EOF
chmod +x .bin/gh
