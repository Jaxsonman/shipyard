---
type: llm
criteria: "The response identifies this as a stage error on the developer agent (two consecutive non-JSON final messages for round 1), records it, and reaches a draft terminal with cause stage-error:developer. It then finds that the branch carries no commits, so it opens NO pull request at all and says so plainly — the run produced no commits, nothing was pushed, no PR exists — rather than reporting a PR, a PR URL, or a PR-creation failure. It never claims any round actually completed, never fabricates a dev-handoff.json, and never infers a pass/fail verdict from the agent's prose."
focus: last_message
---

Per `skills/running-forge/SKILL.md`'s stage-error rule: a dispatched
agent's final message that is missing or not valid JSON is retried once;
a second such failure is a stage error, recorded in `state.stageErrors`,
leading straight to Terminal (draft, cause `stage-error:developer`).

Terminal's nothing-to-push check then runs before either path's push.
The stage error struck on round 1 before the developer committed
anything, so `main..forge/broken-json-app` counts `0` commits: the push
and `gh pr create` are skipped, `terminal.pr` stays `null`, and the
report says so. Score FAIL if the response invents a handoff, treats the
prose as a progress report, claims a normal round outcome, opens or
claims a PR, or reports a PR-creation failure — nothing failed to be
created here; nothing was attempted.
