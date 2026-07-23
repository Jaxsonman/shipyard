# Feature Pipeline Architecture — Review Findings

**Date:** 2026-07-23
**Reviewed:** `docs/superpowers/specs/2026-07-22-feature-pipeline-architecture-design.md`
**Buyer context:** enterprise software teams transitioning traditional agile SDLC to agentic.

## Differentiator (the thesis to lead with)

Not "SDLC factory" — the differentiated bet is **durable async state on the
team's existing board**: resumability, days-later review gates, team
visibility, and a compliance-grade audit trail (requirement → spec → plan →
per-criterion evidence → named approver → PR) on the system of record.
Per-stage adoptability is the agile→agentic transition ramp. It's a leverage
multiplier with mandatory human gates — for the enterprise buyer, the gates
are the selling point, not a weakness.

## Fix list

### Umbrella spec — architectural

| # | Finding | Status |
|---|---------|--------|
| 1 | **Comment-channel authorization / prompt injection.** Verdicts and change requests only from allowlisted approvers; all other ticket comments are untrusted data, never instructions. Agent instruction channels limited to spec.md, plan.md, and authenticated structured fix-lists. | ✅ Fixed 2026-07-23 |
| 2 | **Wave eligibility contradicted the "no automated merging" non-goal** ("landed" requires observing merges the pipeline can't see). Decision: dependents branch off their dependency's branch (stacking generalized); eligibility = dependency Approved or beyond. `stacked` strategy subsumed. | ✅ Fixed 2026-07-23 |
| 3 | **Concurrency + resume semantics under-specified.** Added: claim/lease convention with TTL, machine-readable structured comment headers (incl. loop round), explicit resume rules for `In Dev` with an existing worktree. | ✅ Fixed 2026-07-23 |
| 4 | **Jira story inverted for enterprise.** Label-fallback shadow state is disqualifying in admin-governed Jira; should ship a documented workflow scheme installed once by an admin, and refuse to run half-shadowed. | ⏸ On hold (deliberate) |

### Stage specs — absorb into planned per-stage cycles

| # | Finding | Lands in |
|---|---------|----------|
| 5 | QA environment contract: per-worktree ports/env/seed data, secrets, and a *designed* degraded tier (tests + static review, explicitly labeled). "Can't launch the app" will be the common early enterprise case. | `qa` spec |
| 6 | File-overlap check before parallelizing a wave — diff the plans' file lists, serialize overlapping tickets. Declared dependencies won't catch shared-file conflicts. | `ship` spec |
| 7 | Plan staleness: dev agent re-validates plan.md against HEAD after dependencies land; escalates if the architecture no longer fits. | `dev` spec |
| 8 | "Required dependencies" → "preflight check": plugins have no dependency mechanism; ship can only check-and-instruct at runtime. | `ship` spec |

### Framing / roadmap

| # | Finding | Status |
|---|---------|--------|
| 9 | Lead with the real differentiators (see thesis above); drop "factory" throughput implication. | Open |
| 10 | Enterprise posture: headless-runner compatibility as a stated design property; versioned stage contracts; pinned/tagged releases (unpinned self-updating tooling that writes code is a supply-chain finding). | Open |

## Other notes from review

- Loop cap counts rounds but not tokens — no per-ticket spend ceiling.
- Dev-stage internal decomposition / context limits unaddressed.
- `Needs Human` is one parking state for ≥4 distinct causes; per-cause
  filtering would serve team visibility.
- Competitive frame for this buyer: Atlassian Rovo (owns the board), Devin /
  Factory (managed loop), GitHub Copilot coding agent (enterprise-blessed
  issue→PR). Defensible ground: process contracts are readable markdown in
  the repo, state on the existing board, labor on Claude Code seats already
  bought — the only fully inspectable mechanism.
- Multi-repo: fine as a non-goal, but board-driven state extends to it more
  gracefully than repo-local state would — worth claiming when the time comes.
