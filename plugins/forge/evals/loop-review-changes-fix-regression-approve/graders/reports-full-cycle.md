---
type: llm
criteria: "The response describes: round 1 dev+QA PASS; review round 1 CHANGES on finding rv-1-1 (a swallowed error in duplicateNote); a round-2 dev fix addressing rv-1-1; a regression-only QA pass at round 2; review round 2 APPROVE; and a ready (non-draft) PR opened. It must not describe rv-1-1 as still open, and must not claim round 2 was an ordinary full QA round with 3 verifiers (it was a regression-only, single-verifier pass)."
focus: last_message
---

Per `skills/running-forge/SKILL.md` Step 5's `CHANGES` branch, a
review-driven fix round is followed by exactly one regression-only QA
pass (`verifiers 1, lens regression`), not a full re-run of every lens,
before the reviewer looks again.
