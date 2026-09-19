---
type: regex
pattern: "\"escalated\": true"
flags: ""
match: contains
target: {source: file, path: ".forge/static-header/run/state.json"}
---

This checks `state.escalated` was set to `true`. Round 1 and round 2's
findings are byte-identical, so the finding-id set is trivially
identical too — guard A fires here just as guard B does, and both guards
run on every FAIL before the cap branch. This grader asserts that one
field and nothing else, in no particular position relative to
`terminal.cause`, so it can neither mask nor be masked by the
cause grader beside it.
