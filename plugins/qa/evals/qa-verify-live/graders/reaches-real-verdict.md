---
type: regex
pattern: "ship:qa verdict (PASS|FAIL) (round \\d+/\\d+|standalone) tier=\\w+(\\([^)]*\\))? verified \\d+/\\d+"
flags: ""
match: contains
target: last_message
---

This live case runs the real verifying-branches skill end-to-end against
a real ticket/branch (headless E2E, real health check, real board
comment). Per contract section 5.5 the standalone verdict header is
"ship:qa verdict <VERDICT> standalone tier=<tier> verified k/n" (or
"round N/M" if somehow invoked as part of a real ship round). This checks
the run actually concluded with a well-formed verdict header rather than
erroring out or trailing off mid-verification.
