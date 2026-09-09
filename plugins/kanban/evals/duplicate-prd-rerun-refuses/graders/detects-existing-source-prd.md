---
type: llm
criteria: "The assistant finds the existing GitHub issue #101 (which carries the literal body line 'Source PRD: 2026-08-01-widget'), reports it as already existing for this PRD, and does not treat the run as if no prior tickets existed."
target: last_message
---

# Rubric: duplicate detection via the literal Source PRD marker

Contract §13 defines kanban's idempotency mechanism: duplicate detection
searches ticket bodies for the literal line `Source PRD: <slug>` — never a
GitHub search qualifier (`in:body` tokenizes on the colon and is unreliable).
SKILL.md Step 4 requires the assistant to fetch tickets, filter locally for
that exact body line, and report matches as an "Already exists" list before
asking the user to confirm anything further.

This fixture's `gh issue list` shim returns exactly one issue (#101,
"User can view their widget dashboard") whose body contains the literal line
`Source PRD: 2026-08-01-widget` — the same slug this PRD (docs/prd/2026-08-01
-widget.md) derives.

Score PASS if the assistant's final message:

- References issue #101 (by number, title, or URL) as an existing ticket
  for this PRD, i.e. it demonstrably found and used the `Source PRD:` body
  match rather than only looking at titles.
- Does not present a fresh "Proposed tickets for 2026-08-01-widget" list
  as if this were a first run with zero existing work — the existing
  ticket must be acknowledged.
- Either stops to ask the user how to proceed given the existing ticket,
  or otherwise makes clear that recreating the full set is not happening
  automatically.

Score FAIL if the assistant ignores the existing issue, proposes a full
fresh ticket breakdown with no mention of #101, or otherwise behaves as if
this PRD had never been run before.
