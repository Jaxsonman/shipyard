---
type: regex
pattern: "\"cause\": \"qa-cap\""
flags: ""
match: contains
target: {source: file, path: ".forge/flaky-summary/run/state.json"}
---

With `devQaCap` = 2 and round 2 still FAILing, `skills/running-forge/SKILL.md`
Step 3's guards-then-cap ordering applies: both oscillation guards run
first (guard A fires — same finding id — but guard B does not, since the
evidence path differs between rounds), then, because guard B did not
fire and `N == devQaCap`, the branch lands on Terminal (draft, cause
`qa-cap`). This checks the exact cause string was written.
