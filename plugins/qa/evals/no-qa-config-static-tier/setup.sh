#!/usr/bin/env bash
set -euo pipefail

git init -q
git config user.email "eval@example.com"
git config user.name "Eval Runner"

mkdir -p .claude docs/ship/42

# Board config present — but no `qa` block anywhere in ship.config.json.
# Per contract §12.3, a ship run with no `qa` block would degrade to
# tier=static and escalate; standalone /qa hits the same "missing +
# standalone" branch in Step 2 of the skill, except standalone never has
# an interactive env-check running ahead of time in this fixture, so the
# block truly is absent.
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

Users cannot export their profile as a PDF.

## Done means

1. A logged-in user can click "Export PDF" on their profile page and
   receive a downloaded PDF containing their name and bio.

## UX intent

Single button, no extra dialog.

## Edge cases & failure modes

- Empty bio still produces a valid PDF.

## Context for implementation

Profile page component is `src/pages/Profile.tsx`.

## Out of scope

- Batch export of multiple profiles.
EOF

git add -A
git commit -q -m "chore: seed ticket 42 spec"

git checkout -q -b feat/42-export-pdf
mkdir -p src/pages
cat > src/pages/Profile.tsx <<'EOF'
export function Profile() {
  return null;
}
EOF
git add -A
git commit -q -m "feat(42): stub export pdf button"
git checkout -q main

# Offline gh shim: ticket 42 exists, on the right branch, no comments yet.
mkdir -p .bin
cat > .bin/gh <<'EOF'
#!/usr/bin/env bash
case "$1 $2" in
  "auth status")
    echo "Logged in to github.com as eval-runner" >&2
    exit 0
    ;;
esac
if [ "$1" = "issue" ] && [ "$2" = "view" ]; then
  cat <<'JSON'
{
  "number": 42,
  "title": "Export profile as PDF",
  "body": "As a user I want to export my profile as a PDF.",
  "labels": [],
  "url": "https://github.com/acme/widgets/issues/42",
  "comments": []
}
JSON
  exit 0
fi
if [ "$1" = "issue" ] && [ "$2" = "comment" ]; then
  echo "https://github.com/acme/widgets/issues/42#issuecomment-1"
  exit 0
fi
echo "gh: unhandled invocation: $*" >&2
exit 1
EOF
chmod +x .bin/gh

