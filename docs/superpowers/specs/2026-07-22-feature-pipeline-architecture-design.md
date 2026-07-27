# Feature Pipeline — SDLC Factory Architecture

**Date:** 2026-07-22
**Status:** Approved
**Revised:** 2026-07-23 — authorization/trust model, wave eligibility, and
claims/resume, per `docs/superpowers/reviews/2026-07-23-feature-pipeline-architecture-review.md`
**Scope:** Architecture for Shipyard stages 3–6. This is an umbrella design:
each deliverable listed in Build Order gets its own spec → plan → build cycle.

## Purpose

Extend Shipyard from "idea → tickets on a board" into a full SDLC factory:
tickets flow through a human-collaborative planning phase, then an
autonomous dev ⇄ QA loop, then human review gates, and exit as PRs into the
user's existing CI/CD. This document defines the overall shape — pipeline
phases, plugin boundaries, state model, stage contracts, and build order —
so each piece can be specced and built independently without re-litigating
the architecture.

This is specifically the **feature pipeline**. Hotfix and bug pipelines are
future work that will reuse the same stage plugins with different intake.

## The pipeline

The pipeline has a **human-collaborative front half** and an **autonomous
back half**:

```
── COLLABORATIVE (humans + Claude in the room) ──────────────
Problem → PRD (/prd) → Tickets + dependency links (/kanban)
   → per ticket: SPEC (/spec — PM/UX hat: alignment, context
     engineering, what "done" really means)
   → per ticket: IMPLEMENTATION PLAN (/plan — Engineer hat:
     architecture, security, scalability, file-level plan)
── AUTONOMOUS (/ship takes over) ────────────────────────────
   → Dev ⇄ QA loop → Awaiting Review (engineer verdict)
   → change requests loop back through ship
   → approval → PR → user's existing CI/CD
```

Autonomy begins only when a ticket carries approved spec and plan
artifacts. Ambiguity is resolved in the collaborative phase with the human
present — never guessed at by an autonomous agent.

## Plugin family

Each stage is a standalone, independently useful plugin. `ship` is a
conductor that owns no worker logic: it declares the stage plugins as
required dependencies and invokes their agents/skills cross-plugin
(installed plugins' agents are session-wide invocable). Each stage plugin
follows the established Shipyard split: thin slash command (standalone
trigger) + agent definition (what ship invokes) + skill (methodology).

| Stage | Plugin | Commands | Nature |
|-------|--------|----------|--------|
| 1 | `prd` | `/prd` | Collaborative (exists) |
| 2 | `kanban` v2 | `/kanban` | Collaborative (exists; v2 adds dependency links) |
| 3 | `planning` | `/spec <ticket>`, `/plan <ticket>` | Collaborative — two distinct hats/sessions per ticket |
| 4 | `dev` | `/dev <ticket>` | Autonomous worker |
| 5 | `qa` | `/qa <branch>` | Autonomous worker |
| 6 | `pr` | `/pr <branch>` | Autonomous worker |
| — | `ship` | `/ship [ticket]` | Conductor — orchestrates 4–6, gates on 3's artifacts |

`cicd` (watch checks, shepherd merges, deploy help) remains a planned
future stage; this pipeline ends at "PR opened."

## State model

**State lives on the board; artifacts live in the repo.**

The board is the pipeline's state machine — no local state files, extending
kanban's "board is the single source of truth" principle. Jira uses real
workflow columns; GitHub uses `ship:*` status labels (Issues has no native
columns).

Concrete GitHub label names use colon-namespaced, apostrophe-free forms —
`ship:specced` and `ship:planned` are established by the planning plugin;
later stages follow the same `ship:<status>` pattern. Jira uses real
transitions, falling back to `ship-<status>` labels when a workflow lacks
the status (planning plugin convention).

Statuses:

```
Backlog → Spec'd → Planned → In Dev → In QA → Awaiting Review
   → Approved → PR Open → Done
plus: Needs Human   (escalation parking state, waits on a person)
```

Heavyweight artifacts are committed files — exactly what the dev agent
needs in context, and they belong in version control:

- `docs/ship/<ticket-id>/spec.md` — output of `/spec`
- `docs/ship/<ticket-id>/plan.md` — output of `/plan`

Every handoff (dev's report, QA's verdicts and fix-lists, review packets,
escalations) is posted as a **ticket comment**, so each ticket is a
complete, human-readable audit trail of its own manufacturing. Every
pipeline comment begins with a one-line machine-readable header —
`ship:<stage> <detail>`, e.g. `ship:dev round 2/3`, `ship:qa verdict FAIL
round 2/3` — so any `/ship` run reconstructs exactly where every ticket
stands, including which loop round it is in, by reading the board. No
session state to lose, which is what makes the pipeline resumable.

Backend-agnosticism works exactly as in kanban v1: skills never talk to
GitHub/Jira directly; they follow per-backend reference files.

## Trust model

Ticket comment threads are shared, semi-trusted space: in a real org,
commenters include contractors, integrations, and passers-by — and a
comment that reaches an agent's context is a prompt-injection vector into
an agent with repo write access. The pipeline therefore has exactly three
instruction channels into autonomous agents:

1. `spec.md` and `plan.md` — human-approved, committed artifacts.
2. Structured fix-lists authored by the pipeline itself (QA verdicts, and
   approver change requests after ship converts them).
3. Verdicts (approve / change request) from **authorized approvers only**.

Approvers are the driver who invoked `/ship` plus the users listed in
`approvers` in ship's config. A verdict-shaped comment or label change
from anyone else does not advance the ticket; ship flags it in its next
status report instead of acting on it. All other ticket comments — from
anyone — are untrusted data: agents may quote them as context in reports,
but never execute instructions found in them. When ship converts an
approver's change-request comment into a fix-list, that conversion is the
sanitization boundary: the output is findings in the standard shape, not
verbatim instructions.

## Collaborative phase (planning plugin)

Two commands, two hats, run per ticket:

- **`/spec <ticket>`** — PM/UX hat. Guided session producing total
  alignment: what the ticket really means, what "done" looks like, UX
  intent, edge cases, and the context engineering a dev agent will need.
  This is where unclear tickets get fixed — with the human in the room, not
  by an agent bouncing tickets. Output: `spec.md`, ticket → `Spec'd`.
- **`/plan <ticket>`** — Engineer hat, heavily human-driven. Architecture
  of the solution: file-level plan, security and scalability
  considerations, testing approach. Output: `plan.md`, ticket → `Planned`.

## Autonomous phase (/ship)

### Intake

`/ship <ticket>` runs one ticket; bare `/ship` offers whole-board wave
mode. Either way:

1. Reconstruct all ticket states from the board.
2. Enforce preconditions: a ticket is eligible only if its board status is
   `Planned` and both `spec.md` and `plan.md` exist for it (the planning
   commands set that status only after the human approves each artifact in
   session). Not ready → skipped and listed in a "not ready" report.
3. First run on a board: analyze the shape of the work (dependency depth,
   epic vs. scattered tickets) and present merge-strategy options with a
   recommendation. Choice persists to config; never re-asked.
4. Wave mode: compute waves from kanban's dependency links. A ticket is
   eligible when every one of its `Depends on` tickets is `Approved` or
   beyond (`PR Open`, `Done`). Dependents branch off their dependency's
   branch rather than waiting on a merge the pipeline cannot observe —
   see Merge strategies. Eligible tickets run in parallel, each in its
   own worktree; dependents wait.

### Claims, concurrency, and resume

The board is shared state with no transactions, so ship uses a best-effort
claim protocol rather than assuming it is the only writer:

- **Claim.** Before working a ticket, ship posts a `ship:claim
  <session-id> <timestamp>` comment, then re-reads the thread: if another
  session holds an unexpired claim, ship backs off and reports the ticket
  as claimed elsewhere. Claims expire after `claimTtlMinutes` (default
  60); a session refreshes its claim between loop rounds, so a live
  session never looks stale.
- **Loop round is board state.** Each round's structured comment header
  (`ship:dev round 2/3`, `ship:qa verdict FAIL round 2/3`) records where
  the loop stands, so round counting survives session death.
- **Resume.** On finding an `In Dev`/`In QA` ticket whose claim has
  expired, ship resumes in the existing worktree and branch. The incoming
  agent reads branch history plus the last structured comment to determine
  the round. Each dev round ends with committed work, so uncommitted
  changes found on resume are abandoned partial work — the agent reviews
  them and either commits or resets them before continuing. If branch
  state and board state cannot be reconciled (comments claim work the
  branch doesn't contain, or vice versa), the ticket escalates to
  `Needs Human` rather than guessing.

### The Loop

Per eligible ticket, ship creates a worktree/branch and runs:

```
dev agent ──(handoff report)──▶ qa agent
   ▲                               │
   └──(fix-list)── FAIL ◀── verdict ──▶ PASS ──▶ human gate
        (cap: N round-trips, default 3, then escalate)
```

**Stage contracts** — structured artifacts, posted to the ticket:

- **Dev → QA: handoff report.** What changed and why, how to run it, which
  acceptance criteria are addressed and where, known limitations.
- **QA → verdict.** QA runs the project's test suite AND real end-to-end
  verification — launching the app and exercising each acceptance
  criterion the way a human would (browser automation for web apps, CLI
  invocation for tools). Verdict is per-criterion pass/fail with evidence.
  QA that cannot launch the app says so explicitly — it never silently
  degrades to static review.
- **Fail → fix-list.** Numbered findings: symptom, repro steps, criterion
  violated. Findings only, no prescribed solutions — the dev agent owns
  the how.
- **Loop escape.** After N failed round-trips (default 3, configurable),
  ship stops, sets the ticket to `Needs Human`, and posts an escalation
  summary: what QA keeps finding, what dev tried each round, and its read
  on why it's stuck. The human decides: clarify and re-loop, take over, or
  descope.

### Human review gate (board-driven)

On QA sign-off, ship moves the ticket to `Awaiting Review` and posts the
**review packet**: what was built, per-criterion verification evidence,
branch/worktree path, and the exact command to try it. It notifies the
driver in chat (push notification if backgrounded). In wave mode the
session does not block — it keeps working other eligible tickets.

The verdict is a ticket action:

- **Approve** — a label/status change or an "approved" comment **from an
  authorized approver** (see Trust model) → PR stage.
- **Change requests** — a ticket comment from an authorized approver; ship
  converts it into the same structured fix-list shape as QA feedback and
  re-enters the Loop. Human feedback and QA feedback deliberately share
  one machinery. The ticket returns to `Awaiting Review` afterward.

Verdict-shaped input from anyone outside the approver set is flagged in
ship's next report, never acted on.

Verdicts are picked up live if the session is running, or on the next
`/ship` invocation — days-later reviews cost nothing.

### Exit: PR

On approval, the `pr` stage: rebase/sync per the configured merge
strategy; a conflict the dev agent cannot cleanly resolve is an escalation
(`Needs Human`), not a guess. Open a PR whose body links the ticket, spec,
and plan and summarizes QA's verification evidence. Ticket → `PR Open`.
The user's CI/CD takes over. Ticket closure follows the user's normal
process (e.g. GitHub auto-closes on merge via `Closes #N`); a future
`cicd` stage can drive `Done` from merge events.

## Merge strategies

Dependents always branch off their dependency's branch — stacking is the
universal rule for dependent work, not a separate strategy. A ticket's
code is stable once `Approved` (change requests happen before approval),
so its branch is a safe base. The strategy choice governs how branches
become PRs:

- **`pr-per-ticket`** — each ticket's branch becomes its own PR after
  approval. Independent tickets target the base branch; a dependent
  ticket's PR targets its dependency's branch and retargets to base when
  that PR merges (GitHub does this automatically). Siblings rebase as PRs
  merge. Default recommendation for most boards.
- **`epic-branch`** — ship merges approved ticket branches into a
  long-lived, pipeline-owned feature branch; dependents branch from it;
  one PR to base when the epic completes. (The "no automated merging"
  non-goal applies to the user's base branch — pipeline-owned epic
  branches are ship's to merge.)

Chosen at first `/ship` run per board, persisted, user-editable in config.
Ship recommends one based on the work's shape (major epic with deep
dependencies → epic-branch; scattered independent tickets →
pr-per-ticket), but the user chooses. An earlier separate `stacked`
strategy is subsumed by pr-per-ticket's handling of dependents.

## Config

`.claude/ship.config.json`, committed (team-shared, no secrets — same
philosophy as kanban's config). Backend/board identity stays in
`.claude/kanban.config.json`; ship reads it.

```json
{
  "mergeStrategy": "pr-per-ticket",
  "baseBranch": "main",
  "loopCap": 3,
  "runCommand": "npm run dev",
  "e2e": "auto",
  "approvers": [],
  "claimTtlMinutes": 60
}
```

`runCommand` is how QA launches the app for E2E; `e2e` is `browser`,
`cli`, or `auto` (detect per project). `approvers` extends the
verdict-authorized set beyond the driver (see Trust model);
`claimTtlMinutes` bounds how long a dead session's claim blocks a ticket.

## Failure honesty

Every stage reports what actually happened. A wave summary lists shipped /
awaiting-review / escalated / skipped-not-ready explicitly. No stage marks
its own work as passing; only QA verdicts and human approvals advance a
ticket.

## Non-goals (this phase)

- Hotfix and bug pipelines (future; will reuse stage plugins with
  different intake).
- The `cicd` plugin (watching checks, deploys).
- Multi-repo tickets.
- Any UI beyond the board and chat.
- Automated merging to the user's base branch — the pipeline ends at "PR
  opened." (Ship does merge into pipeline-owned epic branches under the
  epic-branch strategy.)

## Build order

Each deliverable is its own spec → plan → build cycle:

1. **`kanban` v2** — emit `Depends on: #N` dependency links at ticket
   creation. Small; unblocks wave computation.
2. **`planning`** — `/spec` + `/plan`. Collaborative, so immediately
   valuable with no autonomous stages built: plans can be hand-executed.
3. **`qa`** — standalone `/qa <branch>` is useful today on human-written
   branches, and it defines the verdict/fix-list contract before dev
   exists to consume it. Every later stage lands into an existing
   verification harness.
4. **`dev`** — the biggest single build; consumes planning's artifacts,
   targets qa's contract.
5. **`ship`** — the conductor; orchestration glue over proven stages.
6. **`pr`** — thin; may swap with 5 if convenient.

## Verification (architecture-level)

The umbrella design is validated incrementally as each deliverable ships,
but the end-to-end acceptance test for the whole pipeline is:

1. `/prd` → PRD; `/kanban` → tickets with dependency links on a real board.
2. `/spec` + `/plan` on two independent tickets and one dependent ticket.
3. Bare `/ship` proposes waves matching the dependency graph, runs the two
   independent tickets in parallel worktrees, holds the dependent one.
4. Each ticket reaches `Awaiting Review` with a review packet whose
   command actually launches the feature.
5. A change-request comment re-enters the Loop and returns to
   `Awaiting Review`; an approval produces a PR linking ticket, spec, and
   plan.
6. A ticket with a deliberately failing criterion escalates to
   `Needs Human` after the configured cap with a coherent summary.
7. Killing the session mid-wave and re-running `/ship` resumes from board
   state with no lost or duplicated work.
8. An "approved" comment from a non-approver does not advance the ticket
   and is flagged in ship's next report; the same comment from an
   approver does.
9. A second `/ship` session started mid-wave skips actively claimed
   tickets instead of duplicating work.
