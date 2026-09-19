---
type: regex
pattern: "\"escalated\": true"
flags: ""
match: contains
target: {source: file, path: ".forge/flaky-summary/run/state.json"}
---

`state.json` must record `escalated: true` once guard A has fired,
regardless of the run also reaching a cap terminal in the same fixture.
