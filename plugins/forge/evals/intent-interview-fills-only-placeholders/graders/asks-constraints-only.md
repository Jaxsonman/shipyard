---
type: llm
criteria: "The response asks a single question about the intent's 'Constraints' section — the first section still holding template placeholder text — and does not ask about Problem, Desired outcome, or Done means (already answered by the human in the fixture), and does not ask about more than one still-placeholder section in the same message."
focus: last_message
---

Per `skills/authoring-intent/SKILL.md` Step 2, a still-draft intent is
interviewed one placeholder section at a time, in template order, and a
section the human already wrote into is never re-asked. In this fixture
Problem/Desired outcome/Done means are answered; Constraints/Context/Out
of scope/How to run are still placeholder, so Constraints (the first of
those, in template order) must be the only thing asked about this turn.

Score FAIL if the response asks about an already-answered section, asks
about more than one section at once, or silently fills in an answer
without asking.
