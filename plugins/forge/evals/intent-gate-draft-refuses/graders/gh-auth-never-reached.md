---
type: tool_used
tool: Bash
input_match: "gh auth status"
min: 0
max: 0
---

`gh auth status` is Step 0 check 4 — later than the draft-status check
(check 1). A run that stops at check 1 never reaches check 4. This
proves the checks short-circuit in the documented order rather than
running all of them and reporting the first failure after the fact.
