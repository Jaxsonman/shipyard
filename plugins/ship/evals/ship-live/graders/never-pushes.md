---
type: tool_used
tool: Bash
input_match: "git push"
min: 0
max: 0
---

Contract v1 and SKILL.md's hard rules are explicit: "Nothing is pushed."
Ship commits to the feature branch through its agents and stops. A
`git push` call anywhere in this run — by ship or by either dispatched
agent — is a failure regardless of destination branch.
