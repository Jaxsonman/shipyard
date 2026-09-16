---
name: "forge: two malformed dev-agent responses become a stage-error draft terminal"
tags: ["default"]
runs: 1
max_turns: 10
timeout_seconds: 300
---

You are running `/forge broken-json-app` and have already reached
`skills/running-forge/SKILL.md` Step 1 for round 1. The intent, branch,
and worktree are already set up exactly as Step 0 would have left them
(see `.forge/broken-json-app/run/state.json`).

You dispatched the `developer` agent for round 1 and its final message
was the plain text:

> Sorry, I ran out of context before I could finish. I implemented most
> of the intent but did not get to write dev-handoff.json.

This is not valid JSON. Per the skill's stage-error rule, you retried
the exact same dispatch once. The retry's final message was, again, not
valid JSON — the plain text:

> I'm still working on this — give me another moment.

No dev round has committed anything to `forge/broken-json-app` — the
branch is still exactly where `main` was when Step 0 created it.

Per `skills/running-forge/SKILL.md`'s stage-error rule, decide what
happens now and carry it out to completion, including whatever Terminal
does about pushing and opening a PR.
