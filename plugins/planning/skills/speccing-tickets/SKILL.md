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
`config.backend` and follow its named operation exactly (auth check, fetch
ticket, edit ticket body, set status, post comment).

## Step 1: Config and ticket

Read `.claude/kanban.config.json`.

**If missing**, ask one question at a time:

1. "Which board are your tickets on: GitHub or Jira?"
2. If GitHub: "Which repo? (owner/repo format)"
   If Jira: "Which Jira project key?"

Write `{"backend": "...", "target": "..."}` to
`.claude/kanban.config.json` and commit it:

```bash
git add .claude/kanban.config.json
git commit .claude/kanban.config.json -m "chore: configure kanban board target"
```

**If present**, never re-prompt.

Then resolve the user's ticket reference to the backend's canonical id
(issue number for GitHub, issue key for Jira — the backend reference
defines accepted forms), run the auth check, and fetch the ticket. Fetch
failure → report the exact error and stop.

`<id>` in every path below is that canonical id.

## Step 2: Where does this ticket stand?

- **`docs/ship/<id>/spec.md` already exists** → present three options and
  wait: **revise** (continue to Step 3, using the existing spec.md as the
  draft under discussion), **finish board updates** (skip to Step 7 — for
  re-runs after a board operation failed), or **abort**.
- **Ticket is already past this stage** (status/label is `Planned`,
  `ship:planned`, or later) → warn that re-speccing invalidates
  `plan.md` and downstream work, and require explicit confirmation before
  continuing. If the user proceeds and approves a revised spec, tell them
  `plan.md` needs revisiting and offer to reset the status to `Spec'd`.

## Step 3: Context gathering

Light exploration only — this hat is about intent, not implementation:

- If the ticket body has a `Source PRD: <slug>` line, look for a matching
  file in the project (typically `docs/prd/*<slug>*.md`) and read it.
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

1. Write `docs/ship/<id>/spec.md` and commit **only that path** (never a
   blanket commit — the user's tree may be dirty):

   ```bash
   git add docs/ship/<id>/spec.md
   git commit docs/ship/<id>/spec.md -m "docs(ship): spec for ticket <id>"
   ```

2. Set status → `Spec'd` via the backend reference.
3. Post a ticket comment via the backend reference:

   ```
   📋 Spec approved — `docs/ship/<id>/spec.md`

   - <one line: what done means>
   - <one line: key decision or edge case>
   - <one line: notable out-of-scope item>

   Next: /plan <id>
   ```

If a board operation fails after the commit, report the exact error
verbatim and stop — never claim a status was set without seeing the
operation succeed. Re-running `/spec <id>` recovers via Step 2's "finish
board updates" option.

## Step 8: Report

Confirm what happened (spec path + commit, status change, comment link)
and suggest `/plan <id>` as the next step.
