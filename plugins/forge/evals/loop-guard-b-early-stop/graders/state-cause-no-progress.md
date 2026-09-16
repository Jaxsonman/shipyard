---
type: regex
pattern: "\"escalated\": true[\\s\\S]*\"cause\": \"no-progress\""
flags: ""
match: contains
target: {source: file, path: ".forge/static-header/run/state.json"}
---

This checks the exact terminal cause string `no-progress` was written to
`state.json`, not `qa-cap` or any other value. It also asserts
`"escalated": true`: round 1 and round 2's findings are byte-identical,
so the finding-id set is trivially identical too — guard A fires here
just as guard B does — before guard B's terminal override wins. Field
order in `state.json` puts `escalated` ahead of `terminal.cause` (see
`references/contracts.md`'s example), so a single ordered pattern
checks both.
