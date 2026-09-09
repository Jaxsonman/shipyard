#!/bin/bash
# PreToolUse/Bash hook: blocks `git commit` when the vendored copies of the
# shared tree have drifted from shared/, or when `claude plugin validate .`
# reports errors.
#
# Sibling of check-readme-updated.sh; same deny-JSON contract, silent on
# success. Runs only when the staged set touches shared/, plugins/, scripts/
# or .claude-plugin/, so ordinary commits pay nothing.
set -euo pipefail

changed=$(git -c core.quotePath=false diff --cached --name-only 2>/dev/null || true)

if ! echo "$changed" | grep -qE '^(shared/|plugins/|scripts/|\.claude-plugin/)'; then
  exit 0
fi

deny() {
  # $1 = reason text. Node is already a hard requirement of this repo; if it is
  # somehow unavailable, fall back to a fixed reason rather than emitting
  # malformed JSON or failing open.
  if command -v node >/dev/null 2>&1; then
    REASON="$1" node -e 'process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: process.env.REASON,
      },
    }, null, 2) + "\n")'
  else
    printf '%s\n' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Shared-sync or plugin-validate check failed, and node is unavailable to report the details. Run `bash scripts/check-shared-sync.sh` and `claude plugin validate .` manually."}}'
  fi
  exit 0
}

root=$(git rev-parse --show-toplevel 2>/dev/null || echo .)

# --- vendored copies in sync -------------------------------------------------
if [ -x "$root/scripts/check-shared-sync.sh" ] || [ -f "$root/scripts/check-shared-sync.sh" ]; then
  if ! sync_out=$(bash "$root/scripts/check-shared-sync.sh" --quiet 2>&1); then
    deny "${sync_out}
Stage the regenerated files, then retry the commit. Never hand-edit plugins/*/scripts/ or plugins/*/references/contract.md — edit shared/ and re-run the sync."
  fi
fi

# --- plugin manifests validate ----------------------------------------------
# Skipped silently when the CLI is unavailable; CI still covers it.
if command -v claude >/dev/null 2>&1; then
  if ! validate_out=$(claude plugin validate "$root" 2>&1); then
    deny "\`claude plugin validate .\` failed. ${validate_out} Fix the manifest errors, then retry the commit."
  fi
  if echo "$validate_out" | grep -q '✖'; then
    deny "\`claude plugin validate .\` reported errors. ${validate_out} Fix them, then retry the commit."
  fi
fi

exit 0
