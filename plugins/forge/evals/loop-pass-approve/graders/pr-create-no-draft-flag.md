---
type: regex
pattern: "gh pr create[^\n]*--draft"
flags: ""
match: not_contains
target: trace
---

The ready path never passes `--draft` to `gh pr create`. This checks the
literal flag never appears attached to a `pr create` invocation anywhere
in the trace.
