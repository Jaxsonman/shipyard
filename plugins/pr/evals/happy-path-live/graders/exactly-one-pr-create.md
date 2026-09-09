---
type: tool_used
tool: Bash
input_match: "gh pr create"
min: 1
max: 1
---

On the happy path (gate passes, merge is clean, no PR yet open), Step 6
opens exactly one pull request. This is the one case in the suite where a
`gh pr create` call is expected.
