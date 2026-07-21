---
name: creating-tickets
description: Breaks a PRD down into small, human-testable vertical-slice tickets and creates them on a real board (GitHub Issues or Jira). Use when the user wants to turn a PRD into tickets, create a kanban backlog, or runs /kanban.
---

# Creating Tickets

Turn a PRD into vertical-slice tickets, then create them on the user's
configured board. A vertical slice is a ticket that delivers one
user-observable outcome a human can click through and verify end-to-end —
even if it touches multiple layers (DB, API, UI) — as opposed to a
horizontal slice ("all the backend," "all the frontend") that nothing can
demo until every layer is done.

## Step 1: Config check

Look for `.claude/kanban.config.json` in the current project.

**If missing**, ask the user, one question at a time:

1. "Which board should tickets go to: GitHub or Jira?"
2. If GitHub: "Which repo? (owner/repo format)"
   If Jira: "Which Jira project key?"

Write the answer to `.claude/kanban.config.json`:

```json
{
  "backend": "github",
  "target": "owner/repo"
}
```

or

```json
{
  "backend": "jira",
  "target": "PROJECTKEY"
}
```

This file holds no secrets — auth is handled separately (`gh auth` for
GitHub, an OAuth prompt on first Jira tool call for Jira). Commit it:

```bash
git add .claude/kanban.config.json
git commit -m "chore: configure kanban board target"
```

**If present**, read it and skip straight to Step 2 — never re-prompt.

## Step 2: Read the PRD

The user's input is either a file path or raw pasted PRD text.

- If it looks like a file path, read that file.
- Otherwise, treat the input itself as the PRD text.

Derive a short kebab-case **slug** identifying this PRD:
- File path input: use the filename without extension (e.g.
  `docs/prd/2026-07-20-reef-tank.md` → `2026-07-20-reef-tank`).
- Raw text input: slugify the first heading or first line (e.g. "# Reef Tank
  Monitor" → `reef-tank-monitor`).

This slug is embedded in every ticket's `Source PRD:` line and is what Step
4's duplicate check searches for.

## Step 3: Propose the vertical-slice ticket breakdown

Decompose the PRD into vertical slices using judgment — there is no fixed
ratio of tickets to PRD sections. For each candidate slice, apply INVEST-style
criteria:

- **Independent** — demoable without waiting on a sibling slice, wherever
  the PRD's own dependencies allow it.
- **Small** — scoped to what a single AI dev agent can implement and a
  human can verify in one sitting. If a slice feels too big, split it along
  its next-smallest observable outcome, not along technical layers.
- **Testable** — has concrete, checkable acceptance criteria, not vague
  intent like "improve performance."

For each slice, write a ticket using this exact template:

```
## Description

<what this slice does and why, derived from the relevant PRD section(s)>

## Acceptance Criteria

1. <testable criterion>
2. <testable criterion>

## How to verify

<one explicit sentence describing exactly how a human confirms this slice
works end-to-end>

---
Source PRD: <slug from Step 2>
```

Present the **full list** to the user in one message: each ticket's title
plus a one-line summary (not the full body yet — that would be too long to
scan). Example:

```
Proposed tickets for <slug>:

1. User can create a water-parameter log entry
   Form + save endpoint + confirmation toast; verified by submitting a
   reading and seeing it in the log list.
2. User can view their log history
   ...
```

## Step 4: Duplicate check

Before creating anything, check whether tickets from this PRD already exist
on the board. Read `references/github.md` or `references/jira.md`
(whichever matches `config.backend`) for the exact search command, and
search for the literal string `Source PRD: <slug>`.

If any matches are found, tell the user what was found (titles + links) and
ask them to confirm before proceeding — do not silently skip or silently
create duplicates.

## Step 5: Approval gate

Wait for the user to approve the proposed list from Step 3, or to request
edits (add, remove, reword slices). Only proceed to Step 6 once they approve
the list as a whole. Do not create anything before this gate.

## Step 6: Create tickets (best-effort)

Read `references/github.md` or `references/jira.md` (whichever matches
`config.backend`) for the exact create command/tool call. Attempt every
approved ticket, in order, even if an earlier one fails — do not stop the
whole run on one failure.

For each ticket, record whether it succeeded (with its URL) or failed (with
the error message).

## Step 7: Summarize

Report the results as two lists:

```
Created (<n>):
- <title> — <url>
- <title> — <url>

Failed (<n>):
- <title> — <error reason>
```

If anything failed, suggest the user re-run `/kanban` after fixing the
underlying issue (e.g. re-authenticating) — re-running is safe because Step
4's duplicate check will catch tickets that already succeeded.
