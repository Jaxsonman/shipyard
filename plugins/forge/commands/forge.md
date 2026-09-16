---
description: Run the autonomous forge loop for an approved intent — developer, QA, and peer review to a PR
argument-hint: "<slug>"
---

Slug from the user (may be empty): $ARGUMENTS

Before anything else — before reading the skill, before touching any
file, before creating a branch or a worktree — validate it. It must
match `^[a-z0-9][a-z0-9-]{0,63}$`: lowercase letters, digits and dashes
only, starting with a letter or a digit, 64 characters at most. Anything
else (uppercase, a slash, a dot, a space, a leading dash, an
empty-but-nonblank value) → stop with exactly: "slug must be lowercase
letters, digits and dashes, starting with a letter or digit". Do not
normalise it, do not guess a correction — this string becomes a branch
name, a worktree directory, and every artifact path in the run.

If empty, list the slugs under `.forge/*/intent.md` with their `status`
and stop — do not guess which one to run.

Otherwise read and follow
`${CLAUDE_PLUGIN_ROOT}/skills/running-forge/SKILL.md` and begin its
preflight for that slug.
