#!/usr/bin/env bash
set -euo pipefail

# A fully configured repo (kanban.config.json + ship.config.json), with a
# `gh` shim on PATH so `preflight.js` and the github.md backend reference
# stay offline and deterministic. Ticket #42 exists and is real-looking
# (title, body, no ship:* label yet) but there is deliberately NO
# docs/ship/42/spec.md — per planning-tickets SKILL.md Step 2, plan.md
# always requires spec.md to exist first ("File presence is the gate").

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

# --- fake `gh` on PATH -------------------------------------------------
# Written into the repo and also spliced onto PATH via the invoking
# user's shell profile, since each Bash call in this environment starts
# a fresh shell that re-sources that profile (working directory persists
# between calls, but shell state — including exported PATH edits made in
# a *different* process — does not).

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
{"number":42,"title":"Add dark mode toggle","body":"Users working at night find the current bright UI uncomfortable. Add a toggle in account settings that switches the palette and persists the choice.\n\nSource PRD: none","labels":[],"url":"https://github.com/eval-org/eval-repo/issues/42","comments":[]}
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
git commit -q -m "chore: configure kanban/ship, add eval gh shim"
