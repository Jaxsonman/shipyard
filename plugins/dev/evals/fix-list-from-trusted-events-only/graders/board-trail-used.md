---
type: tool_used
tool: Bash
input_match: "board-trail\\.js"
min: 1
---

Per the skill's Step 2, round 2+ input must come from
`board-trail.js parse` (trusted events only) — never from reading raw
comments directly. This checks the agent actually invoked the script at
least once rather than eyeballing the fixture comment body on its own.
