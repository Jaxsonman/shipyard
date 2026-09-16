---
type: regex
pattern: "Reef hobbyists running automated dosing pumps have no warning"
flags: ""
match: contains
target: {source: file, path: ".forge/tank-alerts/intent.md"}
---

The human-written Problem text must survive this turn unchanged — the
interview only ever fills a placeholder section, never rewrites one a
human already answered. This checks the exact hand-written sentence is
still present verbatim in the file after this turn (whether or not the
file was touched at all this turn, which is expected — the agent should
be asking a question, not yet writing).
