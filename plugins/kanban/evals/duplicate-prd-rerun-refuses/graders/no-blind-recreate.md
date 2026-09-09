---
type: tool_used
tool: Bash
input_match: "gh issue create"
min: 0
max: 0
---

An issue already exists for this PRD's `Source PRD: 2026-08-01-widget`
marker (see the `gh issue list` shim output). SKILL.md Step 4/5 requires
reporting matches under "Already exists" and getting user approval before
creating anything else — a run must never silently duplicate. This turn
should not call `gh issue create` at all: either the assistant stops to
report/ask (expected), or it decides remaining slices are genuinely new,
but even then the approval gate (Step 5) must fire first, and this is a
single eval turn with no human available to grant that approval. The fake
`gh` shim in this case's setup.sh also does not implement `issue create`
and will fail loudly if invoked, reinforcing that this call must not
happen.
