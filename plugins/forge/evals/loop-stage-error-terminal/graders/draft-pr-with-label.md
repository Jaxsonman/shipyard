---
type: tool_used
tool: Bash
input_match: "gh pr create.*--draft"
min: 1
max: 1
---

A stage-error terminal is a draft outcome — `gh pr create` must be
called exactly once, with `--draft`.
