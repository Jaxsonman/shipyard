---
name: "Full interview writes a finished PRD (live, un-mocked)"
tags: ["live"]
runs: 1
max_turns: 20
timeout_seconds: 300
---

This case is intentionally un-mocked and higher-turn/higher-cost: it runs a
longer simulated interview end-to-end (draft-then-final PRD write flow) and
is excluded from the default eval run for cost reasons — it only runs when
the suite is invoked with `--tag live`. The PRD flow itself needs no real
board or `gh` access; it is purely local filesystem work.

Simulate a full PRD interview. Play both roles: drive `/prd` as the user,
then answer each interview question yourself as a plausible product person
would, one answer per turn, until the agent has covered problem, target
users, success metrics, scope-in, scope-out, and risks/open questions, and
writes the finished PRD file. Then stop.

Start the interview now:

/prd Add a dark mode toggle to the settings page
