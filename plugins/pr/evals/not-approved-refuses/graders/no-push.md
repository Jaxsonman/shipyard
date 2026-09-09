---
type: tool_used
tool: Bash
input_match: "git\\s+(-C\\s+\\S+\\s+)?push"
min: 0
max: 0
---

`/pr` is the only stage in the pipeline that pushes, and only after every
preflight gate passes (SKILL.md "Hard rules"). Ticket 42 fails the
`pr-gate` check in this fixture, so no `git push` of any form should ever
be invoked in this turn.
