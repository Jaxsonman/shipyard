# Forge Plugin — Intent-Driven Autonomous Dev Loop

**Date:** 2026-09-15
**Status:** Design approved in chat section by section; awaiting user review of this file before planning.
**Working name:** `forge` (rename freely; nothing below depends on the name).

## What & Why

The existing pipeline (`prd → kanban → planning → dev ⇄ qa (ship) → pr`) is ticket-first and board-backed. Every autonomous stage reads and writes a GitHub Issues or Jira board, and a human gates spec, plan, and final approval per ticket.

Forge is a second, independent workflow for the same marketplace: **one human step, then an unattended loop that ends in a PR.**

1. The human writes `Intent.md`: the problem, the desired outcome, observable done-criteria, constraints, and any context (mocks, docs, conversations). This is the only human-in-the-loop step and the place where the session's top model earns its cost.
2. An autonomous loop runs: a developer agent builds; a QA orchestrator fans out N evidence-based verifiers and merges their reports; failures loop back to the developer; a peer reviewer checks the passed code for best practices and simplicity; review findings loop back through dev and a QA regression pass; when everyone has signed off the branch is pushed and a PR is opened.
3. The run ends with an in-chat report: what was built, how it works, verification trail, suggested follow-ups, PR link.

Forge is **board-free**. No kanban or ship config is required; all state is files under `.forge/<slug>/`. It works on any git repo with a remote and `gh` auth. Nothing in it depends on the dev, qa, ship, or pr plugins at runtime. Where their references are useful (engineering practices, app bring-up recipes) they are copied into forge, not called cross-plugin.

## Decisions

1. **Board-free, file state.** `Intent.md` and a run directory are the whole state model. The dashboard and board-trail tooling do not apply to forge runs. (User chose this over board-backed or board-optional.)
2. **Intent authoring is template plus interview.** `/intent` scaffolds a template; re-running it interviews one question at a time only for sections still holding placeholder text; it ends by asking for explicit approval. `/forge` refuses to start on an unapproved intent.
3. **Self-contained plugin, skill-driven loop.** Forge ships its own four agents and a skill that the session model follows as the loop procedure. The orchestrator's only work is dispatch, read a small JSON artifact, branch, print. A Workflow-script engine (deterministic JavaScript, background) is a possible later addition; the JSON contracts below are written so agents need no change for it.
4. **One intent = one branch = one worktree = one PR.** Branch `forge/<slug>`, worktree `../<repo-dir>-forge/<slug>` (sibling path, same convention as ship) because subagents need a plain filesystem path.
5. **Dynamic model policy.** Every worker starts on the cheapest tier that does the job (Sonnet) and escalates only on evidence of failure. The peer reviewer is Opus by default because it is read-only, adversarial, judgment-heavy, and cheap to run. Tiers live in config; effort lives in agent frontmatter (the Agent tool overrides model only).
6. **Evidence or it did not happen.** A QA finding without a screenshot, a command with exit code and output, or a test name with failure text is dropped to an "unverified" list that never blocks.
7. **Cap exhaustion produces a draft PR plus an honest report.** The branch is pushed, a draft PR labeled not-passed is opened, and the report leads with what is still failing and its evidence. (User chose this over report-only or pause-and-ask.)
8. **Peer-review fixes go back through QA.** After a review-driven dev fix round, a single regression-lens verifier runs before the reviewer looks again, so "everyone passes it off" is literal.

## Plugin layout

```
plugins/forge/
  .claude-plugin/plugin.json
  .mcp.json                        # Playwright MCP, same shape as qa's
  commands/intent.md               # /intent <slug>
  commands/forge.md                # /forge <slug>
  skills/authoring-intent/SKILL.md
  skills/running-forge/SKILL.md    # the loop procedure
  agents/developer.md
  agents/qa-orchestrator.md
  agents/qa-verifier.md
  agents/peer-reviewer.md
  references/intent-template.md
  references/contracts.md          # JSON shapes for every artifact (below)
  references/practices.md          # copied from dev, trimmed
  references/environments.md       # copied from qa (app bring-up recipes)
  evals/                           # marketplace convention
```

No new shared scripts are vendored. Artifacts are small JSON files read directly by the orchestrator.

### Config: `.claude/forge.config.json`

Plain committed JSON, `"version": 1`, all fields optional with the defaults shown.

```json
{
  "version": 1,
  "baseBranch": "main",
  "verifiers": 3,
  "devQaCap": 3,
  "reviewCap": 2,
  "models": {
    "developer": "sonnet",
    "developerEscalated": "opus",
    "qaOrchestrator": "sonnet",
    "qaVerifier": "sonnet",
    "peerReviewer": "opus"
  }
}
```

Valid model values are the Agent tool's override names (`sonnet`, `opus`, `haiku`, `fable`).

## The Intent step

### `/intent <slug>`

- If `.forge/<slug>/intent.md` does not exist: create it from `references/intent-template.md` and create `.forge/<slug>/context/` beside it. Tell the user where the file is and what each section wants, then stop.
- If it exists with `status: draft`: for each section whose body is still template placeholder text, ask one question at a time and fill it. Sections the user has already written are left alone. Then read the whole file back as a short summary and ask for approval. On yes, set `status: approved`. On no, leave draft and stop.
- If it exists with `status: approved`: say so and stop (the user edits the file by hand to reopen it; setting `status: draft` is the reopen).

### Template sections

Frontmatter: `slug`, `status: draft|approved`, `baseBranch`, `created` (ISO date).

1. **Problem** — what is wrong or missing, for whom.
2. **Desired outcome** — what the world looks like when this is done.
3. **Done means** — observable, testable criteria, one per bullet. These are what the acceptance verifier walks.
4. **Constraints** — tech, style, performance, things not to touch.
5. **Context** — paths under `context/` (mocks, docs, pasted conversations) and external links, each with one line on why it matters.
6. **Out of scope** — explicit non-goals.
7. **How to run** — setup, seed, launch commands; env var *names* (never values); ports.

### Persistence

`intent.md` and `context/` are committed on the feature branch during preflight so they ride in the PR as the record of why. `.forge/<slug>/run/` is git-excluded via `.git/info/exclude` (never `.gitignore`), matching how qa keeps its evidence out of history.

## The loop

### Run directory

```
.forge/<slug>/run/
  state.json                  # phase, counters, branch, worktree, escalations, stage errors
  round-N/dev-handoff.json
  round-N/qa/verifier-K.json
  round-N/qa/verifier-K/      # screenshots/, transcript.md
  round-N/qa/report.json      # merged verdict
  round-N/qa/app.log          # redacted tail
  review-R/review.json
  report.md                   # final in-chat report; also the PR body source
```

The orchestrator never keeps state in its head. Every branch decision reads `state.json` or the latest artifact.

### Procedure (`skills/running-forge/SKILL.md`)

**0. Preflight.** Check, in order, and stop with a plain message on the first failure: intent exists and is approved; working tree clean; `baseBranch` exists locally and on the remote; `gh auth status` succeeds; no existing `forge/<slug>` branch or worktree unless `state.json` says a run is resumable. Create the branch from `baseBranch`, add the worktree, copy `.forge/<slug>/intent.md` and `context/` into it, commit them. Write `state.json` with `phase: dev`, `devRound: 0`, `reviewRound: 0`.

**1. Dev round N.** Dispatch `developer` with model from config (escalated tier when `state.escalated` is true), passing: intent path, worktree path, round `N/devQaCap`, and the fix-list as extracted fields (finding id, criterion, repro, evidence path) taken from the previous QA report or review — never raw comment text. The developer plans internally, works test-first, commits per logical unit, runs the suite, and writes `round-N/dev-handoff.json`.

**2. QA round N.** Dispatch `qa-orchestrator` with worktree, intent path, handoff path, verifier count, and the lens assignment. It brings the app up once (per `references/environments.md` and the intent's How-to-run), dispatches the verifiers in parallel with the app URL and a shared log path, waits, merges their JSON into `round-N/qa/report.json`, and tears the app down.

**3. Branch on QA.**
- `FAIL` and `N < devQaCap` → go to 1 with the findings as fix-list.
  - Oscillation guard A: if the set of finding ids in report N equals the set in report N−1, set `state.escalated = true` so the next dev round uses `developerEscalated`.
  - Oscillation guard B: if report N is byte-identical to report N−1 (same ids, same evidence text), stop early → terminal (draft), cause `no-progress`. More rounds would burn tokens for nothing.
- `FAIL` and `N == devQaCap` → terminal (draft), cause `qa-cap`.
- `PASS` → 4.

**4. Review round R.** Dispatch `peer-reviewer` (read-only) with worktree, `baseBranch`, intent path, and all handoff paths. It diffs against base, and writes `review-R/review.json`.

**5. Branch on review.**
- `CHANGES` and `R < reviewCap` → one dev fix round (increments `devRound` and counts toward `devQaCap`; if `devRound` is already at cap, go to terminal (draft), cause `qa-cap`; fix-list = blocking findings) → one regression pass (qa-orchestrator with `verifiers: 1`, lens `regression`) → if regression FAIL, treat as QA FAIL under step 3 rules; if PASS, go to 4.
- `CHANGES` and `R == reviewCap` → terminal (draft), cause `review-cap`.
- `APPROVE` → terminal (ready).

**6. Terminal.** Push `forge/<slug>`. Open the PR with `gh pr create` against `baseBranch`: ready on full pass; `--draft` plus a `forge:not-passed` label otherwise (create the label first if the repo lacks it; a label failure never blocks the PR). Write `report.md`, print it in chat. On ready: remove the worktree. On draft: keep it and print the removal command.

**Stage errors.** If a dispatched agent returns malformed or missing JSON, retry that dispatch once. A second failure is a stage error: record it in `state.json` and go to terminal (draft) with cause `stage-error:<agent>`. Never infer a verdict from prose.

**Resume.** If `/forge <slug>` is run and `state.json` shows a non-terminal phase with an existing worktree and branch, resume from that phase; otherwise preflight refuses with the collision named. No automatic cleanup of a prior run.

## Agents and model policy

| Agent | Tools | Default model | Effort | Escalation |
|---|---|---|---|---|
| `developer` | all | `sonnet` | medium | `opus` when guard A fires |
| `qa-orchestrator` | Agent, Read, Bash | `sonnet` | low | none |
| `qa-verifier` | Bash, Read, Playwright MCP | `sonnet` | medium | none |
| `peer-reviewer` | Read, Grep, Glob, Bash | `opus` | high | none |

The orchestrator (the session model following `running-forge`) does no reasoning beyond dispatch, read JSON, branch, print. On a Fable session that stays cheap because there is nothing to think about.

**developer** carries the trimmed practices reference: test-first, smallest change that satisfies the criterion, no speculative abstraction, commit per logical unit, run the suite before handing off, never edit outside the worktree. It may dispatch its own per-task subagents (as dev does today); that is its business, not the orchestrator's.

**qa-orchestrator** is mechanical: bring-up, dispatch, merge, teardown. Merging rules: dedupe findings by (criterion, repro) across verifiers, keep the highest severity, union the evidence paths; any finding lacking evidence moves to `unverified[]`. Verdict is `FAIL` iff at least one verified finding has severity `blocking` or `major`. `minor` findings ride along in the report as follow-ups.

**qa-verifier** must run things. Its brief says code reading alone never produces a finding. Lenses are fixed strings passed at dispatch: `acceptance`, `adversarial`, `regression`.

**peer-reviewer** is adversarial: try to find the input that breaks the change; cite `file:line` and the principle (KISS, YAGNI, naming, duplication, error handling, test quality) for every finding; tag each `blocking` or `nit`. Only blocking findings produce `CHANGES`.

### Nesting risk

`qa-orchestrator` dispatching verifiers depends on nested Agent dispatch, which the marketplace already relies on (ship → dev-implementer → task executors). If a host does not permit it, the fallback is for the orchestrator skill to dispatch the N verifiers itself in one parallel message and then dispatch `qa-orchestrator` in merge-only mode with the verifier JSON paths. The contracts do not change; only who issues the dispatches.

## Evidence rules

### Lenses

- **acceptance** — walk every Done-means criterion as a user would (browser for web apps via the bundled Playwright MCP, CLI otherwise); screenshot at each assertion point, pass or fail; append every step to `transcript.md`.
- **adversarial** — edge and error paths around the change: empty and malformed input, boundary values, permissions, concurrency where relevant, the unhappy paths the intent did not mention.
- **regression** — full test suite, lint, typecheck, build. Classify each failure as pre-existing or introduced by running the same command in a throwaway worktree at the merge-base.

Verifier count above 3: extras repeat `acceptance` with Done-means criteria split evenly. Below 3: drop `adversarial` first, then `regression`, never `acceptance`.

### Evidence requirements

Every finding carries at least one of: a screenshot path under the verifier's directory; a command with exit code and an output excerpt; a test name with its failure text. Log excerpts pass through secret redaction before being written (same rule as qa: variable names only, values never). `app.log` tail is capped at 50 lines.

### Environment

Bring-up per `references/environments.md`: detect project type, install, seed if How-to-run says so, launch on a free port, health-check. The orchestrator brings the app up once and passes verifiers the URL and log path so they do not compete for ports. Verifiers share one app but must not share browser state; each opens its own Playwright context.

## Artifact contracts (`references/contracts.md`)

All artifacts are JSON, `"version": 1`, written by exactly one agent, read by the orchestrator and downstream agents. Shapes, abbreviated:

- **dev-handoff.json** — `round`, `commit`, `summary`, `filesChanged[]`, `testsAdded[]`, `howToRun`, `selfCheck {suite: pass|fail, lint, typecheck}`, `deferred[]` (things the developer chose not to do, with reasons), `fixListAddressed[]` (finding ids).
- **verifier-K.json** — `lens`, `verdict: PASS|FAIL`, `findings[] {id, severity: blocking|major|minor, criterion, repro[], evidence[] {kind: screenshot|command|test, path?, command?, exitCode?, excerpt?, test?}}`, `observations[]` (non-blocking notes), `unverified[]`.
- **report.json** — `round`, `verdict`, `findings[]` (merged, same shape), `unverified[]`, `observations[]`, `verifierFiles[]`.
- **review.json** — `round`, `verdict: APPROVE|CHANGES`, `findings[] {id, blocking: bool, file, line, principle, summary, suggestion}`.
- **state.json** — `slug`, `phase: preflight|dev|qa|review|terminal`, `devRound`, `reviewRound`, `escalated`, `branch`, `worktree`, `noProgress[]`, `stageErrors[]`, `terminal {kind: ready|draft, cause?, pr?}`.

Finding ids are `qa-<round>-<n>` and `rv-<round>-<n>`; ids are stable within a run so the oscillation guards can compare sets.

## Terminal report and PR

`report.md` is both the in-chat report and the PR body, sections in this order:

1. **Outcome first.** Passed or not passed; rounds used; if not passed, the open findings with evidence inlined as text.
2. **What was built.** Final handoff summary in prose.
3. **How it works.** Files touched grouped by role; how to run locally.
4. **Verification.** One line per round: dev commit, QA verdict, review verdict; path to the local evidence directory.
5. **Suggested follow-ups.** Reviewer nits, verifier observations, developer `deferred[]`.
6. **PR link, branch, worktree state** (and the removal command when kept).

PR title: `<slug>: <first line of Problem>`. Screenshots stay local (git-excluded); the PR body carries text evidence only.

## Error handling summary

| Condition | Behavior |
|---|---|
| Intent missing or not approved | `/forge` stops with the path and the fix |
| Preflight collision | Stop, name the branch/worktree, no cleanup |
| Agent returns bad JSON twice | Terminal (draft), cause `stage-error:<agent>` |
| Same finding ids two rounds | Escalate developer model |
| Byte-identical QA report two rounds | Terminal (draft), cause `no-progress` |
| Cap reached | Terminal (draft), cause `qa-cap` or `review-cap` |
| App will not come up | Verifiers cannot run; qa-orchestrator reports `FAIL` with one blocking finding carrying the bring-up command output |
| Push or PR creation fails | Report printed with the error verbatim; worktree kept; no retry loop |

## Testing the plugin

- **Evals** under `plugins/forge/evals/` per marketplace convention, board-free: intent gate (draft refused, approved accepted); interview fills only placeholder sections; a stubbed loop (agents replaced by fixture JSON) covering PASS→APPROVE, FAIL→fix→PASS, guard A escalation, guard B early stop, review CHANGES→fix→regression→APPROVE, and stage-error terminal.
- **End-to-end** against the scratch repo used for the dev plugin's headless harness: one full pass to a ready PR and one forced-fail (an unsatisfiable Done-means criterion) to the draft-PR terminal. Recorded under `docs/superpowers/reviews/`.
- **Validation**: `claude plugin validate .` and the existing README pre-commit hook apply unchanged.

## Out of scope (v1)

- Workflow-script engine (Decision 3 notes the path).
- Board mirroring or dashboard integration.
- Multiple intents per run or splitting one intent into several PRs.
- Automatic cleanup of prior failed runs.
- Token accounting per round (the harness does not reliably report subagent usage; nothing is estimated).
