---
type: tool_used
tool: Bash
input_match: "gh\\s+issue\\s+edit.*ship:planned"
min: 0
max: 0
---

Step 7's board update (setting status → Planned via `--add-label
"ship:planned"`) only happens after the artifact is committed. Since
`validate-artifact.js` rejects this draft, the ticket must never be moved
to `ship:planned` in this turn — an `gh issue edit ... --add-label
"ship:planned"` call is a failure however it's phrased.
