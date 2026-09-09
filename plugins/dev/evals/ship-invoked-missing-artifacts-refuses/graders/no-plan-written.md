---
type: tool_used
tool: Write
input_match: "docs/ship/42/plan\\.md"
min: 0
max: 0
---

Ship-invoked mode must never invent `plan.md` — that self-plan fallback is
standalone-only (implementing-tickets skill, Step 3 "Self-plan path" is
reached only via Step 2's standalone branch). A `Write` tool call whose
input targets `docs/ship/42/plan.md` in this run is a failure regardless
of what content it would contain.
