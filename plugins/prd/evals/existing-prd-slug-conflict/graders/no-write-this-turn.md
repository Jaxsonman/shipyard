---
type: tool_used
tool: Write
min: 0
max: 0
---
The agent must not write any file (in particular a new or overwritten PRD
under `docs/prd/`) before the user has explicitly chosen revise / new slug /
abort. A `Write` tool call in this turn is a failure regardless of which
path it writes to.
