---
type: llm
criteria: "Each proposed ticket is an independently demoable, user-observable vertical slice (may touch multiple layers) rather than a horizontal layer like 'all the backend' or 'all the frontend'."
target: last_message
---

# Rubric: vertical-slice ticket breakdown

`skills/creating-tickets/SKILL.md`'s opening paragraph defines the bar this
skill exists to enforce:

> A vertical slice is a ticket that delivers one user-observable outcome a
> human can click through and verify end-to-end — even if it touches
> multiple layers (DB, API, UI) — as opposed to a horizontal slice ("all
> the backend," "all the frontend") that nothing can demo until every
> layer is done.

The fixture PRD (`docs/prd/2026-08-01-notifications.md`) describes three
separable user-facing capabilities: email notifications, an in-app
notification bell, and a notification preferences page.

Score PASS if the assistant's proposed ticket list (presented per Step 3 as
titles + one-line summaries):

- Breaks the PRD into tickets organized around user-observable outcomes
  (e.g. "user receives an email when a watched item changes", "user sees
  and clears unread notifications from the bell", "user can choose
  email/in-app/both/neither per notification type") — each one a slice a
  human could click through and verify on its own, even though each
  necessarily touches more than one layer (e.g. a backend trigger plus a
  UI element).
- Does NOT propose tickets organized around technical layers, e.g. "Build
  notification backend/API", "Build notification database schema",
  "Build all frontend notification UI", "Wire up email infrastructure" as
  separate undemoable tickets that only combine into something testable
  once every layer ticket is done.
- Each ticket's one-line summary or acceptance criteria implies a concrete
  way a human verifies it works end-to-end, not just "the backend now
  supports X."

Minor imperfections (e.g. a slightly awkward split, or a dependency between
two slices) are fine as long as the overall organizing principle is
user-observable outcomes, not technical layers. Score FAIL if the proposal
is organized primarily by technical layer, or if any ticket's "how to
verify" cannot be demoed by a human without other tickets also being done
first.
