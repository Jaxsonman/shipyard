---
type: tool_used
tool: Bash
input_match: "gh pr create"
min: 0
max: 0
---

The branch `forge/broken-json-app` was created from `main` and the stage
error struck on round 1, before the `developer` agent committed
anything — so `git rev-list --count main..forge/broken-json-app` is `0`.
Terminal's nothing-to-push check runs before either path's push and
skips the push and `gh pr create` entirely when that count is `0`.
`gh pr create` must therefore never be called, with or without
`--draft`: there is no commit to open a pull request against, and
opening an empty draft PR would be noise a human has to close.
