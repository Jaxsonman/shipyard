---
type: llm
criteria: "The final message refuses to open a PR because ticket 42 is not ship:approved, explicitly names ship:approved as the missing gate, and names the remedy (a human, or the dashboard's approve action, has to approve the review packet first) rather than proceeding anyway."
target: last_message
---

# Rubric: refusal names the gate and the remedy

This fixture's ticket 42 carries `ship:awaiting-review`, not `ship:approved`.
Per `skills/opening-prs/SKILL.md` Step 1, `preflight.js`'s `pr-gate` check
fails, and the row's remedy is: "the review packet has to be approved
first: a human (or the dashboard's approve action) swaps
`ship:awaiting-review` → `ship:approved`. If the ticket is still in the
loop, `/ship <id>` continues it."

Score PASS only if the final message:
- States plainly that `/pr` did not proceed / refused.
- Names `ship:approved` as the label/gate that is missing (not a vague
  "not ready" with no specifics).
- Names a concrete remedy: that a human or the dashboard must approve the
  review packet (or, if still mid-loop, that `/ship 42` continues it) —
  not just "try again later."
- Does not claim to have pushed, opened a PR, or changed any label.

Score FAIL if the message is vague about which gate is missing, invents a
different reason for stopping, proceeds to push/open a PR/change a label,
or silently succeeds.
