---
name: "Full /spec then /plan cycle against a live GitHub repo (live)"
tags: ["live"]
runs: 1
max_turns: 40
timeout_seconds: 900
---

This case is intentionally un-mocked and higher-cost: it drives a real
`/spec <id>` interview through to an approved, committed `spec.md`, then a
real `/plan <id>` session through to an approved, committed `plan.md`,
against a real GitHub repository — `Jaxsonman/shipyard-e2e` — using real
`gh` calls (no fixture, no stubbed `gh`). It is tagged `live` only (no
`default` tag) so it is excluded from the default eval run and only runs
when the suite is invoked with `--tag live`.

Setup this case needs but does not scaffold for itself (do this once,
out of band, before ever running this case with `claude plugin eval
--tag live`):
- A ticket already open on `Jaxsonman/shipyard-e2e` with no `ship:*`
  label, its number substituted for `<id>` below.
- `.claude/kanban.config.json` in that repo's checkout pointing
  `backend: "github"`, `target: "Jaxsonman/shipyard-e2e"`.
- `gh auth status` passing for an account with write access to that repo.

Drive the session end to end:

1. Run `/spec <id>`. Play the PM/UX side of the guided interview
   yourself, one answer per turn, until every spec.md section (Problem,
   Done means, UX intent, Edge cases & failure modes, Context for
   implementation, Out of scope) is covered, then approve the draft when
   presented.
2. Once `/spec <id>` reports the commit and `ship:specced` label, run
   `/plan <id>`. Play the engineer side of the architecture discussion,
   one decision at a time, then approve the draft plan when presented.
3. Stop once `/plan <id>` reports the commit and `ship:planned` label.
