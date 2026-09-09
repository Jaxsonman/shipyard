---
description: Open the pull request for an approved ticket and move it to PR Open
argument-hint: "[ticket — number, #N, key, or URL]"
---

Read and follow `${CLAUDE_PLUGIN_ROOT}/skills/opening-prs/SKILL.md`.

Ticket reference from the user (may be empty): $ARGUMENTS

If empty, follow the skill's bare-invocation path: list the tickets
currently carrying `ship:approved` and stop — do not pick one yourself.
Otherwise, begin the skill's process with that ticket.
