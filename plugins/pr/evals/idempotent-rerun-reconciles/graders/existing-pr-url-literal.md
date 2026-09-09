---
type: regex
pattern: "https://github\\.com/acme/widgets/pull/7"
flags: ""
match: contains
target: last_message
---

The `gh pr list` shim reports the already-open PR at
`https://github.com/acme/widgets/pull/7`. Per opening-prs/SKILL.md Step 4,
the final message must report that URL rather than any newly-minted one.
