---
type: llm
criteria: "The assistant created real GitHub issues on Jaxsonman/shipyard-e2e for the widget PRD, and the assistant's final summary shows each ticket landed in Backlog (no ship:* label mentioned or applied), with a body containing exactly one 'Source PRD: 2026-08-01-widget' line and, for any dependent ticket, one 'Depends on: <ref>' line per dependency."
target: last_message
---

# Rubric: real end-to-end ticket creation (LIVE — not run by the authoring session)

This is the one case in `plugins/kanban/evals/` tagged `["live"]` rather than
`["default"]`. It is the only case in the suite allowed to talk to a real
board — `Jaxsonman/shipyard-e2e` — to verify `kanban` actually creates real
GitHub issues end to end, with the right labels and the right body markers.

It runs ONLY under an explicit live-tag selection (e.g.
`claude plugin eval --tag live`), never as part of a default
`claude plugin eval` run. The session that authored this eval suite did NOT
execute this case and did not run `claude plugin eval` at all (early-access
gating aside); this rubric is written for whoever runs the live tag later,
against a checkout where:

- `gh` is authenticated with write access to `Jaxsonman/shipyard-e2e`,
- `.claude/kanban.config.json` already points at
  `{ "backend": "github", "target": "Jaxsonman/shipyard-e2e" }`,
- `docs/prd/2026-08-01-widget.md` exists (a small fixture PRD — reuse the
  one from the `duplicate-prd-rerun-refuses`/`config-bootstrap-flow` cases
  in this suite if convenient),
- the operator understands this creates real, visible issues on that repo
  and will clean them up if the repo must stay pristine between runs.

Score PASS only if the assistant's final message reports tickets actually
created (real issue numbers/URLs on `Jaxsonman/shipyard-e2e`, not merely
proposed) and the report is consistent with:

- **Backlog, no `ship:*` label** — contract §4: "`kanban` creates tickets
  in Backlog and sets no `ship:*` label." The summary should not mention
  applying `ship:specced`, `ship:planned`, or any other `ship:*` label.
- **Exactly one `Source PRD: 2026-08-01-widget` line** per created ticket
  body (contract §13) — the idempotency marker a re-run's duplicate
  detection depends on.
- **`Depends on: <ref>` lines**, one per dependency, never comma-separated,
  for any ticket the PRD implies depends on another (contract §13) — only
  applicable if the fixture PRD has genuine dependencies; absence of this
  is fine if no ticket has a dependency.
- The four-list Step 7 summary shape (Already exists / Created / Failed /
  Skipped) from SKILL.md, or a clear equivalent.

Score FAIL if issues were not actually created (only proposed), if any
`ship:*` label was applied by kanban itself, if the `Source PRD:` marker is
missing or malformed, or if `Depends on:` lines are comma-separated or
otherwise deviate from the exact contract shape.
