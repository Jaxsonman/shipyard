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

# spec.md exists — plan.md is deliberately NOT created, that's the fixture.
cat > docs/ship/42/spec.md <<'EOF'
# Spec: Add CSV export button

## Done means
- A user on the reports page can click "Export CSV" and download the
  current table as a CSV file.
- The export respects any active filters.

## Out of scope
- Scheduled/recurring exports.
EOF

git add -A
git commit -q -m "docs(ship): spec for ticket 42"

git checkout -q -b feat/42-add-export-button

# --- fake `gh` shim so the run never touches a real GitHub repo ---
cat > bin/gh <<'SHIM'
#!/usr/bin/env bash
case "$1 $2" in
  "auth status")
    echo "Logged in to github.com as acme-bot" >&2
    exit 0
    ;;
  "issue view")
    cat <<'JSON'
{
  "number": 42,
  "title": "Add CSV export button",
  "url": "https://github.com/acme/widgets/issues/42",
  "state": "OPEN",
  "author": {"login": "acme-bot"},
  "labels": [{"name": "ship:in-dev"}],
  "body": "Add a CSV export button to the reports page.",
  "comments": []
}
JSON
    exit 0
    ;;
  "api user")
    echo "acme-bot"
    exit 0
    ;;
  "issue comment")
    echo "https://github.com/acme/widgets/issues/42#issuecomment-1"
    exit 0
    ;;
  *)
    echo "gh-shim: unhandled command: $*" >&2
    exit 1
    ;;
esac
SHIM
chmod +x bin/gh

BIN_DIR="$PWD/bin"
for RC in "$HOME/.bashrc" "$HOME/.zshrc"; do
  touch "$RC"
  if ! grep -qF "$BIN_DIR" "$RC" 2>/dev/null; then
    echo "export PATH=\"$BIN_DIR:\$PATH\"" >> "$RC"
  fi
done
export PATH="$BIN_DIR:$PATH"

git add -A
git commit -q -m "chore: eval fixture — fake gh shim"
