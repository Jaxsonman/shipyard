---
description: Scaffold or interview a forge intent — the human step before /forge
argument-hint: "<slug>"
---

Slug from the user (may be empty): $ARGUMENTS

Before anything else — before reading the skill, before touching any
file — validate it. It must match `^[a-z0-9][a-z0-9-]{0,63}$`:
lowercase letters, digits and dashes only, starting with a letter or a
digit, 64 characters at most. Anything else (uppercase, a slash, a dot,
a space, a leading dash, an empty-but-nonblank value) → stop with
exactly: "slug must be lowercase letters, digits and dashes, starting
with a letter or digit". Do not normalise it, do not guess a correction
— every forge artifact path is keyed by this string.

If empty, ask for a short kebab-case slug before doing anything else,
then validate the answer the same way.

Then read and follow
`${CLAUDE_PLUGIN_ROOT}/skills/authoring-intent/SKILL.md`.
