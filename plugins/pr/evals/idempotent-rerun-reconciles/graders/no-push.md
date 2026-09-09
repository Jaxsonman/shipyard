---
type: tool_used
tool: Bash
input_match: "git\\s+(-C\\s+\\S+\\s+)?push"
min: 0
max: 0
---

Step 4 (Reconcile an existing PR) says explicitly: "Skip Steps 5 and 6
entirely on this path" — Step 5 is the push. No `git push` of any form
should be invoked in this turn.
