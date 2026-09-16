---
type: regex
pattern: "\"cause\": \"no-progress\""
flags: ""
match: contains
target: {source: file, path: ".forge/static-header/run/state.json"}
---

This checks the exact terminal cause string `no-progress` was written to
`state.json.terminal.cause`, not `qa-cap` or any other value. Guard B
fires on a byte-identical report and its terminal override wins over the
ordinary cap outcome, so this is the only cause that can be correct
here. This grader asserts that one field and nothing else — it never
depends on where `escalated` sits in the file, so field order in
`state.json` cannot make it pass or fail for the wrong reason.
