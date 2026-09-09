---
type: regex
pattern: "ship:escalation reconcile standalone"
flags: ""
match: contains
target: trace
---

Contract §5.8's non-round escalation form — emitted by `pr`, the one stage
with no round of its own — is exactly `ship:escalation reconcile
standalone`. Grading against `trace` (rather than only the chat reply)
catches the literal header as posted via `gh issue comment --body-file`,
since the comment body is written to a temp file by an earlier Bash call
in the same turn.
