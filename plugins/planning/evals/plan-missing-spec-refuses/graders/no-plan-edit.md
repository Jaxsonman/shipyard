---
type: tool_used
tool: Edit
input_match: "docs/ship/42/plan\\.md"
min: 0
max: 0
---

Same rationale as `no-plan-write.md`: `docs/ship/42/plan.md` doesn't exist
yet in this fixture, so an `Edit` call naming that path this turn would
only make sense if the agent had already (wrongly) written it — either
way it's a failure.
