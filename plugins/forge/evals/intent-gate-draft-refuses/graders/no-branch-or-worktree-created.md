---
type: tool_used
tool: Bash
input_match: "git branch forge/|git worktree add"
min: 0
max: 0
---

Step 0's checks run in order; the draft-status check (check 1) comes
before branch/worktree creation. Neither command should ever run in this
turn.
