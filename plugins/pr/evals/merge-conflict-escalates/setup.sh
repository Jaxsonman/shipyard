#!/usr/bin/env bash
# Scaffold for merge-conflict-escalates: ticket 42 carries `ship:approved`
# (pr-gate passes, mode "open"), but `feat/42-*` no longer merges cleanly
# into `origin/main` — a real `git merge-tree --write-tree` conflict, not a
# mocked one, since Step 3 of opening-prs/SKILL.md runs that command for
# real against whatever checkout the agent resolves.
#
# Deterministic and fully offline: a local bare repo stands in for `origin`
# and `gh` is a shim on PATH. Never touches Jaxsonman/shipyard-e2e or any
# real network.
set -euo pipefail

git init -q .
git config user.email "eval@example.com"
git config user.name "Eval Runner"
git symbolic-ref HEAD refs/heads/main

mkdir -p .claude docs/ship/42

cat > .claude/kanban.config.json <<'EOF'
{
  "version": 1,
  "backend": "github",
  "target": "acme/widgets"
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

mkdir -p src/reports
cat > src/reports/Reports.tsx <<'EOF'
export function Reports() {
  return <div className="reports">Reports</div>;
}
EOF

cat > docs/ship/42/spec.md <<'EOF'
## Problem

Reports can only be viewed on-screen; there is no way to export them.

## Done means

1. A logged-in user can click "Export CSV" on the reports page and receive
   a downloaded CSV of the current report's rows.

## Context for implementation

Reports page component is `src/reports/Reports.tsx`.
EOF

cat > docs/ship/42/plan.md <<'EOF'
1. Add an "Export CSV" button to `src/reports/Reports.tsx`.
2. Serialize the current report rows to CSV client-side.
EOF

git add -A
git commit -q -m "chore: seed ticket 42 spec + plan"

ORIGIN_DIR="$(mktemp -d)/origin.git"
git init -q --bare "$ORIGIN_DIR"
git remote add origin "$ORIGIN_DIR"
git push -q origin main

# The feature branch, pushed, touching the same line `main` later changes.
git checkout -q -b feat/42-csv-export
cat > src/reports/Reports.tsx <<'EOF'
export function Reports() {
  return <div className="reports">Reports (CSV export pending)</div>;
}
EOF
git add -A
git commit -q -m "feat(42): stub csv export button"
git push -q -u origin feat/42-csv-export

# Advance origin/main past the branch point with a conflicting edit to the
# same line, so `git merge-tree --write-tree origin/main feat/42-csv-export`
# genuinely reports CONFLICT — no mocking of git itself.
git checkout -q main
cat > src/reports/Reports.tsx <<'EOF'
export function Reports() {
  return <div className="reports">Reports (redesigned)</div>;
}
EOF
git add -A
git commit -q -m "refactor: redesign reports header on main"
git push -q origin main

# --- fake `gh` on PATH -----------------------------------------------------
# Handles: --version / auth status / repo view (pass), `issue view --json
# labels` -> ship:approved (mode "open"), `pr list` -> none open, `issue
# comment` (posts the escalation) and `issue edit --add-label
# ship:needs-human --remove-label ship:approved` (the label swap). Also
# handles `label create` idempotently, since the skill creates the label
# before applying it. No `pr create` and no second `git push` should ever
# happen in this case; anything unhandled falls to `*)` and fails loudly.
mkdir -p bin
cat > bin/gh <<'SHIM'
#!/usr/bin/env bash
set -euo pipefail

if [ "$1" = "--version" ]; then
  echo "gh version 2.99.9 (eval-shim)"
  exit 0
fi

case "$1 $2" in
  "auth status")
    echo "eval-shim: Logged in to github.com as eval-bot" >&2
    exit 0
    ;;
  "repo view")
    echo '{"nameWithOwner":"acme/widgets"}'
    exit 0
    ;;
  "issue view")
    args="$*"
    if [[ "$args" == *"--json labels"* ]]; then
      echo '{"labels":[{"name":"ship:approved"}]}'
      exit 0
    fi
    cat <<'JSON'
{"number":42,"title":"Add CSV export to reports page","body":"See docs/ship/42/spec.md","labels":[{"name":"ship:approved"}],"state":"open","url":"https://github.com/acme/widgets/issues/42","comments":[]}
JSON
    exit 0
    ;;
  "pr list")
    echo "[]"
    exit 0
    ;;
  "issue comment")
    echo "https://github.com/acme/widgets/issues/42#issuecomment-1"
    exit 0
    ;;
  "issue edit")
    exit 0
    ;;
  "label create")
    exit 0
    ;;
  "api user")
    echo "eval-bot"
    exit 0
    ;;
esac

echo "gh eval-shim: unexpected call for this case: gh $*" >&2
exit 1
SHIM
chmod +x bin/gh

export PATH="$PWD/bin:$PATH"

git add -A
git commit -q -m "eval fixture: gh shim"
