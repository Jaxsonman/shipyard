# Planning Plugin — /spec + /plan Design

**Date:** 2026-07-22
**Status:** Approved
**Parent:** `2026-07-22-feature-pipeline-architecture-design.md` (build order item 2)

## Purpose

The collaborative planning stage of the feature pipeline: per ticket, a
PM/UX session (`/spec`) that produces total alignment on what the ticket
means, then an Engineer session (`/plan`) that produces an executable
implementation plan. Outputs are committed artifacts that gate the
autonomous phase (`/ship`), but the plugin is immediately useful standalone
— plans can be hand-executed before any autonomous stage exists.

## Structure

```
plugins/planning/
├── .claude-plugin/plugin.json
├── commands/
│   ├── spec.md              # /spec <ticket> — thin trigger
│   └── plan.md              # /plan <ticket> — thin trigger
├── skills/
│   ├── speccing-tickets/SKILL.md
│   └── planning-tickets/SKILL.md
└── references/              # shared by both skills via ../../references/
    ├── github.md            # fetch ticket, edit body, set ship:* label, post comment
    └── jira.md              # same ops via Jira transitions
```

Plus a `planning` entry in the root marketplace manifest.

**No agent definitions.** The umbrella spec's "command + agent + skill"
split exists so `/ship` can invoke stage agents, but ship never invokes
planning — it only gates on planning's artifacts and board statuses. The
collaborative sessions are always human-triggered via the commands, so
agents would be dead weight. This is a clarification of the umbrella, not a
contradiction: ship's contract with planning is purely artifact + status.

## Mechanics (shared by both commands)

- **Ticket identity:** `/spec 42`, `/spec #42`, or a full ticket URL —
  parsed to the backend's canonical ID (GitHub issue number, Jira key).
  Artifacts live at `docs/ship/<id>/spec.md` and `docs/ship/<id>/plan.md`
  (e.g. `docs/ship/42/`, `docs/ship/PROJ-12/`).
- **Config:** reads `.claude/kanban.config.json` for backend + target. If
  missing, run the same two-question bootstrap kanban uses and write the
  same file — planning stays useful without `/kanban` having run first.
- **Statuses:** GitHub labels are `ship:specced` and `ship:planned`
  (mapping to the umbrella's `Spec'd`/`Planned`; apostrophes make bad
  label names). Setting one removes any other `ship:*` label. Labels are
  created on first use if absent. Jira attempts a real workflow
  transition; if the user's workflow has no matching status, tell the user
  and fall back to a label — never silently fail.
- **Write ordering:** commit the artifact first, then flip board status,
  then post a short ticket comment linking the artifact (audit trail per
  the umbrella). Commit only the artifact path
  (`git commit -- docs/ship/<id>/`) so a dirty working tree is never
  swept up.
- **Re-run recovery:** each command detects an existing artifact for its
  stage and offers: revise / finish the board updates / abort. A board op
  that failed after the commit is therefore recoverable by re-running.

## /spec — the PM/UX session

Skill: `speccing-tickets`.

1. **Setup** — config check; fetch the ticket (title, body, labels,
   comments). Not found → report and stop. `spec.md` exists → re-run
   recovery menu.
2. **Context gathering** — resolve the ticket's `Source PRD:` slug to a
   repo file if possible and read it; skim the code areas the ticket
   touches. Light exploration only — this hat is about intent, not
   implementation.
3. **Guided interview** — one question at a time (/prd style), starting
   from the ticket's existing description and acceptance criteria, driving
   toward the template sections: what the ticket really means, what "done"
   looks like concretely, UX intent, edge cases, and the context a dev
   agent will need.
4. **Ticket repair** — if the session reveals the ticket body is wrong or
   unclear, propose a revised body, get approval, and update it on the
   board so board and spec never disagree.
5. **Draft & approve** — present the full draft in session; user approves
   or requests edits. **Open questions must be resolved before approval** —
   ambiguity dies here, not in the autonomous phase.
6. **Land** — write and commit `spec.md`, status → `Spec'd`, post a ticket
   comment with a 2–3 bullet summary and the artifact path. Suggest
   `/plan <id>`.

### spec.md fixed template

```markdown
# Spec: <ticket title>
Ticket: <link> · Date · Source PRD (if any)

## Problem            — what this ticket is really solving, restated
## Done means         — expanded, testable acceptance criteria (supersedes vague ticket AC)
## UX intent          — flows, states, copy tone ("N/A — not user-facing" is valid)
## Edge cases & failure modes
## Context for implementation — relevant files/modules, conventions, prior art the dev agent needs
## Out of scope
```

Every section is always present. There is no "Open questions" section — an
approved spec cannot have any.

## /plan — the Engineer session

Skill: `planning-tickets`.

1. **Setup** — config check; fetch ticket. **Precondition:**
   `docs/ship/<id>/spec.md` must exist; if not, stop and point to
   `/spec <id>`. File presence is the gate; if the file exists but status
   isn't `Spec'd`, warn and offer to fix the label rather than block.
   `plan.md` exists → re-run recovery menu.
   **Model check:** if the session is not running on Fable or Opus,
   recommend restarting `/plan` on one (`/model`) — the session is
   judgment-heavy (architecture, security) and that is where a frontier
   model earns its cost. Recommendation, not a hard gate.
2. **Investigation — orchestrated, not inline.** The main loop operates as
   orchestrator and pair-programmer: it reads `spec.md` and the ticket
   itself, then fans out investigation to parallel subagents with cheaper
   model overrides instead of exploring in the main context:
   - **Sonnet 5** subagents (2–4, parallel, Explore-type) for substantive
     exploration: files named in the spec's context section, surrounding
     architectural patterns, test setup and conventions, how similar
     features were built before. Each gets one focused question and
     returns conclusions, not file dumps.
   - **Haiku** for trivial lookups (does X exist, what's the build
     command).
   The main loop synthesizes the reports and spends its own tokens on
   decisions, the human discussion, and drafting. This also keeps the main
   context small — /plan sessions run long with a human in the loop.
3. **Architecture discussion** — heavily human-driven. Where a design
   choice is non-obvious (data model, API shape, where logic lives),
   present 2–3 options with trade-offs and a recommendation, one decision
   at a time. Obvious choices are stated, not turned into ceremony.
   Security and scalability are raised here, scaled to the ticket — a CRUD
   form gets a sentence, an auth change gets real scrutiny.
4. **Draft & approve** — present the full `plan.md`; user approves or
   requests edits.
5. **Land** — write and commit `plan.md`, status → `Planned` (removing
   `ship:specced`), post ticket comment with summary + path. Next step:
   `/ship <id>` once it exists; until then the plan is hand-executable.

### plan.md fixed template

```markdown
# Plan: <ticket title>
Ticket: <link> · Spec: docs/ship/<id>/spec.md · Date

## Architecture decisions   — each decision, the choice made, and why (incl. rejected options)
## Security & scalability   — concerns and how the plan addresses them ("None material" is valid)
## Testing approach         — what kinds of tests, where they live, how E2E verification will work
## Tasks                    — ordered; each task:
### Task N: <outcome>
- Files: <paths to create/modify>
- Changes: <what and how>
- Verify: <how to confirm this task worked>
```

Tasks are sequenced so the ticket builds incrementally — each task leaves
the branch in a working state where possible, and the final task's Verify
maps back to the spec's "Done means" criteria so QA has a straight line to
check against.

## Error handling

- **Board op failures** — report the exact error verbatim and stop; never
  claim a status was set without seeing the command succeed. The artifact
  is already committed, so re-run recovery picks up cleanly.
- **Ticket already past this stage** — `/spec` on a ticket that is
  `Planned` or beyond warns that re-speccing invalidates downstream
  artifacts and requires explicit confirmation; approving a revised spec
  flags that `plan.md` needs revisiting and offers to reset the status.
- **Jira workflow mismatch** — tell the user, fall back to a label.
- **Session abandonment** — nothing is written until the approval gate; a
  half-finished interview leaves zero residue and a re-run starts fresh.

## Verification

On a scratch GitHub repo with real tickets:

1. `/spec 1` with no config → bootstrap questions run, config written and
   committed.
2. Interview completes → `spec.md` matches the fixed template, is
   committed, `ship:specced` label applied, comment posted with path +
   summary.
3. `/plan 2` on an unspec'd ticket → refuses, points to `/spec 2`.
4. `/plan 1` → investigation is visibly delegated to subagents (agent
   spawns, not main-loop greps), architecture options presented, `plan.md`
   committed, `ship:planned` applied and `ship:specced` removed, comment
   posted.
5. Re-running `/spec 1` → detects the existing artifact and offers
   revise / finish board updates / abort instead of clobbering.
6. Ticket repair: a spec session proposes a revised ticket body and it
   lands on the board after approval.

Jira gets the same pass at the reference-file level (commands verified
against a test project) once GitHub is proven.

## Non-goals

- Any autonomous invocation of these sessions (ship gates on artifacts;
  it never runs planning).
- Batch mode (`/spec` over many tickets at once).
- Editing dependency links (kanban v2's job).
- Hotfix/bug intake variants.
