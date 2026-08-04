---
name: implementing-tickets
description: Autonomous implementation stage — executes a ticket's approved plan test-first in an isolated worktree via per-task subagents, adversarially reviews the round, and posts a structured ship:dev handoff for QA. Use when the user wants a planned ticket implemented or runs /dev.
---

# Implementing Tickets

Executes ONE dev round for one ticket: round 1 implements `plan.md`;
round 2+ implements the current fix-list. Output: commits on the ticket's
branch plus a `ship:dev` handoff comment. Dev never moves tickets between
statuses — only ship does — and never opens PRs or runs QA.

**The orchestrator never edits code.** All code changes happen in
dispatched subagents; the main loop briefs, verifies claims against
reality, reviews, and posts the handoff.

Backend mechanics live in `../../references/github.md` and
`../../references/jira.md` (relative to this skill's directory). Whenever
a step says "via the backend reference," read the file matching
`config.backend` and follow its named operation exactly (auth check,
fetch ticket, post comment). Brief templates live in
`../../references/briefs.md`; the practices text in
`../../references/practices.md`.

## Step 1: Config and ticket

Read `.claude/kanban.config.json`. **If missing**, ask one question at a
time: (1) "Which board are your tickets on: GitHub or Jira?" (2) repo
`owner/repo` or Jira project key. Write
`{"backend": "...", "target": "..."}`, commit only that file
(`chore: configure kanban board target`). **If present**, never
re-prompt.

Resolve the ticket reference to the canonical `<id>`, run the auth check,
and fetch the ticket (both via the backend reference). Fetch failure →
report the exact error and stop.

## Step 2: Mode and round

- **Ship-invoked** (the invocation says so and passes a worktree path):
  use that worktree and branch as-is. Both `spec.md` and `plan.md` exist
  by construction; if either is missing, stop and return an error to ship
  — never invent artifacts in autonomous mode.
- **Standalone** (via `/dev`): everything below applies.

**Round detection:** scan the fetched ticket's comments for lines
starting `ship:`. The round is one more than the highest
`ship:dev round N/M` already posted; with none, this is round 1.
Standalone runs are unnumbered — their header is `ship:dev standalone`.

**Round 2+ input:** the fix-list is the Findings section of the latest
`ship:qa verdict FAIL` comment (or a ship-converted change-request
fix-list — same shape). The findings replace `plan.md` as this round's
task list. Fix nothing outside the findings. A **standalone** run that
finds an unanswered FAIL verdict consumes its fix-list the same way —
the only difference is its header stays `ship:dev standalone`.

## Step 3: Preconditions and worktree (standalone)

- `docs/ship/<id>/spec.md` **must exist** on the target branch or default
  branch. Missing → stop: "No spec found. Run `/spec <id>` first — dev
  never guesses what to build."
- Branch: if a branch matching `feat/<id>-*` exists, use it; otherwise
  create `feat/<id>-<short-kebab-slug-of-title>` from the repo's default
  branch.
- Worktree: `git worktree add ../<repo-dir-name>-ship/dev-<id> <branch>`
  — never work in the user's checkout. On exit, report the worktree path;
  do not remove it (QA verifies in it next).
- **Resume honesty:** if the worktree already exists with uncommitted
  changes (a dead session's partial task), inspect the diff first: if it
  cleanly completes a plan task with passing tests, commit it with that
  task's message; otherwise `git reset --hard` and note the reset in the
  handoff's Deviations. Determine the last completed task from
  `git log` task labels before dispatching anything.
- **Self-plan path:** if `docs/ship/<id>/plan.md` is missing, draft one
  in the exact template from the planning plugin (Architecture decisions /
  Security & scalability / Testing approach / Tasks with Files-Changes-
  Verify per task), prepend the line
  `> Self-planned by /dev — no human review. Prefer /plan <id> for
  non-trivial work.`, commit it to the branch
  (`docs(ship): self-plan for ticket <id>`), and stamp `self-planned` in
  the handoff's Deviations. Keep a self-plan conservative: smallest
  design that satisfies the spec, no architectural adventures.

## Step 4: Baseline

Before any task, in the worktree at the branch point: discover the test
command (package.json scripts, Makefile, CI config — ask the user if
standalone and genuinely ambiguous), run the suite once, and record
failures. This is the **baseline**: dev is accountable for regressions
against it, not for inherited failures. Record the branch-point sha as
`BASE_SHA` for the reviewer brief. The baseline result goes in the
handoff report.

## Step 5: Execute — per task, in plan order

For each task in this round's task list (plan tasks, or findings on
round 2+):

1. **Brief.** Instantiate the Task-executor template from `briefs.md`:
   the task's text verbatim, the spec "Done means" criteria it serves,
   the plan's file paths, one line per previously completed task, the
   full practices.md content, the suite command, and the commit prefix —
   `feat(<id>)` for plan tasks, `fix(<id>)` for findings. On round 2+,
   the task text is the finding (symptom, repro, criterion) and the
   contract's step 1 becomes: reproduce the finding as a failing test
   where feasible.
2. **Dispatch** a fresh subagent with that brief, working in the
   worktree.
3. **Verify the report against reality — a claim is not evidence.** On
   `DONE`: confirm the commit exists (`git log -1`), the red and green
   evidence are present and coherent, and re-run the suite command
   yourself if the report is at all ambiguous. Only then mark the task
   complete. Verification fails → re-brief once with what you found;
   a second failure → escalate (Step 8).
4. **On `BLOCKED`:** decide once, bounded:
   - *Mechanical mismatch* (renamed file, moved function, changed
     signature — the plan's intent is intact): re-brief with the
     correction and record it for the handoff's Deviations.
   - *Substantive mismatch* (the plan's architecture doesn't fit
     reality): stop the round and escalate (Step 8). Never redesign the
     plan mid-flight.

## Step 6: Adversarial review

After the last task: instantiate the Adversarial-reviewer brief
(`briefs.md`) with the spec's "Done means", this round's task list,
worktree, `BASE_SHA`, and practices.md. Dispatch it.

- **`NO FINDINGS`** → Step 7.
- **`FINDINGS`** → convert each finding into a fix task and run them
  through Step 5's machinery (commit prefix `fix(<id>)`, reproducing
  test first where feasible). Then dispatch the reviewer ONCE more over
  the updated diff.
- **Re-review still returns substantive findings** → the implementation
  is fighting the plan; escalate (Step 8) with both reviews attached.
  One internal review round, capped — this loop must not become a second
  QA loop.

## Step 7: Handoff

Compose the report:

```
ship:dev round N/M          ← or "ship:dev standalone"

## What changed and why
- Task 1: <one line> — <commit sha>
- ...

## How to run it
<exact commands: install/setup if changed, run, test>

## Criteria coverage
| Criterion (spec "Done means") | Where implemented | How tested |

## Deviations
<mechanical plan corrections taken; `self-planned` flag; resets on
resume — or "none">

## Known limitations
<untestable tasks and why; reviewer findings accepted as-is with
rationale; baseline failures inherited — or "none">
```

Post it as a ticket comment via the backend reference. **If the post
fails after work is committed**, write the same content to
`docs/ship/<id>/dev-handoff-<round-or-standalone>.md`, commit only that
file (`docs(ship): dev handoff for ticket <id> — board comment failed`),
report the board error verbatim, and continue — the handoff must never
be lost to a network hiccup.

Uncommitted work never survives a round boundary: before posting,
confirm `git status` is clean in the worktree; anything dangling is a
Step 5 verification failure you missed — resolve it first.

## Step 8: Escalation

When escalating (substantive plan mismatch, repeated claim/reality
failure, review cap hit): post a comment via the backend reference:

```
ship:dev escalation

## What the plan assumed
## What reality is
## What was tried
## Committed so far
- <sha>: <message>
## Decision needed from a human
```

Then stop the round. Ship (not dev) moves the ticket to `Needs Human`;
a standalone run reports the same content to the user directly. If the
escalation comment fails to post, use the same file fallback as Step 7.

## Step 9: Report

Confirm what happened in session: tasks completed with shas, review
outcome, handoff comment posted (or fallback path), worktree path, and
the exact command to try the work. State plainly anything that failed —
no stage marks its own work as passing; QA's verdict and the human gate
do that.
