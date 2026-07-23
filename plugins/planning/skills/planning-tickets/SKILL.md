---
name: planning-tickets
description: Engineer-hat session that turns a spec'd ticket into an approved, executable plan.md — architecture decisions, security and scalability, testing approach, and an ordered task list. Use when the user wants to plan a ticket's implementation or runs /plan.
---

# Planning Tickets

A per-ticket Engineer session, heavily human-driven. Output:
`docs/ship/<id>/plan.md` committed in the user's project, ticket status →
`Planned`, and a summary comment on the ticket.

Backend mechanics live in `../../references/github.md` and
`../../references/jira.md` (relative to this skill's directory). Whenever a
step says "via the backend reference," read the file matching
`config.backend` and follow its named operation exactly (auth check, fetch
ticket, edit ticket body, set status, post comment).

## Step 1: Config and ticket

Identical to speccing: read `.claude/kanban.config.json` (bootstrap with
the same two questions if missing, commit it, never re-prompt if present);
resolve the ticket reference to the canonical `<id>`; auth check; fetch
the ticket. Fetch failure → report the exact error and stop.

## Step 2: Preconditions

- **`docs/ship/<id>/spec.md` must exist.** If it doesn't, stop and tell
  the user to run `/spec <id>` first — planning always builds on an
  aligned spec. File presence is the gate.
- If spec.md exists but the ticket's status isn't `Spec'd`, warn and offer
  to fix the status via the backend reference — don't block on it.
- **`docs/ship/<id>/plan.md` already exists** → present three options and
  wait: **revise** (continue, using the existing plan.md as the draft
  under discussion), **finish board updates** (skip to Step 7), or
  **abort**.

## Step 3: Model check

This session is judgment-heavy — architecture trade-offs and security
scrutiny are where a frontier model earns its cost. If the current session
is not running on Fable or Opus, recommend the user restart `/plan <id>`
on one (via `/model`). This is a recommendation, not a gate — proceed if
the user says to.

## Step 4: Investigation — orchestrated, not inline

Operate as orchestrator and pair-programmer, not worker. Read `spec.md`
and the ticket directly, then delegate exploration instead of doing it in
the main context:

- Dispatch 2–4 **parallel read-only subagents** (Explore-type where
  available) with a cheaper model override (Sonnet), each with ONE focused
  question, e.g.: "How are the files named in the spec's Context for
  implementation section structured, and what patterns do they follow?" /
  "What is the test setup — framework, layout, how are similar features
  tested?" / "How was <the most similar existing feature> built — which
  files, what shape?" Each subagent returns conclusions with `file:line`
  pointers, not file dumps.
- Use Haiku-tier subagents for trivial lookups (does X exist, what's the
  build command).
- Synthesize the reports in the main loop. Do not grep or read broadly in
  the main context — main-loop tokens go to decisions, the human
  discussion, and drafting.

## Step 5: Architecture discussion

Heavily human-driven, one decision at a time. Where a design choice is
non-obvious (data model, API shape, where logic lives), present 2–3
options with trade-offs and a recommendation. Obvious choices are stated,
not turned into ceremony. Raise security and scalability concerns here,
scaled to the ticket — a CRUD form gets a sentence, an auth change gets
real scrutiny.

## Step 6: Draft and approval gate

Draft `plan.md` using this exact template:

```
# Plan: <ticket title>

Ticket: <ticket URL> · Spec: docs/ship/<id>/spec.md · Date: <YYYY-MM-DD>

## Architecture decisions

- <decision>: <choice made and why, including rejected options>

## Security & scalability

<concerns and how the plan addresses them — "None material" is valid>

## Testing approach

<what kinds of tests, where they live, how end-to-end verification works>

## Tasks

### Task 1: <outcome>

- Files: <exact paths to create/modify>
- Changes: <what and how>
- Verify: <how to confirm this task worked>

### Task 2: <outcome>

...
```

Sequence tasks so the ticket builds incrementally — each task leaves the
branch in a working state where possible. The final task's Verify must map
back to the spec's "Done means" criteria, so QA has a straight line to
check against. Present the full draft; the user approves or requests
edits. Write nothing before approval.

## Step 7: Land

In order:

1. Write `docs/ship/<id>/plan.md` and commit **only that path**:

   ```bash
   git add docs/ship/<id>/plan.md
   git commit docs/ship/<id>/plan.md -m "docs(ship): plan for ticket <id>"
   ```

2. Set status → `Planned` via the backend reference (this removes the
   `Spec'd`-stage label if present).
3. Post a ticket comment via the backend reference:

   ```
   🗺️ Plan approved — `docs/ship/<id>/plan.md`

   - <one line: chosen architecture>
   - <one line: number of tasks and rough shape>

   Next: /ship <id> (once available) — until then the plan is
   hand-executable.
   ```

If a board operation fails after the commit, report the exact error
verbatim and stop. Re-running `/plan <id>` recovers via Step 2's "finish
board updates" option.

## Step 8: Report

Confirm what happened (plan path + commit, status change, comment link).
Note the ticket is now eligible for the autonomous phase once `/ship`
exists; until then the plan can be executed by hand or with
superpowers-style plan execution.
