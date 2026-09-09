---
type: tool_used
tool: Bash
input_match: "gh (issue create|label create)"
min: 0
max: 0
---

Configuration is unresolved for this fixture (no `.claude/kanban.config.json`
exists, and this is a single eval turn with no human available to answer the
bootstrap questions interactively). SKILL.md Step 1 requires the assistant to
stop at the bootstrap question rather than guess a backend/target and
proceed. No `gh issue create` or `gh label create` call should happen in
this turn — either would mean the assistant pushed past the approval-less
config gate onto the real board.
