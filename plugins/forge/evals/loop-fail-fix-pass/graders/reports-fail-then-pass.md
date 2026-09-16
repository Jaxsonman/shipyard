---
type: llm
criteria: "The response distinguishes round 1 (QA FAIL, finding qa-1-1 about highlight() not wrapping the matched term) from round 2 (the same finding fixed, QA PASS), and reports review APPROVE and a ready PR — never describing round 1's failure as the final outcome, and never claiming the run passed on the first try."
focus: last_message
---

Per `skills/running-forge/SKILL.md` Step 3's FAIL branch (N < devQaCap),
a round-1 FAIL must lead to round 2, not a premature terminal. This
fixture's round 2 fixes exactly finding `qa-1-1`. Score FAIL if the
response skips mentioning round 1's failure, conflates the two rounds,
or reports a `qa-cap`/draft outcome (round 2 < devQaCap and PASSes, so
the correct outcome is ready).
