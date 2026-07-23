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
git commit .claude/kanban.config.json -m "chore: configure kanban board target"
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

Slices may depend on each other, but only where genuinely required —
independence remains the goal, and a dependency is the documented
exception, not the norm. A ticket may depend on:

- **A same-run sibling** — refer to it by its number in the proposed
  list; it is resolved to the real ticket ref at creation time (Step 6).
- **An existing board ticket** — before proposing the list, query the
  board once for open tickets (read "List open tickets" in
  `references/github.md` or `references/jira.md`, whichever matches
  `config.backend`) and, where a slice plausibly builds on one, propose
  that link using its real ref.

Reject cyclic dependencies at proposal time — if two slices each depend
on the other, re-slice until the graph is acyclic.

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
Depends on: <ref>
Source PRD: <slug from Step 2>
```

`Depends on:` lines appear only when the ticket has dependencies — one
line per dependency, never comma-separated. `<ref>` is `#<number>` on
GitHub or the issue key (e.g. `PROJ-12`) on Jira.

**Parse contract:** any body line matching `Depends on: <ref>` declares
exactly one dependency. Downstream tooling (`/ship`) parses precisely
this shape — do not vary it.

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
3. User can filter log history — depends on: 2, #45 (existing)
   ...
```

Annotate each dependent ticket's line with `depends on:` — same-run
siblings by their list number, existing board tickets by their real ref
plus an `(existing)` marker.

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

This gate is also where the user adds, removes, or edits dependency
links. Verify that any existing board ticket named as a dependency
actually exists (read "Verify a ticket exists" in `references/github.md` or
`references/jira.md`, whichever matches `config.backend`); a ref that fails
verification is reported here and must be fixed or removed by the user
before creation starts — never guessed at or silently dropped.

## Step 6: Create tickets (best-effort)

Read `references/github.md` or `references/jira.md` (whichever matches
`config.backend`) for the exact create command/tool call. Attempt every
approved ticket whose dependencies succeeded, in dependency order, even if
an unrelated ticket fails — do not stop the whole run on one failure.

Create tickets in dependency order — every ticket after the tickets it
depends on; ties keep the proposed-list order. As each ticket is
created, record its real number/key and substitute it into the
`Depends on:` lines of its dependents before creating them.

If a ticket fails to create, do **not** create its dependents (or their
dependents, transitively) — a dependent created without its
`Depends on:` line would let downstream tooling start it too early.
Record each one as skipped and continue best-effort with unrelated
tickets.

For each ticket, record whether it succeeded (with its URL) or failed (with
the error message).

## Step 7: Summarize

Report the results as three lists:

```
Created (<n>):
- <title> — <url>
- <title> — <url>

Failed (<n>):
- <title> — <error reason>

Skipped (<n>):
- <title> — dependency failed to create: <failed dep title>
```

If anything failed, suggest the user re-run `/kanban` after fixing the
underlying issue (e.g. re-authenticating) — re-running is safe because Step
4's duplicate check will catch tickets that already succeeded, and the retry
creates the failed and skipped remainder with correct `Depends on:` refs.
