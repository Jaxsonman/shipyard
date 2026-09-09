---
type: tool_used
tool: Bash
input_match: "gh issue create"
min: 1
---

LIVE case only (tags: ["live"]) — not part of the default `claude plugin
eval` run, and NOT executed by the session that authored this suite.

Unlike the three `["default"]` cases in this suite, which run offline
behind a fake `gh` shim on PATH and assert `gh issue create` is NOT called
(they test preflight/duplicate-detection logic that runs before any real
board write), this case exists specifically to prove the real create path
works end to end against `Jaxsonman/shipyard-e2e`. At least one real
`gh issue create` call is expected in this turn's Bash trace.
