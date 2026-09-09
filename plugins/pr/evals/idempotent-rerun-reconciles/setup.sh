#!/usr/bin/env bash
# Scaffold for idempotent-rerun-reconciles: ticket 42 already carries
# `ship:pr-open` (a previous /pr run got far enough to open the PR and
# swap the label, but a repost is being tested), and `gh pr list` reports
# an open PR for `feat/42-*`. preflight.js's `pr-gate` check reports
# `mode: "reconcile"` for this state, which per opening-prs/SKILL.md Step 1
# means: skip straight to Step 4 — no merge-check, no push, no second PR.
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

git checkout -q -b feat/42-csv-export
cat > src/reports/Reports.tsx <<'EOF'
export function Reports() {
  return (
    <div className="reports">
      Reports
      <button onClick={() => {}}>Export CSV</button>
    </div>
  );
}
EOF
git add -A
git commit -q -m "feat(42): csv export button"
git push -q -u origin feat/42-csv-export
git checkout -q main

# --- fake `gh` on PATH -----------------------------------------------------
# Ticket 42 already carries ship:pr-open (a prior run got the PR open).
# `pr list` reports it as open. `issue view --json comments,...` (the
# board-trail.js fetch used by Step 4's reconcile) returns no trusted
# `ship:pr opened <url>` comment yet, so the skill is expected to post one
# — but it must never call `pr create` or `git push` again, and must
# report PR #7's URL. `label create`/`issue edit` are accepted no-ops in
# case the skill re-applies the (already correct) label defensively.
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
      echo '{"labels":[{"name":"ship:pr-open"}]}'
      exit 0
    fi
    if [[ "$args" == *"comments"* ]]; then
      cat <<'JSON'
{"number":42,"title":"Add CSV export to reports page","author":{"login":"eval-bot"},"labels":[{"name":"ship:pr-open"}],"state":"open","url":"https://github.com/acme/widgets/issues/42","comments":[]}
JSON
      exit 0
    fi
    cat <<'JSON'
{"number":42,"title":"Add CSV export to reports page","body":"See docs/ship/42/spec.md","labels":[{"name":"ship:pr-open"}],"state":"open","url":"https://github.com/acme/widgets/issues/42","comments":[]}
JSON
    exit 0
    ;;
  "pr list")
    cat <<'JSON'
[{"url":"https://github.com/acme/widgets/pull/7","number":7,"title":"Add CSV export to reports page"}]
JSON
    exit 0
    ;;
  "issue comment")
    echo "https://github.com/acme/widgets/issues/42#issuecomment-2"
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
