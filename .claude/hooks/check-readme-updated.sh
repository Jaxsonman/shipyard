#!/bin/bash
# PreToolUse/Bash hook: blocks `git commit` when plugins/ or .claude-plugin/
# changed but README.md wasn't updated in the same commit.
set -euo pipefail

changed=$(git diff --cached --name-only)

if echo "$changed" | grep -qE '^(plugins/|\.claude-plugin/)' \
   && ! echo "$changed" | grep -qx 'README.md'; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: "plugins/ or .claude-plugin/ changed but README.md is not staged. Update README.md (install steps, pipeline stage table) to reflect the change, git add README.md, then retry the commit."
    }
  }'
fi
