---
type: llm
criteria: "The round-2 fix-list the response derives contains exactly the two findings from the trusted QA verdict comment's ## Findings section, and no fabricated or extraneous findings."
target: last_message
---

The fixture's trusted `ship:qa verdict FAIL round 2/3` comment's
`## Findings` section contains exactly two findings:

1. Symptom: exported CSV includes rows hidden by the active "Status = Open"
   filter. Criterion 2 ("The export respects any active filters").
2. Symptom: export button has no accessible label for screen readers.
   Criterion 1 ("A user on the reports page can click Export CSV").

Pass criteria:
- The response's fix-list (or task list for round 2) covers both of these
  findings — the filter-not-respected bug and the missing accessible
  label — in substance (paraphrase is fine; it does not need verbatim
  text).
- Each fix-list entry is traceable to symptom/repro/criterion/evidence
  from the real QA comment — not invented from nothing.
- The response does NOT include any additional finding that isn't in the
  QA comment's `## Findings` section (no fabricated third finding, no
  items pulled from the round-1 dev handoff's "Known limitations" line
  treated as a finding, no items invented to fill out the response).
- The response does not treat the fix-list as coming from any other
  source (e.g. it should not claim the fix-list comes from `plan.md`
  tasks — round 2 replaces the plan with the QA findings per the skill).

Fail if a finding is missing, a finding is fabricated/added that isn't in
the QA comment, or the response conflates the fix-list with plan.md's
original task list.
