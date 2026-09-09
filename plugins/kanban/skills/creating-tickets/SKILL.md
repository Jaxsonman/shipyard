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

## Step 1: Preflight

    node "${CLAUDE_PLUGIN_ROOT}/scripts/preflight.js" --stage kanban

Exit 0 → continue to Step 2. Exit 2 → usage error, stop.

Exit 1 → read the JSON `reasons` array. If the only failure is the `config`
check (id `config`), bootstrap the config: ask the user, one question at a
time, which backend (`github` or `jira`) and the target (`owner/repo`, or the
Jira project key), then run

    node "${CLAUDE_PLUGIN_ROOT}/scripts/config.js" bootstrap kanban --backend <github|jira> --target <o/r|KEY>

(it normalizes `target` and stamps `"version": 1`; it never overwrites an
existing file), and re-run preflight. Any other failure → print the reasons
verbatim and stop.

Read the resulting config with

    node "${CLAUDE_PLUGIN_ROOT}/scripts/config.js" show kanban

`backend` and `target` from that JSON drive every later step. The config
schema is contract §12.1 — do not invent keys.

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

**Cap: at most 15 slices per run.** If the PRD yields more, propose the first
15 (earliest phases first, respecting dependencies) and list the remainder as
a **deferred batch** — title plus one line each — recorded in the manifest's
`deferred[]`. Tell the user they get a second `/kanban <same PRD>` run for
them once the first batch exists.

**Verify each existing-ticket dependency as you propose it** — not at the
gate. Before putting `Depends on: <ref>` on a slice, run the backend
reference's "Verify a ticket exists" for that ref. A ref that fails
verification is never proposed: say so in the proposal line and either drop
the link or ask the user for the right ref.

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

## Step 4: Duplicate check (client-side)

Two sources, in order:

1. **The run manifest** — `docs/kanban/<slug>.run.json`. If it exists, follow
   `references/run-manifest.md` "Reconciling on a re-run".
2. **The board** — list tickets from the backend reference ("List tickets for
   duplicate detection") and filter **locally in the fetched JSON** for a body
   line exactly equal to `Source PRD: <slug>` (contract §13).

   Never push this string into a search qualifier. `in:body` on GitHub and
   JQL `text ~` on Jira both tokenize on the colon and return wrong results —
   fetch, then match the literal line yourself.

Report matches as an **Already exists** list (title + link) and ask the user
to confirm before creating anything else. Never silently skip and never
silently duplicate.

## Step 5: Approval gate

Wait for the user to approve the proposed list from Step 3, or to request
edits (add, remove, reword slices). Only proceed to Step 6 once they approve
the list as a whole. Do not create anything before this gate.

This gate is also where the user adds, removes, or edits dependency
links. Any existing-board ref the *user* adds here must pass the same
"Verify a ticket exists" check from Step 3 before creation starts — never
guessed at or silently dropped.

## Step 6: Create tickets

Write the manifest (`references/run-manifest.md`) with every approved slice as
`state: "pending"` **before the first create**.

Create **sequentially**, one ticket at a time, in dependency order — never in
parallel; concurrent creates trip GitHub's secondary rate limit. After each
attempt, update that ticket's entry (`state`, `ref`, `url`, `error`,
`createdAt`) and `updatedAt`, and **rewrite the manifest file** before the
next create. A run killed at any point is resumable from what is on disk.

- Skip any ticket already `state: "created"` — it exists.
- Success → record `ref` and `url`, and substitute the real ref into the
  `Depends on:` lines of its dependents before creating them.
- Failure whose error names a **secondary rate limit** or asks you to retry →
  wait 60 seconds and retry **once**. A second failure is a real failure.
- Any other failure → `state: "failed"`, record the verbatim error, continue
  with unrelated tickets.
- A ticket whose dependency failed → `state: "skipped"` with the blocking
  title in `error`; do not create it or its transitive dependents.

## Step 7: Summarize

Report the results as four lists:

```
Already exists (<n>):
- <title> — <url>

Created (<n>):
- <title> — <url>
- <title> — <url>

Failed (<n>):
- <title> — <error reason>

Skipped (<n>):
- <title> — dependency failed to create: <failed dep title>
```

Re-running `/kanban` with the same PRD is safe: the run manifest is the
resume point — already-created tickets are reported under **Already exists**
and never re-created, and only `pending`, `failed` and `skipped` tickets are
attempted.
