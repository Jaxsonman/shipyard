---
type: tool_used
tool: Bash
input_match: "git\\s+(-C\\s+\\S+\\s+)?push"
min: 0
max: 0
---

Step 3 of opening-prs/SKILL.md is explicit: on a merge conflict, escalate
and stop — "Do not push. Do not open a PR." No `git push` of any form
should be invoked in this turn.
