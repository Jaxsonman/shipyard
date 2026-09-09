---
type: regex
pattern: "at least one \"### Task N\" heading"
flags: ""
match: contains
target: last_message
---

The supplied draft's `## Tasks` section uses plain bullets instead of
`### Task <n>: <outcome>` headings. Running
`node "${CLAUDE_PLUGIN_ROOT}/scripts/validate-artifact.js" plan <path>`
against that file exits 1 and prints, verbatim, on stderr:

```
missing sections in <path>:
  - at least one "### Task N" heading
```

The skill (planning-tickets SKILL.md Step 7) must run this exact check
before committing and must surface its failure rather than silently
proceeding, so the agent's final message should relay this literal
missing-section string (or the validator's stderr containing it)
somewhere the user can see it.
