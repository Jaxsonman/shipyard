#!/usr/bin/env bash
# Scaffold for vertical-slice-ticket-shape: a fully configured repo with a
# small PRD describing three separable user-facing features, plus a
# permissive fake `gh` on PATH that accepts every call kanban might make
# and echoes back plausible JSON. This case grades the *shape* of the
# proposed ticket breakdown (SKILL.md Step 3), not the board-write path,
# so the shim only needs to keep the run from erroring out if the
# assistant probes the board (e.g. "list open tickets" before proposing
# dependencies) — it does not need to be exercised through to ticket
# creation for the grader to have something to evaluate.
#
# Deterministic and fully offline: `owner/repo` is a fake placeholder
# target, never Jaxsonman/shipyard-e2e, and no real network call is made.
set -euo pipefail

git init -q .
git config user.email "eval@example.com"
git config user.name "Eval Runner"

mkdir -p docs/prd .claude

cat > docs/prd/2026-08-01-notifications.md <<'EOF'
# Notifications

## Problem

Users miss important account activity because nothing surfaces it to them.

## Requirements

1. **Email notifications.** When a watched item changes, the user
   receives an email summarizing the change, with a link back into the
   app. Users can turn this off entirely.

2. **In-app notification bell.** A bell icon in the header shows an
   unread count and opens a dropdown listing recent notifications, each
   linking to the relevant item. Reading a notification clears its
   unread state.

3. **Notification preferences page.** A dedicated settings page lets
   users choose, per notification type, whether they want email,
   in-app, both, or neither. Changes take effect immediately for future
   notifications.

## Out of scope

Push notifications to mobile devices. SMS notifications.
EOF

cat > .claude/kanban.config.json <<'EOF'
{
  "version": 1,
  "backend": "github",
  "target": "owner/repo"
}
EOF

# --- fake `gh` on PATH -------------------------------------------------
# Accepts every subcommand SKILL.md/references/github.md can call during a
# kanban run on a repo with no prior tickets, and echoes back plausible
# JSON (incrementing issue numbers/URLs on create) so the run does not
# error out however far the assistant proceeds.
mkdir -p bin
cat > bin/gh <<'SHIM'
#!/usr/bin/env bash
# Fake `gh` for the vertical-slice-ticket-shape eval case. Accepts calls
# and echoes back plausible JSON; keeps a counter file for issue numbers
# so repeated `issue create` calls get distinct numbers/URLs.
COUNTER_FILE="$(dirname "$0")/.issue-counter"
next_issue_number() {
  local n=1
  [ -f "$COUNTER_FILE" ] && n="$(cat "$COUNTER_FILE")"
  echo "$n" > "$COUNTER_FILE"
  echo $((n + 1)) > "$COUNTER_FILE"
  echo "$n"
}

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
        # No prior tickets on this fresh repo: empty list either way
        # (duplicate-detection scan or open-tickets-for-dependencies scan).
        echo '[]'
        exit 0
        ;;
      view)
        echo '{"number":0,"title":"unknown","state":"OPEN"}'
        exit 0
        ;;
      create)
        n="$(next_issue_number)"
        echo "https://github.com/owner/repo/issues/${n}"
        exit 0
        ;;
    esac
    ;;
  label)
    if [ "$2" = "create" ]; then
      echo "eval-shim: label created (no-op)"
      exit 0
    fi
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
git commit -q -m "eval fixture: configured repo, notifications PRD, empty board"
