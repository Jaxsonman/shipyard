---
name: "Ship-invoked QA runs headless with zero prompts"
tags: ["default"]
runs: 1
max_turns: 12
timeout_seconds: 300
---

You are being invoked exactly the way ship's `qa-verifier` agent invokes
you — this is a **ship-invoked** run, not the interactive `/qa` command.
Per the verifying-branches skill: ship-invoked mode is autonomous, with
zero prompts and zero interactive dependencies (headless browser, no OAuth
flows, no questions). Ship has already resolved everything you need:

- ticket: 7
- branch: feat/7-add-search-box
- worktree path: . (this checkout, already on the branch)
- round: 1 (of loopCap 3)

Read `${CLAUDE_PLUGIN_ROOT}/skills/verifying-branches/SKILL.md` and follow
the ship-invoked path exactly: reuse this worktree, use the confirmed `qa`
config already present in `.claude/ship.config.json`, run the test suite,
and produce a verdict. Do not ask me anything — proceed autonomously to a
final verdict, exactly as ship-invoked mode requires.
