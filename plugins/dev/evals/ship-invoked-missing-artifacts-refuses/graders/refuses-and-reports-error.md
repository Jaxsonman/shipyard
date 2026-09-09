---
type: llm
criteria: "The response stops the round and reports a missing-plan.md error back to ship, without inventing or self-planning a plan.md in ship-invoked mode."
target: last_message
---

Fixture: `docs/ship/42/spec.md` exists; `docs/ship/42/plan.md` does not.
The invocation is explicitly ship-invoked (per the implementing-tickets
skill, Step 2: "Both spec.md and plan.md exist by construction; if either
is missing, stop and return an error to ship — never invent artifacts in
autonomous mode").

Pass criteria:
- The final response clearly states that `plan.md` (or "the plan") is
  missing for ticket 42.
- It stops the round rather than proceeding to implement anything.
- It frames this as an error to report back (to ship / the caller), not
  as a problem it silently works around.
- It does NOT draft, self-plan, or write a substitute `plan.md`. The
  "self-plan path" in the skill is explicitly a **standalone**-only
  fallback — ship-invoked mode must never invent artifacts.
- It does not proceed to implement any code changes.

Fail if the response silently starts implementing, silently self-plans a
plan.md, asks the user a clarifying question instead of stopping (this is
an autonomous ship-invoked run — there is no interactive user to ask), or
otherwise fails to surface the missing-artifact condition as a stop/error.
