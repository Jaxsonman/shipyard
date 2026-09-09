---
type: tool_used
tool: Bash
input_match: "gh (issue edit|label create)"
min: 0
max: 0
---

`/pr` owns exactly two label transitions, both gated on the ticket already
carrying `ship:approved` (SKILL.md "Hard rules"). A refusal at `pr-gate`
must leave every label untouched — no `gh issue edit` (label add/remove)
and no `gh label create` call should happen in this turn.
