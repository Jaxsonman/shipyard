#!/usr/bin/env bash
set -euo pipefail

# A fully configured repo with ticket #42 already past spec (ship:specced
# label + a valid docs/ship/42/spec.md with every required section, per
# contract §13), so planning-tickets' precondition gate (Step 2) is clear
# and the case exercises Step 7's validate-artifact.js gate specifically.
# A `gh` shim keeps board calls offline and deterministic (see
# plan-missing-spec-refuses/setup.sh for the same pattern).

git init -q
git config user.email "eval@example.com"
git config user.name "Eval Runner"

mkdir -p .claude
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
  "loopCap": 3,
  "approvers": []
}
EOF

mkdir -p docs/ship/42
cat > docs/ship/42/spec.md <<'EOF'
# Spec: Add dark mode toggle

Ticket: https://github.com/eval-org/eval-repo/issues/42 · Date: 2026-09-08 · Source PRD: none

## Problem

Users working at night find the current bright, white-only UI
uncomfortable and it drains OLED battery life on mobile.

## Done means

1. A toggle in account settings switches the UI palette immediately.
2. The chosen preference persists across sessions and page reloads.

## UX intent

The toggle lives in account settings, switches the palette instantly with
no reload, and reflects the persisted preference on next login.

## Edge cases & failure modes

- User has no saved preference yet → default to light.
- Preference write fails → toggle visually reverts and shows an error.

## Context for implementation

Account settings page and its existing preference-persistence pattern;
the `user_preferences` table already stores other per-user settings the
same way.

## Out of scope

- Automatic OS-theme-following dark mode.
EOF

git add -A
git commit -q -m "docs(ship): spec for ticket 42"

# --- fake `gh` on PATH -------------------------------------------------
mkdir -p bin
cat > bin/gh <<'SHIM'
#!/usr/bin/env bash
set -euo pipefail

case "${1:-}" in
  --version)
    echo "gh version 2.40.0 (eval-shim)"
    exit 0
    ;;
  auth)
    if [ "${2:-}" = "status" ]; then
      echo "Logged in to github.com as eval-runner" >&2
      exit 0
    fi
    ;;
  repo)
    if [ "${2:-}" = "view" ]; then
      echo "eval-org/eval-repo"
      exit 0
    fi
    ;;
  issue)
    case "${2:-}" in
      view)
        cat <<'JSON'
{"number":42,"title":"Add dark mode toggle","body":"Users working at night find the current bright UI uncomfortable. Add a toggle in account settings that switches the palette and persists the choice.\n\nSource PRD: none","labels":[{"name":"ship:specced","color":"1D76DB"}],"url":"https://github.com/eval-org/eval-repo/issues/42","comments":[]}
JSON
        exit 0
        ;;
      edit)
        echo "edited issue #${3:-}" >&2
        exit 0
        ;;
      comment)
        echo "posted comment on #${3:-}" >&2
        exit 0
        ;;
      *)
        echo "gh-shim: unhandled issue subcommand: $*" >&2
        exit 1
        ;;
    esac
    ;;
  label)
    exit 0
    ;;
  *)
    echo "gh-shim: unhandled invocation: gh $*" >&2
    exit 1
    ;;
esac
SHIM
chmod +x bin/gh

REPO_BIN="$(pwd)/bin"
for rc in "$HOME/.bashrc" "$HOME/.zshrc"; do
  touch "$rc"
  echo "export PATH=\"$REPO_BIN:\$PATH\"" >> "$rc"
done

git add -A
git commit -q -m "chore: add eval gh shim"
