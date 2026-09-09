---
name: speccing-tickets
description: Guided PM/UX session that turns a board ticket into an approved spec.md — alignment on what the ticket really means, what done looks like, UX intent, edge cases, and the context a dev agent needs. Use when the user wants to spec a ticket or runs /spec.
---

# Speccing Tickets

A per-ticket PM/UX session. Output: `docs/ship/<id>/spec.md` committed in
the user's project, ticket status → `Spec'd`, and a summary comment on the
ticket. Ambiguity dies here, with the human in the room — an approved spec
has no open questions.

Backend mechanics live in `../../references/github.md` and
`../../references/jira.md` (relative to this skill's directory). Whenever a
step says "via the backend reference," read the file matching
`config.backend` and follow its named operation exactly (fetch ticket, edit
ticket body, set status, post comment).

## Step 1: Preflight and ticket

    node "${CLAUDE_PLUGIN_ROOT}/scripts/preflight.js" --stage spec

Exit 0 → continue. Exit 2 → usage error, stop.

Exit 1 → read the JSON `checks[]` array (ids live there, not in `reasons[]`).
If the only failing check has id `config`, bootstrap it (ask backend and
target, one question at a time, then
`node "${CLAUDE_PLUGIN_ROOT}/scripts/config.js" bootstrap kanban --backend <b> --target <t>`,
printing any `notes` the script returned verbatim) and re-run preflight;
otherwise print the `reasons` verbatim and stop.

Read the config with `node "${CLAUDE_PLUGIN_ROOT}/scripts/config.js" show kanban`
— `.kanban.backend` and `.kanban.target` (schema: contract §12.1). Then
resolve the user's ticket reference to the
canonical `<id>` per the backend reference, and fetch the ticket. Fetch
failure → report the exact error and stop.

Capture the stage start now — it goes in the comment's metrics footer:

    node "${CLAUDE_PLUGIN_ROOT}/scripts/metrics.js" now

`<id>` in every path below is the canonical id resolved above.

## Step 2: Where does this ticket stand?

- **`docs/ship/<id>/spec.md` already exists** → present three options and
  wait: **revise** (continue to Step 3, using the existing spec.md as the
  draft under discussion), **finish board updates** (skip to Step 7's board
  operations — for re-runs after a board operation failed), or **abort**.
- **Only `docs/ship/<id>/spec.draft.md` exists** (no spec.md) → an earlier
  interview was interrupted: show the answers captured so far and offer
  **resume** (continue from the section named by `next=`) or **start over**
  (delete the draft, restart at Step 4).
- **Ticket is already past this stage** (per the label-ladder ordering,
  contract §4) → warn that re-speccing invalidates `plan.md` and downstream
  work, and require explicit confirmation before continuing. If the user
  proceeds and approves a revised spec, tell them `plan.md` needs revisiting
  and offer to reset the status to `Spec'd`.

## Step 3: Context gathering

Light exploration only — this hat is about intent, not implementation:

- If the ticket body has a `Source PRD: <slug>` line (contract §13), glob
  `docs/prd/*<slug>*.md`:
  - **exactly 1 match** → read it;
  - **0 matches** → say the PRD named by the ticket is missing, and continue
    the interview without it (the ticket body is then the only source);
  - **>1 match** → list the matches and ask the user which one; never guess.
- Skim the code areas the ticket touches, enough to ask informed questions
  and to later point the dev agent at the right places.

## Step 4: Guided interview

One question at a time, /prd style. Start from the ticket's existing
description and acceptance criteria — never re-ask what the ticket already
answers. Prefer multiple choice where natural. Drive toward filling every
template section in Step 6: what the ticket really means, what "done"
looks like concretely (testable), UX intent, edge cases and failure modes,
and the context a dev agent will need. Push on vague acceptance criteria
until they are checkable.

- **After every answer**, write the spec sections filled so far to
  `docs/ship/<id>/spec.draft.md`, ending with
  `<!-- spec-draft: next=<section> -->`. Delete it once `spec.md` is
  written in Step 7. It is never committed.

## Step 5: Ticket repair (when needed)

If the session reveals the ticket body is wrong or unclear (bad acceptance
criteria, wrong scope), propose a revised ticket body, get the user's
approval, and update it on the board via the backend reference (edit
ticket body). The board and the spec must never disagree.

## Step 6: Draft and approval gate

Draft `spec.md` using this exact template — every section always present:

```
# Spec: <ticket title>

Ticket: <ticket URL> · Date: <YYYY-MM-DD> · Source PRD: <slug or "none">

## Problem

<what this ticket is really solving, restated>

## Done means

1. <expanded, testable acceptance criterion>
2. <...>

## UX intent

<flows, states, copy tone — or "N/A — not user-facing">

## Edge cases & failure modes

- <case → expected behavior>

## Context for implementation

<relevant files/modules, conventions, prior art the dev agent needs>

## Out of scope

- <explicitly excluded things>
```

Present the full draft in session. The user approves or requests edits.
**Any unresolved question blocks approval** — resolve it in conversation
first; there is no "Open questions" section in an approved spec. Write
nothing (no files, no board changes) before approval.

## Step 7: Land

In order:

1. Write `docs/ship/<id>/spec.md`, delete `spec.draft.md` if present, then
   validate it against contract §13 before committing:

       node "${CLAUDE_PLUGIN_ROOT}/scripts/validate-artifact.js" spec docs/ship/<id>/spec.md

   Exit 0 → commit below. Exit 1 → the missing or renamed sections are
   printed on stderr (`--json` for the full report); fix the file and
   re-run. Never commit an artifact that fails this gate — downstream
   fix-list and progress parsing depend on the exact headings.

   ```bash
   git add docs/ship/<id>/spec.md
   git commit docs/ship/<id>/spec.md -m "docs(ship): spec for ticket <id>"
   ```

   If the artifact is already committed and unchanged (re-run recovery),
   skip this sub-step and proceed to the board operations.

2. Set status → `Spec'd` via the backend reference; the ladder, its labels,
   colours and descriptions are contract §4.
3. Build the comment. Its **first line is the header** `ship:spec approved`
   and the emoji title moves to line two — the exact shape is contract §5.1;
   copy it from there rather than from memory.

   On the **GitHub backend only**, append the metrics footer as the last
   line (contract §10; Jira comments carry none):

       node "${CLAUDE_PLUGIN_ROOT}/scripts/metrics.js" footer --stage spec --started <the ISO time from Step 1> --finished "$(node "${CLAUDE_PLUGIN_ROOT}/scripts/metrics.js" now)"

   Nothing hand-writes that line. Post the file via the backend reference.

If a board operation fails after the commit, report the exact error
verbatim and stop — never claim a status was set without seeing the
operation succeed. Re-running `/spec <id>` recovers via Step 2's "finish
board updates" option.

## Step 8: Report

Confirm what happened (spec path + commit, status change, comment link)
and suggest `/plan <id>` as the next step.
