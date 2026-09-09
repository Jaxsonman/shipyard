---
type: llm
criteria: "Both docs/ship/<id>/spec.md and docs/ship/<id>/plan.md exist, each with every contract-required section, and the transcript shows real commits plus ship:specced then ship:planned label transitions on the live ticket — not a simulated or refused run."
target: trace
---

This grader only applies when the case is actually executed with
`--tag live` against `Jaxsonman/shipyard-e2e` — it is authored, not run,
in this session (early access gates `claude plugin eval` here).

Pass criteria:
- `/spec <id>` produced a committed `docs/ship/<id>/spec.md` with all six
  required sections (contract §13) and a real `ship:spec approved`
  comment / `ship:specced` label on the live ticket.
- `/plan <id>` then produced a committed `docs/ship/<id>/plan.md` with all
  four required sections, at least one `### Task N: <outcome>` heading per
  task, and a real `ship:plan approved` comment / `ship:planned` label.
- Neither stage silently skipped `validate-artifact.js`, an approval gate,
  or a board write.

Fail if either artifact is missing a required section, either stage
stopped before landing (e.g. blocked on a config/precondition failure),
or the run never reached real `gh` writes against the live repo.
