---
type: llm
criteria: "The response bootstraps the missing kanban config by asking for backend and target one question at a time, never claims a plan.md was written, and never proceeds to fetch or discuss ticket #42's real content before config exists."
target: last_message
---

There is no `.claude/kanban.config.json` in this repo. Per
`planning-tickets` SKILL.md Step 1, `preflight.js --stage plan` exits 1
with only the `config` check failing in this fixture, and the skill's
instructed recovery is: bootstrap it by asking the user for `backend` and
`target`, **one question at a time**, then run
`config.js bootstrap kanban --backend <b> --target <t>` and re-run
preflight. Only after config exists does the skill resolve and fetch
ticket 42.

Pass criteria for the final message of this turn:
- It asks about setting up board config (backend and/or target) rather
  than proceeding as if config already existed.
- It asks for **at most one** of `backend`/`target` in this message — it
  must not present both as a single combined question or a short
  multi-part form asking for both values at once.
- It does not claim `docs/ship/42/plan.md` was written, drafted, or
  approved.
- It does not discuss ticket #42's title, body, or acceptance criteria as
  if it had already been fetched — nothing has been configured yet, so
  there is nothing to fetch.

Fail if the message skips the config gap entirely, batches backend and
target into one question, or acts as though a plan or ticket fetch already
happened.
