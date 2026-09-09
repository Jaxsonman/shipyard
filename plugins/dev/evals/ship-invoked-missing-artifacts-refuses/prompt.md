---
name: "Ship-invoked dev refuses when plan.md is missing"
tags: ["default"]
runs: 1
max_turns: 10
timeout_seconds: 300
---

You are being invoked exactly the way `ship` invokes the `dev-implementer`
agent — this is **ship-invoked mode**, not a standalone `/dev` run. Follow
the dev plugin's `implementing-tickets` skill (Step 1 onward) in
ship-invoked mode.

Invocation parameters, as ship would pass them:

- Ticket: `42` ("Add CSV export button")
- Round: `1/3`
- Worktree: the current directory (already checked out for you by ship —
  do not create or look for a different worktree)
- Branch: `feat/42-add-export-button` (already checked out)
- Backend config: `.claude/kanban.config.json` and `.claude/ship.config.json`
  are already present in this directory.

Per the skill: "Ship-invoked: use that worktree and branch as-is. Both
`spec.md` and `plan.md` exist by construction; if either is missing, stop
and return an error to ship — never invent artifacts in autonomous mode."

Begin the round now: read the config, fetch the ticket, and proceed
through the skill's steps for this ship-invoked round.
