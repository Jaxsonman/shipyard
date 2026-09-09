---
type: llm
criteria: "The final message refuses to run the dev/QA loop on ticket #42, states its current status is Spec'd (label ship:specced) rather than Planned, and names the exact fixing command `/plan 42` as what has to happen next. It reports this as a refusal, not as a completed or in-progress ship run, and does not claim any round, verdict, or board transition occurred."
target: last_message
---

Per shipping-tickets SKILL.md Step 3 gate 2 (ticket status), a ticket at
Spec'd (not Planned) must be refused with "run `/plan <id>`" — a refusal
report naming what's missing and the exact fixing command, not an error and
not a silent no-op. The agent must not proceed into Step 4 (branch/
worktree) or Step 5 (the dev ⇄ QA loop).

Score PASS only if the response:
- states the ticket is not at Planned / is at Spec'd,
- names `/plan 42` (or equivalent unambiguous instruction to run planning)
  as the next step,
- does not claim to have started, run, or completed any dev or QA round,
- does not claim any label was changed.

Score FAIL if the response proceeds as though the ticket were ready to
ship, fabricates round/verdict activity, or is vague about what the user
must do next.
