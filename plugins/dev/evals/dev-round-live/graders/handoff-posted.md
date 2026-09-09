---
type: llm
criteria: "The response reports a completed dev round: work committed to the ticket's feat/<id>-* branch on Jaxsonman/shipyard-e2e, and a ship:dev round N/M (or ship:dev standalone) handoff comment posted to the real ticket, or a clear escalation/error per the skill if the round could not complete."
target: last_message
---

This grades a real, live run against `Jaxsonman/shipyard-e2e` (no
fixtures). It only applies when a human has deliberately run this case
with `--tag live` — never in normal suite authoring or CI.

Pass criteria:
- The response names the real ticket id/number it worked and the branch
  it committed to.
- It reports either: (a) a `ship:dev round N/M` or `ship:dev standalone`
  handoff comment successfully posted, with the header text present in
  the response, and a summary of what changed and why; or (b) a `ship:dev
  escalation` per Step 8 if the round could not be completed, with the
  reason stated plainly.
- It does not silently stop without reporting what happened to the real
  ticket and branch.
- It never invents a spec or plan — per the skill, standalone mode
  requires `docs/ship/<id>/spec.md` to already exist (missing → stop,
  "Run `/spec <id>` first"), and any self-plan is clearly labeled as such
  per the skill's self-plan path.

Fail if the response fabricates a handoff without evidence it actually
posted, or if it silently no-ops.
