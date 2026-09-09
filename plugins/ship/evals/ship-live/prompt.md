---
name: "ship-live: single-ticket dev ⇄ QA run against the real e2e repo"
tags: ["live"]
runs: 1
max_turns: 60
timeout_seconds: 1800
---

AUTHORING NOTE — read before ever executing this case: this `prompt.md`
and its grader are authored-only. The authoring agent for this eval suite
must NOT run `claude plugin eval` against this case (or any case) in the
session that writes it, and must never touch the real
`Jaxsonman/shipyard-e2e` repository — no `gh` calls, no network calls, no
checkout. This file exists so that, WHEN a human or a separate CI job
later chooses to run the `live`-tagged suite deliberately (outside this
authoring session), there is a ready single-scenario sanity case.

This case is intentionally excluded from the default eval run (tag
`live`, not `default`) and is a cheap single-scenario sanity check only —
it is NOT a substitute for, and does not duplicate, ship's own H-17
six-scenario acceptance suite, which is a separate workstream run by
another lead against the real board with its own broader coverage
(multiple verdict paths, escalation causes, resume, etc.). This case
covers exactly one path: a single planned ticket in
`Jaxsonman/shipyard-e2e` going through one dev round and one QA round to
either `Awaiting Review` or `Needs Human`, end to end, against the real
`gh` CLI and a real worktree — no mocked `gh` shim, unlike the other three
cases in this suite.

---

A ticket in `Jaxsonman/shipyard-e2e` is already at `Planned`
(`ship:planned`) with `docs/ship/<id>/spec.md` and `plan.md` committed on
`main`, and `.claude/kanban.config.json` / `.claude/ship.config.json`
(with a working `qa` block from a prior `/qa --env-check`) already
configured in that checkout. Run:

/ship <id>

Replace `<id>` with the real ready ticket's number when this case is
actually run. Let the loop run to completion (PASS -> Awaiting Review, or
a FAIL/escalation -> Needs Human) and report the outcome.
