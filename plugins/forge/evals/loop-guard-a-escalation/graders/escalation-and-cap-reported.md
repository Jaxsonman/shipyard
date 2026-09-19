---
type: llm
criteria: "The response reports that finding qa-1-1 recurred unresolved across round 1 and round 2, that this escalated the developer's model tier for any further attempt, and that the run then stopped as a draft (not-passed) PR because devQaCap (2) was reached — never describing this as a full pass."
focus: last_message
---

Per `skills/running-forge/SKILL.md` Step 3's oscillation guard A, the
same finding id recurring across rounds 1-2 sets `state.escalated =
true`. Since `devQaCap` is 2 (this fixture's `.claude/forge.config.json`)
and round 2 is also the cap, the run must additionally reach Terminal
(draft, cause `qa-cap`) at the same time. Score FAIL if the response
omits either the escalation or the cap outcome, or claims a pass.
