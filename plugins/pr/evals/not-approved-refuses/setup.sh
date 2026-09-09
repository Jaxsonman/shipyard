#!/usr/bin/env bash
# Scaffold for not-approved-refuses: ticket 42 carries `ship:awaiting-review`,
# not `ship:approved`. preflight.js's `pr-gate` check (opening-prs/SKILL.md
# Step 1) is the only failing check — everything else (config, gh, branch,
# worktree) is deliberately made to pass so the refusal is unambiguously
# about the missing approval gate, not noise from an unrelated failure.
#
# Deterministic and fully offline: a local bare repo stands in for `origin`,
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

cat > docs/ship/42/spec.md <<'EOF'
## Problem

Reports can only be viewed on-screen; there is no way to export them.

## Done means

1. A logged-in user can click "Export CSV" on the reports page and receive
   a downloaded CSV of the current report's rows.

## UX intent

Single button, no extra dialog.

## Edge cases & failure modes

- An empty report still produces a valid (header-only) CSV.

## Context for implementation

Reports page component is `src/reports/Reports.tsx`.

## Out of scope

- XLSX export.
EOF

cat > docs/ship/42/plan.md <<'EOF'
1. Add an "Export CSV" button to `src/reports/Reports.tsx`.
2. Serialize the current report rows to CSV client-side.
3. Trigger a download of the generated file.
EOF

git add -A
git commit -q -m "chore: seed ticket 42 spec + plan"

# --- a local bare "origin" so branch-match/branch-divergence read as a real,
# clean checkout rather than adding unrelated preflight failures -----------
ORIGIN_DIR="$(mktemp -d)/origin.git"
git init -q --bare "$ORIGIN_DIR"
git remote add origin "$ORIGIN_DIR"
git push -q origin main

git checkout -q -b feat/42-csv-export
mkdir -p src/reports
cat > src/reports/Reports.tsx <<'EOF'
export function Reports() {
  return null;
}
EOF
git add -A
git commit -q -m "feat(42): stub csv export button"
git push -q -u origin feat/42-csv-export
git checkout -q main

# --- fake `gh` on PATH -----------------------------------------------------
# Handles exactly the calls preflight.js and the skill make for this case:
# --version / auth status / repo view (all pass, so `pr-gate` is the sole
# failure), `issue view --json labels` -> ship:awaiting-review, and
# `pr list` (preflight's non-fatal pr-existing check). No `issue edit`,
# `issue comment`, `label create`, or `pr create` are implemented — any
# such call falls through to the `*)` branch and fails loudly, which is
# exactly what the tool_used graders assert never happens.
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
      echo '{"labels":[{"name":"ship:awaiting-review"}]}'
      exit 0
    fi
    cat <<'JSON'
{"number":42,"title":"Add CSV export to reports page","body":"See docs/ship/42/spec.md","labels":[{"name":"ship:awaiting-review"}],"state":"open","url":"https://github.com/acme/widgets/issues/42","comments":[]}
JSON
    exit 0
    ;;
  "pr list")
    echo "[]"
    exit 0
    ;;
esac

echo "gh eval-shim: unexpected call for this case: gh $*" >&2
exit 1
SHIM
chmod +x bin/gh

# The eval harness runs scaffold_script once, before the agent, in this case
# directory; prepending bin/ here relies on the harness carrying this
# exported PATH into the agent's shell environment.
export PATH="$PWD/bin:$PATH"

git add -A
git commit -q -m "eval fixture: gh shim"
