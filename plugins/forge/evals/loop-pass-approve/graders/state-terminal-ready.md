---
type: regex
pattern: "\"kind\": \"ready\""
flags: ""
match: contains
target: {source: file, path: ".forge/empty-cart-badge/run/state.json"}
---

`state.json` is main-root-resident per this plan's path-root convention,
so it is directly gradable. After a full pass, `terminal.kind` must be
written as `"ready"`.
