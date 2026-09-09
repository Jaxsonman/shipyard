---
type: tool_used
tool: Write
input_match: "docs/ship/42/plan\\.md"
min: 0
max: 0
---

`docs/ship/42/plan.md` must never be created while the spec-missing
precondition is unresolved (planning-tickets SKILL.md Step 2/Step 6:
"Write nothing before approval," and approval can't happen — there is no
spec to plan from). A `Write` call targeting that path this turn is a
failure.
