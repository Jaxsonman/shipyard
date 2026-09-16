---
type: regex
pattern: "\"reviewRound\": 2"
flags: ""
match: contains
target: {source: file, path: ".forge/duplicate-copy/run/state.json"}
---

Two review rounds ran (round 1 CHANGES, round 2 APPROVE). `state.json`'s
`reviewRound` must reflect 2 once the run reaches its terminal.
