#!/usr/bin/env bash
# Scaffold for not-planned-refuses: ticket #42 carries ship:specced (Spec'd),
# not ship:planned. SKILL.md Step 3 gate 2 (ticket status) must refuse with
# "run /plan <id>" — a report, not a dispatch — before Step 4 (branch/
# worktree) or Step 5 (the dev/qa loop) ever runs. Fully offline: a fake
# `gh` shim answers every call ship's Step 1-3 needs and nothing else;
# never touches Jaxsonman/shipyard-e2e or any real network.
set -euo pipefail

git init -q .
git config user.email "eval@example.com"
git config user.name "Eval Runner"

mkdir -p .claude "docs/ship/42"

cat > .claude/kanban.config.json <<'EOF'
{
  "version": 1,
  "backend": "github",
  "target": "eval-org/eval-repo"
}
EOF

# ship.config.json is present with a valid `qa` block so the ONLY failing
# gate in Step 3 is ticket status — the QA-readiness gate (Step 3.1) must
# not also fire and confound the grader.
cat > .claude/ship.config.json <<'EOF'
{
  "version": 1,
  "baseBranch": "main",
  "loopCap": 3,
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

# spec.md exists (Spec'd already happened) but plan.md does not — this is
# exactly the Spec'd-not-Planned state Step 3.2 refuses with "run /plan 42".
cat > docs/ship/42/spec.md <<'EOF'
## Problem

Users cannot filter the widget list by status.

## Done means

- A status filter control appears above the widget list.
- Selecting a status re-queries and re-renders the list.

## Explicitly out of scope

- Saved filter presets.

## Key decisions and edge cases

- Filter state does not persist across reloads.

## Context a dev agent needs

- The list component lives at src/components/WidgetList.tsx.
EOF

git add -A
git commit -q -m "eval fixture: ticket 42 spec approved, not yet planned"

# --- fake `gh` on PATH -------------------------------------------------
# Answers only what preflight.js (--stage ship) and shipping-tickets Step 3
# need: --version, auth status, repo view, and a single issue-view fetch
# for #42 carrying label ship:specced. No board-write, comment, or agent-
# dispatch call is expected in this case — the run should refuse before
# ever reaching Step 4 — so anything else falls through to the failing
# default branch, which is exactly what the tool_used grader checks never
# gets exercised as a dev/qa dispatch.
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

if [ "$1" = "issue" ] && [ "$2" = "view" ] && [ "$3" = "42" ]; then
  cat <<'JSON'
{
  "number": 42,
  "title": "Filter widgets by status",
  "body": "Depends on: none",
  "labels": [{"name": "ship:specced"}],
  "state": "open",
  "url": "https://github.com/eval-org/eval-repo/issues/42",
  "comments": [
    {
      "author": {"login": "eval-bot"},
      "createdAt": "2026-08-20T10:00:00Z",
      "body": "ship:spec approved\n\n📋 Spec approved — `docs/ship/42/spec.md`\n\n- Done means a status filter control is present\n- No saved presets in v1\n- No persistence across reloads\n\nNext: /plan 42"
    }
  ]
}
JSON
  exit 0
fi

if [ "$1" = "issue" ] && [ "$2" = "list" ]; then
  echo "[]"
  exit 0
fi

echo "gh eval-shim: unexpected call for this case: gh $*" >&2
exit 1
SHIM
chmod +x bin/gh

export PATH="$PWD/bin:$PATH"
