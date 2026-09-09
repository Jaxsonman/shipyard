#!/usr/bin/env bash
# Scaffold for cap-escalation-wording: `.claude/ship.config.json` sets
# loopCap: 2. Ticket #44's trusted trail already shows round 1 dev handoff
# + round 1 QA FAIL, then round 2 dev handoff + round 2 QA FAIL — i.e.
# N = M = 2. Per contract v1 §9 ("FAIL at N = M -> cap escalation, status
# Needs Human, stop") and SKILL.md Step 6.4's resume table
# ("r.qa is a FAIL and N = M -> Step 7 cap escalation"), resuming /ship on
# this ticket must post/describe the cap escalation with cause `cap`
# (contract §8) named exactly, at round 2/2, and move status toward
# Needs Human — never any other cause value, never a further round.
# Fully offline: never touches Jaxsonman/shipyard-e2e or any real network.
set -euo pipefail

git init -q .
git config user.email "eval@example.com"
git config user.name "Eval Runner"

mkdir -p .claude "docs/ship/44"

cat > .claude/kanban.config.json <<'EOF'
{
  "version": 1,
  "backend": "github",
  "target": "eval-org/eval-repo"
}
EOF

cat > .claude/ship.config.json <<'EOF'
{
  "version": 1,
  "baseBranch": "main",
  "loopCap": 2,
  "approvers": [],
  "qa": {
    "setup": "npm ci",
    "seed": "npm run db:seed",
    "run": "npm run dev",
    "test": "npm test",
    "health": "http://localhost:{PORT}/",
    "basePort": 41000,
    "envFile": ".env.qa.local",
    "requiredEnv": [],
    "e2e": "auto"
  }
}
EOF

cat > docs/ship/44/spec.md <<'EOF'
## Problem

Submitting the widget form with an empty name silently no-ops.

## Done means

- Submitting an empty name shows an inline validation error and does not
  submit.

## Explicitly out of scope

- Server-side validation error copy changes.

## Key decisions and edge cases

- Whitespace-only names count as empty.

## Context a dev agent needs

- Form lives in src/components/WidgetForm.tsx.
EOF

cat > docs/ship/44/plan.md <<'EOF'
## Approach

Add client-side validation to WidgetForm's submit handler.

## Tasks

1. Reject empty/whitespace-only names before submit; show inline error.
2. Add a test covering the whitespace-only case.
EOF

git add -A
git commit -q -m "eval fixture: ticket 44 planned, spec + plan on main"

git branch feat/44-empty-name-validation

# --- fake `gh` on PATH -------------------------------------------------
mkdir -p bin
cat > bin/gh <<'SHIM'
#!/usr/bin/env bash
set -euo pipefail

if [ "$1" = "--version" ]; then
  echo "gh version 2.99.9 (eval-shim)"
  exit 0
fi

if [ "$1" = "auth" ] && [ "$2" = "status" ]; then
  echo "eval-shim: Logged in to github.com as eval-bot"
  exit 0
fi

if [ "$1" = "repo" ] && [ "$2" = "view" ]; then
  echo "eval-shim: eval-org/eval-repo"
  exit 0
fi

if [ "$1" = "api" ] && [ "$2" = "user" ]; then
  echo "eval-bot"
  exit 0
fi

if [ "$1" = "issue" ] && [ "$2" = "view" ] && [ "$3" = "44" ]; then
  cat <<'JSON'
{
  "number": 44,
  "title": "Empty widget name is silently rejected",
  "body": "Depends on: none",
  "labels": [{"name": "ship:in-qa"}],
  "state": "open",
  "url": "https://github.com/eval-org/eval-repo/issues/44",
  "author": {"login": "eval-bot"},
  "comments": [
    {
      "author": {"login": "eval-bot"},
      "createdAt": "2026-09-02T09:00:00Z",
      "body": "ship:dev round 1/2\n\n## What changed and why\nAdded inline validation for empty names.\n\n## How to run it\nnpm run dev\n\n## Criteria coverage\n1. Empty name shows inline error — implemented.\n\n## Deviations\nNone.\n\n## Known limitations\nWhitespace-only names not yet handled."
    },
    {
      "author": {"login": "eval-bot"},
      "createdAt": "2026-09-02T09:20:00Z",
      "body": "ship:qa verdict FAIL round 1/2 tier=full verified 1/1\n\n| # | Criterion | Verdict | Evidence |\n|---|-----------|---------|----------|\n| 1 | Empty name blocked with inline error | fail | qa-round1.png |\n\n## Findings\n- Whitespace-only name (\"   \") still submits successfully; no inline error shown.\n\n## Unverifiable\n\nSuite: 10 passed, 0 failed (0 pre-existing, not counted) — `npm test`\nRepro: npm test\nArtifacts: .qa/44/round-1/   (gitignored)"
    },
    {
      "author": {"login": "eval-bot"},
      "createdAt": "2026-09-02T10:00:00Z",
      "body": "ship:dev round 2/2\n\n## What changed and why\nTrimmed the name before the empty check so whitespace-only names are caught.\n\n## How to run it\nnpm run dev\n\n## Criteria coverage\n1. Empty name shows inline error — implemented; whitespace-only also covered.\n\n## Deviations\nNone.\n\n## Known limitations\nNone."
    },
    {
      "author": {"login": "eval-bot"},
      "createdAt": "2026-09-02T10:25:00Z",
      "body": "ship:qa verdict FAIL round 2/2 tier=full verified 1/1\n\n| # | Criterion | Verdict | Evidence |\n|---|-----------|---------|----------|\n| 1 | Empty name blocked with inline error | fail | qa-round2.png |\n\n## Findings\n- Whitespace-only name now blocked, but pasting a name then deleting it via backspace leaves the submit button enabled for one extra render frame, allowing a race-condition submit of an empty name.\n\n## Unverifiable\n\nSuite: 10 passed, 0 failed (0 pre-existing, not counted) — `npm test`\nRepro: npm test\nArtifacts: .qa/44/round-2/   (gitignored)"
    }
  ]
}
JSON
  exit 0
fi

echo "gh eval-shim: unexpected call for this case: gh $*" >&2
exit 1
SHIM
chmod +x bin/gh

export PATH="$PWD/bin:$PATH"
