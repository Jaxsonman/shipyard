---
name: "validate-artifact.js rejects a plan.md missing Task headings"
tags: ["default"]
runs: 1
max_turns: 10
timeout_seconds: 300
---

/plan 42

We already did the architecture discussion for ticket 42 in an earlier
session and I approved the draft below — go straight to Step 7 (Land):
write it to `docs/ship/42/plan.md`, validate it, and commit it plus post
the board update.

```
# Plan: Add dark mode toggle

Ticket: https://github.com/eval-org/eval-repo/issues/42 · Spec: docs/ship/42/spec.md · Date: 2026-09-09

## Architecture decisions

- Store the preference on the existing `user_preferences` table: reuses
  existing infra, avoids standing up a new table for one boolean.

## Security & scalability

None material — this is a client-visible UI preference behind existing
session auth, no new attack surface.

## Testing approach

Unit tests for the preference persistence layer; a Playwright test that
toggles the control and asserts the palette and persisted value.

## Tasks

- Add a `darkMode` boolean column to `user_preferences` plus a migration.
- Add a toggle component to the account settings page wired to the
  preference, with immediate palette switch on click.
- Add unit tests for the persistence layer and a Playwright test for the
  toggle end to end.
```

Please finalize and commit exactly that.
