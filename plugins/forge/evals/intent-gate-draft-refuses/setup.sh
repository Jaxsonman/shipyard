#!/usr/bin/env bash
set -euo pipefail

git init -q
git config user.email "eval@example.com"
git config user.name "Eval Runner"

mkdir -p .forge/tank-alerts/context

cat > .forge/tank-alerts/intent.md <<'EOF'
---
slug: tank-alerts
status: draft
baseBranch: main
created: 2026-09-15
---

# Intent: tank-alerts

## Problem

Users are not warned when a tank's pH drifts out of range.

## Desired outcome

A visible alert appears when a reading is out of range.

## Done means

- A banner appears when pH is outside the configured safe range.

## Constraints

None.

## Context

None.

## Out of scope

Email notifications.

## How to run

npm install && npm run dev
EOF

git add -A
git commit -q -m "eval fixture: draft (unapproved) intent for tank-alerts"

# Fully offline: /forge must refuse before it ever reaches gh.
mkdir -p .bin
cat > .bin/gh <<'EOF'
#!/usr/bin/env bash
echo "gh eval-shim: unexpected call for this case: gh $*" >&2
exit 1
EOF
chmod +x .bin/gh
git add -A && git commit -q -m "eval fixture: gh shim"
export PATH="$PWD/.bin:$PATH"
