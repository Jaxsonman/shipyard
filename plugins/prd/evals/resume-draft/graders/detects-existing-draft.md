---
type: llm
criteria: "The response detects the existing dark-mode draft and offers to resume/start-over/ignore it, without silently starting a brand-new interview from scratch."
target: last_message
---
A fixture draft already exists at `docs/prd/2026-09-01-dark-mode.draft.md`
(idea: a dark mode toggle; problem, target users, and success metrics
already answered; next unanswered area is scope-in).

Pass criteria:
- The response acknowledges an existing/interrupted draft was found.
- It references the draft's date (2026-09-01) and/or slug (dark-mode), or
  otherwise makes clear which draft it found (e.g. by naming the captured
  idea "dark mode toggle").
- It offers the user a choice among resuming the draft, starting over
  (discarding it), or ignoring it to start a new PRD — it does not have to
  use those exact words, but the three options must be substantively
  present.
- It does NOT immediately ask a fresh "what do you want to build" question
  or otherwise proceed as if no draft existed.

Fail if the response ignores the draft entirely, silently resumes without
asking, or silently starts a new interview without surfacing the draft.
