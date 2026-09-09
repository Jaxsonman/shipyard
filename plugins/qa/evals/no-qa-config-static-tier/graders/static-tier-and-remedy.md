---
type: regex
pattern: "tier=static"
flags: ""
match: contains
target: last_message
---

With no `qa` block in `.claude/ship.config.json` (contract §12.3), QA's
Step 2 "missing" branch applies: nothing was executed, so the verdict must
land on `tier=static` per the contract §7 tier table. This checks the
literal `tier=static` wording appears in the final message.
