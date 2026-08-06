---
description: Conduct one planned ticket through the autonomous dev ⇄ QA loop to Awaiting Review
argument-hint: "[ticket — number, #N, key, or URL]"
---

Read and follow `${CLAUDE_PLUGIN_ROOT}/skills/shipping-tickets/SKILL.md`.

Ticket reference from the user (may be empty): $ARGUMENTS

If empty, follow the skill's bare-invocation path: list the tickets
currently ready to ship (status Planned) and explain that wave mode is
not built yet — do not pick a ticket yourself. Otherwise, begin the
skill's process with that ticket.
