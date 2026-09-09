---
type: regex
pattern: "ship:escalation cap round 2/2"
flags: ""
match: contains
target: last_message
---

Contract v1 §5.8 defines the escalation header grammar as
`ship:escalation <cause> round N/M`, and §8 restricts `<cause>` to exactly
`cap | static | stage-error | reconcile` (no other value is valid — a
different word is a `malformed-header` to any parser). This case's trail
shows loopCap=2 with round 1 and round 2 both ending FAIL (N = M = 2), so
per §9 ("FAIL at N = M -> cap escalation") and SKILL.md Step 7 ("Cap
escalation ... posted with cause `cap` ... at round M/M"), the response
must describe/post the escalation using exactly this header. Loosely
worded paraphrases ("we hit the retry limit", "giving up after 2 tries")
without the literal wire string do not satisfy the wire-format
requirement this grader checks — the `llm` grader in this case covers the
surrounding narrative instead.
