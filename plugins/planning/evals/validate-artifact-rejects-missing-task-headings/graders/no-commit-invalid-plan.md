---
type: tool_used
tool: Bash
input_match: "git\\s+commit.*docs/ship/42/plan\\.md|git\\s+add.*docs/ship/42/plan\\.md.*&&.*commit"
min: 0
max: 0
---

planning-tickets SKILL.md Step 7 is explicit: "Never commit an artifact
that fails this gate." `validate-artifact.js` exits 1 on this fixture (see
`surfaces-missing-task-heading.md`), so a `git commit` invocation naming
`docs/ship/42/plan.md` anywhere in this turn's Bash trace is a failure,
regardless of whether the agent believes the file is otherwise ready.
