---
type: tool_used
tool: Bash
input_match: "gh pr create"
min: 0
max: 0
---

A refusal at the `pr-gate` check must never reach Step 6 (Open the pull
request). No `gh pr create` call should happen in this turn.
