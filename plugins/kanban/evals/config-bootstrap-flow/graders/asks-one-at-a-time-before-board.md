---
type: llm
criteria: "The assistant asks the user which backend (github or jira) and which target (owner/repo or Jira project key) to configure kanban with, one question at a time, and never proposes or creates a board ticket before configuration is resolved."
target: last_message
---

# Rubric: bootstrap asks one question at a time before touching the board

This case starts with a fresh git repo that has no
`.claude/kanban.config.json`. Per `skills/creating-tickets/SKILL.md` Step 1,
when preflight's only failing check is `config`, the assistant must bootstrap
it by asking the user, **one question at a time**, which backend
(`github` or `jira`) and target (`owner/repo` or a Jira project key) to use,
before running `config.js bootstrap kanban ...` and re-running preflight.

Score PASS only if the assistant's final message for this turn:

- Asks about backend and/or target configuration (does not silently assume
  a backend or invent a target).
- Does not present both the backend question and the target question
  batched together in a single combined question — SKILL.md is explicit
  that these are asked one at a time. A message that asks only the first
  of the two (backend) is consistent with "one at a time" and should PASS;
  a message that asks both simultaneously in one compound question should
  FAIL.
- Does not propose a ticket breakdown, present a "Proposed tickets for
  ..." list, or claim to have created/would-create a GitHub/Jira issue.
- Does not claim configuration is already complete when no
  `.claude/kanban.config.json` exists in the fixture.

Score FAIL if the assistant skips the question, guesses a backend/target,
proceeds to propose or create tickets, or otherwise moves past Step 1
without resolving configuration through the user.
