---
type: tool_used
tool: Bash
input_match: "gh pr create"
min: 0
max: 0
---

Per opening-prs/SKILL.md Step 4, when `gh pr list` already reports an open
PR for the branch, `/pr` must reconcile it — never create a second one.
No `gh pr create` call should happen in this turn.
