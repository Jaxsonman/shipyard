---
type: llm
criteria: "The response reports that ticket #44 has exhausted its loop cap (2 rounds, both QA FAIL) and is being escalated to Needs Human, citing cause `cap` — not `static`, `stage-error`, or `reconcile`. It should summarize what QA kept finding across the two rounds and what dev tried, consistent with the Step 7 cap-escalation body shape (contract v1 §5.8, §8; SKILL.md Step 7), and must not claim a third round will run or that the ticket passed."
target: last_message
---

Score PASS if the response:
- correctly identifies this as a cap/loop-exhaustion escalation (round 2
  of 2, both FAIL),
- does not invent or use any escalation cause other than `cap`,
- does not claim QA passed or that the ticket moved to Awaiting Review,
- does not claim a round 3 will or should run (M = 2, so N = M and the
  loop is over per contract §9),
- moves (or reports moving) the ticket toward `Needs Human`.

Score FAIL if the response uses a wrong cause word, invents a passing
verdict, proposes running another round beyond the configured cap, or is
too vague to tell which escalation cause applies.
