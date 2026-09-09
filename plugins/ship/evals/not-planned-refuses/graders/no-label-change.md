---
type: tool_used
tool: Bash
input_match: "gh issue edit .*(--add-label|--remove-label)"
min: 0
max: 0
---

Only `ship` may transition a ticket's `ship:*` label, and only after every
Step 1-3 gate passes (SKILL.md "Hard rules" and Step 3). A ticket refused
at the status gate must have its label left untouched — no
`gh issue edit ... --add-label`/`--remove-label` call for ticket 42 is
expected in this turn.
