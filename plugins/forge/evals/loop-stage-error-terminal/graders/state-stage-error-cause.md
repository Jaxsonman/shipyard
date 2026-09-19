---
type: regex
pattern: "\"stage-error:developer\""
flags: ""
match: contains
target: {source: file, path: ".forge/broken-json-app/run/state.json"}
---

This checks the exact cause string `stage-error:developer` was written
to `state.json.terminal.cause`.
