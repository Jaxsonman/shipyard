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
`config.backend` and follow its named operation exactly (fetch ticket, edit
ticket body, set status, post comment).

**Contract:** `${CLAUDE_PLUGIN_ROOT}/references/contract.md` (contract v1).
"§N" in this skill means that file's section N; open the cited section
when a step references it.

## Step 1: Preflight and ticket

    node "${CLAUDE_PLUGIN_ROOT}/scripts/preflight.js" --stage plan

Exit 0 → continue. Exit 2 → usage error, stop.

Exit 1 → read the JSON `checks[]` array (ids live there, not in `reasons[]`).
If the only failing check has id `config`, bootstrap it (ask backend and
target, one question at a time, then
`node "${CLAUDE_PLUGIN_ROOT}/scripts/config.js" bootstrap kanban --backend <b> --target <t>`,
printing any `notes` the script returned verbatim) and re-run preflight;
otherwise print the `reasons` verbatim and stop.

Read the config with `node "${CLAUDE_PLUGIN_ROOT}/scripts/config.js" show kanban`
— `.kanban.backend` and `.kanban.target` (schema: contract §12.1). Then
resolve the user's ticket reference to the canonical `<id>` per the backend
reference, and fetch the ticket. Fetch failure → report the exact error and
stop.

Capture the stage start now — it goes in the comment's metrics footer:

    node "${CLAUDE_PLUGIN_ROOT}/scripts/metrics.js" now

`<id>` in every path below is the canonical id resolved above.

## Step 2: Preconditions

- **`docs/ship/<id>/spec.md` must exist.** If it doesn't, stop and tell
  the user to run `/spec <id>` first — planning always builds on an
  aligned spec. File presence is the gate.
- If spec.md exists but the ticket's status isn't `Spec'd` (contract §4),
  warn and offer to fix the status via the backend reference — don't block
  on it.
- **`docs/ship/<id>/plan.md` already exists** → present three options and
  wait: **revise** (continue from Step 4, using the existing plan.md as the
  draft under discussion), **finish board updates** (skip to Step 7's board
  operations — for re-runs after a board operation failed), or **abort**.

## Step 3: Model recommendation

This session is judgment-heavy: architecture trade-offs and security
scrutiny are where a frontier model earns its cost. Recommend, once and
without checking anything, that the user run `/plan <id>` on Fable or Opus
(`/model`). This is a recommendation, not a gate — continue if they say to.

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

1. Write `docs/ship/<id>/plan.md`, then validate it against contract §13
   before committing:

       node "${CLAUDE_PLUGIN_ROOT}/scripts/validate-artifact.js" plan docs/ship/<id>/plan.md

   Exit 0 → commit below. Exit 1 → the missing or renamed sections (or a
   renamed `### Task` heading) are printed on stderr (`--json` for the
   full report); fix the file and re-run. Never commit an artifact that
   fails this gate — downstream fix-list and progress parsing depend on
   the exact headings.

   ```bash
   git add docs/ship/<id>/plan.md
   git commit docs/ship/<id>/plan.md -m "docs(ship): plan for ticket <id>"
   ```

   If the artifact is already committed and unchanged (re-run recovery),
   skip this sub-step and proceed to the board operations.

2. Set status → `Planned` via the backend reference (this removes the
   `Spec'd`-stage label if present); the ladder, its labels, colours and
   descriptions are contract §4.
3. Build the comment. Its **first line is the header** `ship:plan approved`
   and the emoji title moves to line two — the exact shape is contract
   §5.2; copy it from there rather than from memory.

   On the **GitHub backend only**, append the metrics footer as the last
   line (contract §10; Jira comments carry none):

       node "${CLAUDE_PLUGIN_ROOT}/scripts/metrics.js" footer --stage plan --started <the ISO time from Step 1> --finished "$(node "${CLAUDE_PLUGIN_ROOT}/scripts/metrics.js" now)"

   Nothing hand-writes that line. Post the file via the backend reference.

   **Metrics footer (dashboard integration).** Append this hidden HTML comment as the
   last line of the comment body, so the dashboard plugin can build stage timelines.
   Record `started` when this stage began work on the ticket (ISO 8601 UTC) and
   `finished` as now. `tokens_in`/`tokens_out` are optional — include them only when
   the stage runner knows real numbers (e.g. ship fills them for dev/qa rounds from
   the subagent usage reported in task notifications); never estimate.

   ```
   <!-- shipyard-metrics {"stage":"plan","started":"<ISO8601>","finished":"<ISO8601>","tokens_in":<n>,"tokens_out":<n>} -->
   ```

   (omit the token fields entirely when unknown — never emit placeholders)

   ```
   <!-- shipyard-metrics {"stage":"plan","started":"<ISO8601>","finished":"<ISO8601>"} -->
   ```

If a board operation fails after the commit, report the exact error
verbatim and stop. Re-running `/plan <id>` recovers via Step 2's "finish
board updates" option.

## Step 8: Report

Confirm what happened (plan path + commit, status change, comment link).
Note the ticket is now eligible for the autonomous phase once `/ship`
exists; until then the plan can be executed by hand or with
superpowers-style plan execution.
