---
type: llm
criteria: "The response states that the intent for tank-alerts is still `draft` (not approved) and directs the user to run /intent tank-alerts to finish and approve it, rather than starting a run, creating a branch, or claiming any progress."
focus: last_message
---

Per `skills/running-forge/SKILL.md` Step 0 check 1, an intent whose
frontmatter `status` is not `approved` must stop the run immediately,
naming the exact fix (`/intent tank-alerts`). Score FAIL if the response
proceeds past this check in any way (mentions creating a branch/worktree,
dispatching an agent, or reports any round outcome).
