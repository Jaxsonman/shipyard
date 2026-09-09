---
type: tool_used
tool: Bash
input_match: "git\\s+(-C\\s+\\S+\\s+)?push"
min: 1
max: 1
---

`/pr` is the pipeline's only pushing stage, and Step 5 pushes exactly once
("The pipeline's one push"). This is the one case in the suite where a
push is expected — exactly one, never zero, never more than one, never
with `--force`.
