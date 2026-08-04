---
description: Autonomous implementation — execute a ticket's approved plan test-first and hand off to QA
argument-hint: "[ticket — number, #N, key, or URL]"
---

Read and follow `${CLAUDE_PLUGIN_ROOT}/skills/implementing-tickets/SKILL.md`
in standalone mode.

Ticket reference from the user (may be empty): $ARGUMENTS

If empty, ask which ticket to implement (a ticket number, key, or URL)
before proceeding. Otherwise, begin the skill's process with that ticket.
