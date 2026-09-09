---
type: tool_used
tool: Task
input_match: "dev-implementer|qa-verifier"
min: 0
max: 0
---

Ship must never dispatch the `dev:dev-implementer` or `qa:qa-verifier`
agents for a ticket that failed the Step 3 status gate — the gate runs
before Step 4 (branch/worktree) and Step 5 (the loop) are ever reached.
Any `Task`/`Agent` dispatch whose input mentions either agent this turn is
a failure regardless of outcome.
