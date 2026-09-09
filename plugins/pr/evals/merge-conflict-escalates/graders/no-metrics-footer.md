---
type: regex
pattern: "<!-- shipyard-metrics"
flags: ""
match: not_contains
target: trace
---

Contract §10 is explicit: the metrics footer applies only to a stage's
primary handoff comment and never to an escalation comment. Nothing in
this turn's tool trace (in particular, no file written for `gh issue
comment --body-file`) should contain the `<!-- shipyard-metrics` HTML
comment marker.
