---
name: "Live dev round against a real ticket/branch (un-mocked)"
tags: ["live"]
runs: 1
max_turns: 30
timeout_seconds: 1800
---

**This case is intentionally un-mocked and touches a real GitHub board and
a real repository — `Jaxsonman/shipyard-e2e` — over real `gh` calls.** It
runs one real dev round against a real ticket and branch on that repo: no
`gh` shim, no fixture JSON, no scratch `git init`. It is tagged `live`
only, not `default`, and is excluded from the default `claude plugin eval`
run for exactly this reason — it costs real time, real tokens, and touches
a real, shared repository, and its outcome depends on that repo's live
ticket/board state at run time rather than a frozen fixture.

**IMPORTANT — do not execute this case as part of authoring or maintaining
this eval suite.** Authoring or editing eval files is a documentation
task; it must never itself invoke `claude plugin eval --tag live` (or any
tag selection that would include this case) as a side effect. This case
runs only when a human deliberately invokes the suite with `--tag live`
in an environment with real `gh` credentials scoped to
`Jaxsonman/shipyard-e2e`, and expects that run to make a real commit and
post a real board comment on that repo.

When this case does run for real, follow the dev plugin's
`implementing-tickets` skill (standalone mode via `/dev`) against a ticket
on `Jaxsonman/shipyard-e2e` that already has an approved `spec.md` and
`plan.md`. Use the ticket number supplied via the harness's environment
(or ask which ticket, if none is supplied) and execute one full dev round:
preflight, worktree setup, task execution with real subagent dispatch,
adversarial review, and a real `ship:dev` handoff comment posted to the
ticket.

/dev
