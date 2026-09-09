#!/usr/bin/env bash
set -euo pipefail

git init -q
git config user.email "eval@example.com"
git config user.name "Eval Runner"

mkdir -p .claude docs/ship/42 bin

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
# Spec: Add CSV export button

## Done means
- A user on the reports page can click "Export CSV" and download the
  current table as a CSV file.
- The export respects any active filters.

## Out of scope
- Scheduled/recurring exports.
EOF

cat > docs/ship/42/plan.md <<'EOF'
# Plan: Add CSV export button

## Architecture decisions
- Reuse the existing table-filter state; serialize visible rows client-side.

## Testing approach
- Unit test the CSV serializer; one integration test for the button click.

## Tasks
1. Add `exportToCsv(rows)` serializer with unit tests.
   - Files: src/reports/csv.js, src/reports/csv.test.js
   - Verify: `npm test -- csv`
2. Wire the "Export CSV" button to the serializer, respecting active filters.
   - Files: src/reports/ReportsTable.jsx
   - Verify: `npm test -- ReportsTable`
EOF

git add -A
git commit -q -m "docs(ship): spec + plan for ticket 42"

git checkout -q -b feat/42-add-export-button

# Round 1 dev work already landed on the branch.
mkdir -p src/reports
cat > src/reports/csv.js <<'EOF'
function exportToCsv(rows) {
  return rows.map((r) => r.join(",")).join("\n");
}
module.exports = { exportToCsv };
EOF
git add -A
git commit -q -m "feat(42): add exportToCsv serializer [task-1]"

# --- fake `gh` shim so the run never touches a real GitHub repo ---
cat > bin/gh <<'SHIM'
#!/usr/bin/env bash
case "$1 $2" in
  "auth status")
    echo "Logged in to github.com as acme-bot" >&2
    exit 0
    ;;
  "issue view")
    cat "$(git rev-parse --show-toplevel)/.eval-fixtures/issue-42.json"
    exit 0
    ;;
  "api user")
    echo "acme-bot"
    exit 0
    ;;
  "issue comment")
    echo "https://github.com/acme/widgets/issues/42#issuecomment-2"
    exit 0
    ;;
  *)
    echo "gh-shim: unhandled command: $*" >&2
    exit 1
    ;;
esac
SHIM
chmod +x bin/gh

mkdir -p .eval-fixtures
cat > .eval-fixtures/issue-42.json <<'EOF'
{
  "number": 42,
  "title": "Add CSV export button",
  "url": "https://github.com/acme/widgets/issues/42",
  "state": "OPEN",
  "author": {"login": "acme-bot"},
  "labels": [{"name": "ship:in-dev"}],
  "body": "Add a CSV export button to the reports page.",
  "comments": [
    {
      "author": {"login": "acme-bot"},
      "createdAt": "2026-09-01T10:00:00Z",
      "url": "https://github.com/acme/widgets/issues/42#issuecomment-100",
      "body": "ship:dev round 1/3\n\n## What changed and why\n- Added `exportToCsv(rows)` serializer and wired the button. sha abc1234\n\n## How to run it\n`npm test -- csv`\n\n## Criteria coverage\n| # | Criterion | Covered |\n|---|---|---|\n| 1 | Export CSV button downloads table | yes |\n\n## Deviations\nnone\n\n## Known limitations\nFilters not yet respected in the exported file.\n<!-- shipyard-metrics {\"stage\":\"dev\",\"started\":\"2026-09-01T09:00:00Z\",\"finished\":\"2026-09-01T10:00:00Z\"} -->"
    },
    {
      "author": {"login": "acme-bot"},
      "createdAt": "2026-09-02T11:00:00Z",
      "url": "https://github.com/acme/widgets/issues/42#issuecomment-101",
      "body": "ship:qa verdict FAIL round 2/3 tier=full verified 2/2\n\n| # | Criterion | Verdict | Evidence |\n|---|---|---|---|\n| 1 | Export CSV button downloads table | pass | .qa/42/round-2/criterion-1.log |\n| 2 | Export respects active filters | fail | .qa/42/round-2/criterion-2.log |\n\n## Findings\n\nFinding 1\n  Symptom: Exported CSV includes rows hidden by the active \"Status = Open\" filter.\n  Repro: 1. Open reports page. 2. Filter Status = Open. 3. Click Export CSV. 4. Open the downloaded file — closed-status rows are present.\n  Criterion: 2 (\"The export respects any active filters\")\n  Evidence: .qa/42/round-2/criterion-2.log\n\nFinding 2\n  Symptom: Export button has no accessible label; screen readers announce it as \"button\".\n  Repro: 1. Tab to the export control with a screen reader active. 2. Observe the announced name.\n  Criterion: 1 (\"A user on the reports page can click Export CSV\")\n  Evidence: .qa/42/round-2/criterion-1.log\n\n## Unverifiable\n\nSuite: 4 passed, 0 failed (0 pre-existing, not counted) — `npm test`\nRepro: npm test -- csv\nArtifacts: .qa/42/round-2/   (gitignored)\n<!-- shipyard-metrics {\"stage\":\"qa\",\"started\":\"2026-09-02T10:30:00Z\",\"finished\":\"2026-09-02T11:00:00Z\"} -->"
    }
  ]
}
EOF

BIN_DIR="$PWD/bin"
for RC in "$HOME/.bashrc" "$HOME/.zshrc"; do
  touch "$RC"
  if ! grep -qF "$BIN_DIR" "$RC" 2>/dev/null; then
    echo "export PATH=\"$BIN_DIR:\$PATH\"" >> "$RC"
  fi
done
export PATH="$BIN_DIR:$PATH"

git add -A
git commit -q -m "chore: eval fixture — fake gh shim + board fixture"
