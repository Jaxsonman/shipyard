---
type: llm
criteria: "The response reports round 1 QA verdict PASS, review round 1 verdict APPROVE (mentioning the non-blocking naming nit as a follow-up, never as a blocker), and a ready (non-draft) PR opened at https://github.com/eval-org/eval-repo/pull/101 — never describing this as a draft or not-passed outcome."
focus: last_message
---

This fixture pre-seeds a full first-try pass: round-1 QA is PASS with no
findings, and review round 1 is APPROVE with one non-blocking nit. Per
`skills/running-forge/SKILL.md` Step 3/Step 5/Terminal, this must reach
the **ready** terminal — pushed branch, non-draft PR, no `forge:not-passed`
label. Score FAIL if the response claims another round is needed, treats
the nit as blocking, or describes the PR as a draft.
