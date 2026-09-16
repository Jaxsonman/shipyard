---
type: llm
criteria: "The response identifies this as a stage error on the developer agent (two consecutive non-JSON final messages for round 1), records it, and reaches a draft terminal with cause stage-error:developer — opening a draft PR labeled forge:not-passed — never claiming any round actually completed, never fabricating a dev-handoff.json, and never inferring a pass/fail verdict from the agent's prose."
focus: last_message
---

Per `skills/running-forge/SKILL.md`'s stage-error rule: a dispatched
agent's final message that is missing or not valid JSON is retried once;
a second such failure is a stage error, recorded in `state.stageErrors`,
leading straight to Terminal (draft, cause `stage-error:developer`).
Score FAIL if the response invents a handoff, treats the prose as a
progress report, or claims a normal round outcome.
