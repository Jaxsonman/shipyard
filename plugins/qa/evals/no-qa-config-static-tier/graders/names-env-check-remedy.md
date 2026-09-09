---
type: regex
pattern: "--env-check"
flags: ""
match: contains
target: last_message
---

The `qa` config block is owned by qa and written only by its first-run
interview, `/qa --env-check` (contract §12.3). The verifying-branches skill
(Step 2) says a missing block's verdict must name that command as the
remedy. This checks the literal flag `--env-check` appears in the final
message.
