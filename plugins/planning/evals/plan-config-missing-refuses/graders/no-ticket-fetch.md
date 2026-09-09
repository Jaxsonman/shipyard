---
type: tool_used
tool: Bash
input_match: "gh\\s+issue\\s+view"
min: 0
max: 0
---

Fetching ticket 42 (`gh issue view 42 ...`, per `references/github.md`'s
"Fetch ticket" operation) only happens after `config.kanban.backend` and
`config.kanban.target` are known — there is no config in this fixture, so
the skill must never reach the fetch step in this turn. A `gh issue view`
invocation in the Bash trace this turn is a failure regardless of what it
returns.
