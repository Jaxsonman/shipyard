---
description: Run the autonomous forge loop for an approved intent — developer, QA, and peer review to a PR
argument-hint: "<slug>"
---

Read and follow `${CLAUDE_PLUGIN_ROOT}/skills/running-forge/SKILL.md`.

Slug from the user (may be empty): $ARGUMENTS

If empty, list the slugs under `.forge/*/intent.md` with their `status`
and stop — do not guess which one to run. Otherwise begin the skill's
preflight for that slug.
