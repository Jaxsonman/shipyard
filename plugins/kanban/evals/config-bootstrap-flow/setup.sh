#!/usr/bin/env bash
# Scaffold for config-bootstrap-flow: a fresh git repo with NO
# .claude/kanban.config.json, so preflight.js's `config` check is the
# only failing check on `--stage kanban`. This exercises SKILL.md Step 1's
# bootstrap branch: ask backend + target one question at a time, then run
# config.js bootstrap, then re-run preflight.
#
# Deterministic and fully offline: never touches Jaxsonman/shipyard-e2e or
# any real network. This eval turn is single-shot, so it is expected to stop
# at the first bootstrap question rather than complete a real interactive
# interview.
set -euo pipefail

git init -q .
git config user.email "eval@example.com"
git config user.name "Eval Runner"

mkdir -p docs/prd

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

# --- fake `gh` on PATH -------------------------------------------------
# preflight.js's `kanban` stage checks `gh --version` and `gh auth status`
# regardless of whether kanban.config.json exists yet (it defaults to the
# github backend while probing). Without a real `gh`, or with one that
# isn't authenticated in this sandbox, those checks would fail alongside
# `config` and break the "config is the ONLY failing check" precondition
# this case is testing. The shim below always answers success for those
# two subcommands so `config` is deterministically the sole failure.
#
# No board calls (issue list/create) are expected in this case — the run
# should stop at the bootstrap question before ever touching the board —
# so this shim intentionally does not implement them; if a real board
# call were attempted it would fall through to the `*)` branch below and
# fail loudly, which is exactly what the tool_used grader is asserting
# never happens.
mkdir -p bin
cat > bin/gh <<'SHIM'
#!/usr/bin/env bash
case "$1 $2" in
  "--version "*|"--version")
    echo "gh version 2.99.9 (eval-shim)"
    exit 0
    ;;
esac
case "$1" in
  --version)
    echo "gh version 2.99.9 (eval-shim)"
    exit 0
    ;;
  auth)
    if [ "$2" = "status" ]; then
      echo "eval-shim: Logged in to github.com as eval-bot"
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
git commit -q -m "eval fixture: widget PRD, no kanban config"
