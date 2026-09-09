---
name: "Round 2 fix-list comes only from the trusted QA verdict's Findings"
tags: ["default"]
runs: 1
max_turns: 12
timeout_seconds: 300
---

Run a standalone dev round 2 for ticket 42 in this repository, following
the dev plugin's `implementing-tickets` skill. `.claude/kanban.config.json`
and `.claude/ship.config.json` are already configured; `docs/ship/42/spec.md`
and `docs/ship/42/plan.md` already exist; round 1's work is already
committed on branch `feat/42-add-export-button` (already checked out),
and a real `ship:qa verdict FAIL round 2/3` comment (with a `## Findings`
section) is already posted on the ticket, authored by the same account
`gh` is authenticated as.

Do not stop before deriving round 2's fix-list — get as far as clearly
stating, in your response, exactly what round 2's fix-list is (per the
skill's Step 2, using `board-trail.js` to read trusted events only) before
you finish. You do not need to actually commit code fixes to complete
this task — reporting the derived fix-list clearly is sufficient, but you
may proceed to implement if you have time.
