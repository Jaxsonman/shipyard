---
type: regex
pattern: "\"devRound\": 2"
flags: ""
match: contains
target: {source: file, path: ".forge/search-highlight/run/state.json"}
---

Two dev rounds ran (round 1 FAIL, round 2 PASS). `state.json`'s
`devRound` must reflect 2, not 1, once the run reaches its terminal.
