---
description: Verify a branch — test suite + real per-criterion E2E, tiered verdict with evidence
argument-hint: "[branch | ticket | --env-check]"
---

Read and follow `${CLAUDE_PLUGIN_ROOT}/skills/verifying-branches/SKILL.md`.

Input from the user (may be empty): $ARGUMENTS

This is a **standalone (interactive)** invocation — the skill's
standalone rules apply: scratch worktree, first-run interview allowed,
derived criteria require confirmation, board status is never touched.

If the input contains `--env-check`, strip the flag from the input
before resolution (the remainder, if any, is the branch) and run the
skill's env-check mode: resolve, bring up, report, tear down — no
tests, no E2E, no comment.
