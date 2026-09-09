---
type: llm
criteria: "The response refuses to plan ticket 42 because it has not cleared spec (no docs/ship/42/spec.md), names that precondition explicitly, points the user to /spec 42, and does not write or draft docs/ship/42/plan.md."
target: last_message
---

Ticket #42 exists (fetched via the fixture's `gh` shim) but there is no
`docs/ship/42/spec.md` in the repo and no `ship:specced` label. Per
`planning-tickets` SKILL.md Step 2, spec.md's presence is the hard gate
before planning starts.

Pass criteria for the final message of this turn:
- It states, in substance, that ticket 42 hasn't been spec'd yet /
  `docs/ship/42/spec.md` doesn't exist.
- It tells the user to run `/spec 42` (or equivalent: "spec it first")
  before planning can proceed.
- It does NOT present any part of a plan (no architecture decisions, task
  list, or draft plan content) as if planning had started.
- It does NOT claim `docs/ship/42/plan.md` was written or is in progress.

Fail if the response proceeds into plan drafting (architecture discussion,
tasks, etc.) without first surfacing and stopping on the missing spec.
