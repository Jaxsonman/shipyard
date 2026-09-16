---
type: regex
pattern: "\"reason\": \"byte-identical-report\""
flags: ""
match: contains
target: {source: file, path: ".forge/static-header/run/state.json"}
---

Per the contract, `state.noProgress[]` carries
`{"round": N, "reason": "byte-identical-report"}` entries. This checks
the exact reason string was recorded.
