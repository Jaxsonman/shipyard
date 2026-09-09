#!/usr/bin/env bash
# Scaffold for duplicate-prd-rerun-refuses: a scratch repo already
# configured for the github backend, plus a fake `gh` on PATH so the run
# stays fully offline. `gh issue list ... --state all ...` returns one
# existing open issue whose body already contains the literal line
# `Source PRD: 2026-08-01-widget` (contract §13's duplicate-detection
# marker). Per SKILL.md Step 4, the assistant must locally filter for that
# exact body line, report it under "Already exists", and get user approval
# before creating anything else for this PRD — never silently recreate the
# full ticket set.
#
# Deterministic and fully offline: `owner/repo` is a fake placeholder
# target, never Jaxsonman/shipyard-e2e, and no real network call is made.
set -euo pipefail

git init -q .
git config user.email "eval@example.com"
git config user.name "Eval Runner"

mkdir -p docs/prd .claude

cat > docs/prd/2026-08-01-widget.md <<'EOF'
# Widget Dashboard

## Problem

Users have no way to see their widgets in one place.

## Requirements

- A dashboard page listing all of a user's widgets.
- Users can create a new widget from the dashboard.
- Users can archive a widget they no longer need.

## Out of scope

Widget sharing between users.
EOF

cat > .claude/kanban.config.json <<'EOF'
{
  "version": 1,
  "backend": "github",
  "target": "owner/repo"
}
EOF

# --- fake `gh` on PATH -------------------------------------------------
# Implements exactly the subcommands SKILL.md/references/github.md call
# during a kanban run against a repo that already has one ticket for this
# PRD's slug. Anything unimplemented falls through and fails loudly, which
# doubles as a signal if the skill starts calling something unexpected.
mkdir -p bin
cat > bin/gh <<'SHIM'
#!/usr/bin/env bash
# Fake `gh` for the duplicate-prd-rerun-refuses eval case.
#   --version                              -> ok
#   auth status                            -> ok, already authenticated
#   repo view owner/repo                   -> ok, repo readable
#   issue list --state all ...             -> one existing issue whose body
#                                              contains the literal line
#                                              "Source PRD: 2026-08-01-widget"
#   issue list --state open ...            -> same single open issue
#   issue view <n> ...                     -> confirms issue #101 exists
#   issue create ...                       -> intentionally NOT implemented;
#                                              this case's grader asserts it
#                                              is never called, so a call
#                                              reaching here is a test failure
#                                              and exits non-zero on purpose.
case "$1" in
  --version)
    echo "gh version 2.99.9 (eval-shim)"
    exit 0
    ;;
  auth)
    [ "$2" = "status" ] && { echo "eval-shim: Logged in to github.com as eval-bot"; exit 0; }
    ;;
  repo)
    if [ "$2" = "view" ]; then
      echo '{"name":"repo","owner":{"login":"owner"}}'
      exit 0
    fi
    ;;
  issue)
    case "$2" in
      list)
        cat <<'JSON'
[
  {
    "number": 101,
    "title": "User can view their widget dashboard",
    "url": "https://github.com/owner/repo/issues/101",
    "body": "## Description\n\nUsers can see all their widgets in one place.\n\n## Acceptance Criteria\n\n1. Dashboard lists all widgets.\n\n## How to verify\n\nLog in and view the dashboard.\n\n---\nSource PRD: 2026-08-01-widget"
  }
]
JSON
        exit 0
        ;;
      view)
        echo '{"number":101,"title":"User can view their widget dashboard","state":"OPEN"}'
        exit 0
        ;;
      create)
        echo "gh eval-shim: issue create is not implemented for this case (should not be called)" >&2
        exit 1
        ;;
    esac
    ;;
esac
echo "gh eval-shim: unexpected call for this case: gh $*" >&2
exit 1
SHIM
chmod +x bin/gh

# The eval harness runs scaffold_script once, before the agent, in this
# case directory. Prepending bin/ to PATH here relies on the harness
# carrying this exported PATH into the agent's shell environment (the
# documented mechanism for putting a case-local shim "earlier on PATH").
export PATH="$PWD/bin:$PATH"

git add -A
git commit -q -m "eval fixture: configured repo, widget PRD, one existing Source PRD ticket"
