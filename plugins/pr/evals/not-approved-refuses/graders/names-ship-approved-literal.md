---
type: regex
pattern: "ship:approved"
flags: ""
match: contains
target: last_message
---

Belt-and-suspenders literal check alongside the LLM rubric: the final
message must name the label `ship:approved` verbatim as the gate `/pr`
requires (contract §4, opening-prs/SKILL.md Step 1's `pr-gate` remedy row).
