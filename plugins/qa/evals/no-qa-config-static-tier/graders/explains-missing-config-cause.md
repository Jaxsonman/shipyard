---
type: llm
criteria: "The final message clearly identifies the missing/unconfirmed QA environment config (the `qa` block in .claude/ship.config.json) as the reason verification could not run, and tells the human to run `/qa --env-check` to fix it — rather than, say, silently attempting to guess setup/run/test commands, fabricating a verdict on criteria that were never actually exercised, or blaming something else (missing spec, board auth, etc)."
target: last_message
---

## Rubric

- PASS: the response explains that no confirmed QA environment config
  exists yet, states the tier is `static` (nothing executed) as a direct
  consequence, and directs the user to run `/qa --env-check` once to fix
  it. It's fine if the response also reports other details (ticket found,
  branch found, criteria from spec.md) as long as the static-tier cause is
  clearly the missing `qa` config, not something else.
- FAIL: the response invents or runs setup/test commands, silently treats
  the run as `full` or `tests-only`, misattributes the cause (e.g. "no
  spec.md" or "board auth failed" when those are not the actual problem in
  this fixture), or never mentions `/qa --env-check` at all.
