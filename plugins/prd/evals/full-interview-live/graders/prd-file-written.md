---
type: file_exists
path: "docs/prd/*.md"
---
A finished (non-draft) PRD file must exist at `docs/prd/<YYYY-MM-DD>-<slug>.md`
by the end of the run — this glob matches both the finished `.md` and a
leftover `.draft.md`, so combine with the LLM grader below, which checks the
file actually reads as a complete PRD (the writing-prds skill deletes the
draft once the finished PRD is written, so a passing run should leave only
the finished file behind).
