---
type: llm
criteria: "The run drives the ticket through the ship pipeline to one of the two terminal states — Awaiting Review (a QA PASS with a posted review packet) or Needs Human (an escalation, cap/static/stage-error/reconcile) — reports which one, names the round(s) run, and states plainly that nothing was pushed. It must not claim success while leaving the ticket at In Dev or In QA, and it must not push or merge anything."
target: last_message
---

This is the live sanity case (tag: live) — a single real ticket in
Jaxsonman/shipyard-e2e run end to end. Per SKILL.md Step 8, the final
report must lead with the outcome (`Awaiting Review` / `Needs Human`),
name each round's verdict, give the branch/worktree path, and state that
nothing was pushed (contract v1: ship pushes nothing; the terminal states
are Awaiting Review and Needs Human, worktree kept in both).

Score PASS if the report clearly lands on one of the two terminal states
with a verdict/escalation summary and an explicit "nothing was pushed"
statement. Score FAIL if the run stalls at a non-terminal status without
explanation, silently pushes/merges, or the final message doesn't say
which terminal state was reached.

Reminder for whoever runs this case: this is NOT a re-run of ship's H-17
six-scenario acceptance suite (a separate workstream) — it is a single
cheap path check, so a PASS here says only that this one path works, not
that the full acceptance surface is covered.
