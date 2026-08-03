# QA Plugin — /qa Design

**Date:** 2026-08-03
**Status:** 🚧 **Draft — brainstorm paused mid-session.** Not approved. Parts 2
and 3 of the design are unwritten; see "Where this stopped" before resuming.
**Parent:** `2026-07-22-feature-pipeline-architecture-design.md` (build order item 3)

## Purpose

The verification stage of the feature pipeline. `/qa` runs a project's test
suite *and* real end-to-end verification against a branch, then issues a
per-criterion verdict with evidence. Ship's dev ⇄ QA loop consumes that
verdict; the fix-list shape QA defines here is the contract every later
stage is built against.

QA is sequenced third in the umbrella's build order for two reasons:
`/qa <branch>` is useful today on human-written branches with no autonomous
stages built, and it pins down the verdict/fix-list contract *before* `dev`
exists to consume it.

## Where this stopped

Brainstorming checklist state:

| Step | State |
|------|-------|
| Explore project context | ✅ done |
| Clarifying questions | ✅ done — six decisions locked below |
| Propose approaches | ✅ done — Approach A approved |
| Present design sections | ⏸ **Part 1 presented, not yet approved. Parts 2–3 unwritten.** |
| Write design doc | ⏸ this file, partial |
| Spec self-review | ⬜ not started |
| User reviews spec | ⬜ not started |
| Invoke writing-plans | ⬜ not started |

**To resume:** re-enter `superpowers:brainstorming`, confirm Part 1 below,
then work Parts 2 and 3 (contents specified in "Still to design").

## Locked decisions

Each was chosen deliberately over stated alternatives.

### 1. Invocation and criteria — both inputs, criteria-optional

`/qa` accepts a ticket, a branch, or nothing (current branch). Criteria come
from `spec.md` when it exists; otherwise QA derives provisional criteria and
labels the verdict as running on derived criteria.

*Rejected:* branch-only (ship would have to translate ticket → branch
itself); ticket-only (gives up the human-written-branch case that justifies
qa's position in the build order).

### 2. E2E driver — bundled Playwright MCP, driven interactively

The plugin ships its own `.mcp.json` with Playwright MCP in headless mode,
the same way `planning` bundles the Atlassian server. QA drives the app
live, adapting per criterion, capturing screenshots and a step transcript as
evidence.

*Why headless matters:* review finding #10 wants headless-runner
compatibility as a stated design property, and an autonomous worktree under
`/ship` has no interactive desktop session.

*Rejected:* QA authoring throwaway Playwright scripts (reliable selectors
for an unknown app are slow and brittle, and script-authoring edges into the
dev agent's job); `claude-in-chrome` against the user's real Chrome (needs
an interactive session and per-site grants — cannot run unattended, which
breaks ship's loop).

*Cost accepted:* first run needs `npx` and a browser download.

### 3. Environment contract — detect, confirm once, persist

Addresses review finding #5. First run auto-detects from `package.json` /
`docker-compose` / `.env.example`, proposes a QA environment block, the
human confirms, and it persists to committed config:

```json
"qa": {
  "setup":       "npm ci",
  "seed":        "npm run db:seed",
  "run":         "npm run dev",
  "health":      "http://localhost:{PORT}/",
  "basePort":    41000,
  "envFile":     ".env.qa.local",
  "requiredEnv": ["DATABASE_URL"]
}
```

Two invariants: **no secrets in config** — it records required variable
*names* and the path to a local gitignored env file, and QA reports missing
vars by name; and **ports are allocated per-worktree** from `basePort` so
parallel waves don't collide.

*Rejected:* re-detect every run (nondeterministic, and nothing to correct
when it guesses wrong); explicit-config-only (a hard wall on first use in
every repo — worst possible first-run experience for standalone `/qa`).

### 4. Degraded tiers — three tiers; a static PASS cannot advance

Every verdict is stamped with a tier **and the reason it degraded**:

| Tier | Meaning | May advance? |
|------|---------|--------------|
| `full` | tests + E2E both ran | yes |
| `tests-only` | suite ran, app would not launch | yes, flagged |
| `static` | nothing executed | **no — escalates to `Needs Human`** |

A PASS with nothing executed is not evidence, it's an opinion — so it never
advances a ticket. This is the designed degraded tier finding #5 asked for,
and it keeps the umbrella's rule that QA never silently degrades to static
review.

*Rejected:* any-tier-may-advance (leaves a PASS in the audit trail that
verified nothing); full-tier-or-escalate (in early enterprise adoption —
the review's expected common case — nearly every ticket would park on a
human).

### 5. Evidence — the board comment is the record

Verdict and fix-list are posted as a ticket comment carrying the umbrella's
structured header. The board is the system of record; that durable async
board state is the product's differentiator. Screenshots and logs go to a
gitignored scratch dir referenced by path, and the comment carries the
reproduction command so a human can re-run it themselves.

Nothing QA produces enters the feature branch's diff.

*Rejected:* committed per-round report files (QA churn pollutes the PR diff
and grows every loop round); board attachments (no supported `gh` CLI path
for image upload, so the two backends would diverge — breaks
backend-agnosticism).

### 6. Write authority — QA comments, only ship transitions

QA is a pure worker. It posts its verdict comment and returns a structured
result; it never moves a ticket between statuses, in either mode. Ship owns
the state machine and applies the tier → advance rule from the verdict.

One writer to board *state* means a human running `/qa` on a scratch branch
can never accidentally push a real ticket to `Awaiting Review`.

*Rejected:* QA drives status too (two writers to the state machine);
per-invocation flag (extra surface to document, test, and reason about).

## Approach — A: one skill, three phases, sequential E2E (approved)

A single `verifying-branches` skill running **Bring-up → Verify → Verdict**.
Criteria are checked one at a time against one app instance. Cheap Sonnet
subagents do the *reading* — diff summary, mapping criteria to implementing
code, locating test setup — while the main loop owns the browser session and
every verdict it issues.

**Why E2E stays sequential:** criteria share mutable state. One app
instance, one database, one auth session — verifying "lockout after 5 failed
attempts" concurrently with "successful login" means each corrupts the
other's fixtures. A flaky verdict is worse than a slow one, because ship
feeds it straight into the dev loop as a fix-list. Delegation goes to the
reading, not the driving.

*Rejected:* splitting env bring-up into its own skill (nothing else consumes
it yet; its debuggability benefit is taken as an `--env-check` mode on A
instead); parallel per-criterion agents with an instance each (multiplies
environment cost by N in exactly the repos where bring-up is already
fragile, and imperfect isolation yields confident wrong verdicts).

## Part 1 — Structure and resolution (presented, approval pending)

```
plugins/qa/
├── .claude-plugin/plugin.json
├── .mcp.json                       # playwright MCP, --headless
├── commands/qa.md                  # /qa [branch|ticket] — thin trigger
├── agents/qa-verifier.md           # what /ship invokes
├── skills/verifying-branches/SKILL.md
└── references/
    ├── github.md                   # fetch ticket, post comment
    ├── jira.md                     # same, via Jira
    └── environments.md             # per-stack bring-up detection recipes
```

**This plugin has an agent definition, unlike `planning`.** Planning omitted
agents because ship never invokes it; ship *does* invoke QA. There is a
second reason: a QA run generates an enormous transcript (test output,
browser steps, screenshots). Inside an agent that stays in the agent's
context, and only the structured verdict crosses back into ship's. Ship
orchestrating a wave cannot afford to hold three full browser transcripts.

**Board ops are comment-only by construction.** The reference files carry
auth check, fetch ticket, and post comment — deliberately *not* set-status —
so decision 6's boundary is enforced by what the plugin can physically do,
not by a rule in prose that might drift.

**Resolution** turns any input into `(branch, ticket?, criteria, criteria-source)`:

| Input | Resolves via |
|-------|--------------|
| `/qa 42` | ticket → its branch (worktree claim, or branch name matching the id) |
| `/qa feat/42-login` | branch → ticket inferred from branch name, then commit messages |
| `/qa` | current branch, then as above |

Criteria precedence:

1. `docs/ship/<id>/spec.md` → the **"Done means"** section. Authoritative.
2. Ticket body acceptance criteria → *derived*.
3. Diff + PR body → *derived*.

**Derived criteria are a standalone-only path and require human
confirmation.** Ship only invokes QA on tickets that reached `Planned`,
which by definition carry an approved `spec.md` — so the autonomous phase
never runs on guessed criteria. A ship-invoked run that finds no spec fails
rather than inventing something to test against.

**Standalone never touches the user's working tree.** QA adds its own
`git worktree` for the target branch under a scratch path and verifies
there, so running `/qa` mid-task doesn't disturb what is checked out.
Ship-invoked runs reuse the worktree ship already created.

## Still to design

### Part 2 — the run

- **Bring-up sequence:** setup → seed → launch → health-check poll →
  per-worktree port assignment; timeout and teardown discipline (no orphaned
  app processes or worktrees on failure).
- **First-run detection interview:** what `environments.md` recipes cover
  (node/npm, docker-compose, python, go, static, CLI-only), and how the
  proposal is confirmed and persisted.
- **Test suite execution:** discovering the command, distinguishing
  pre-existing failures on the base branch from regressions introduced by
  this branch — a QA verdict must not fail a ticket for a suite that was
  already red.
- **Per-criterion E2E:** the navigate → act → assert → screenshot loop, how
  a criterion is judged unverifiable vs failed, and `e2e: browser | cli |
  auto` detection.
- **Tier determination:** exactly what conditions produce each of the three
  tiers, and the wording of the degradation reason.
- **`--env-check` mode:** bring-up only, no verification — the debuggability
  path carried over from rejected Approach B.

### Part 3 — contracts and error handling

- **Verdict contract:** the exact structured object the agent returns to
  ship, and the exact comment format. Draft shape:

  ```
  ship:qa verdict FAIL round 2/3 tier=full

  | # | Criterion | Verdict | Evidence |
  ...
  ## Findings
  1. Symptom / Repro steps / Criterion violated

  Repro: <command>
  Artifacts: .qa/42/round-2/   (gitignored)
  ```

- **Fix-list rules:** findings only, never prescribed solutions — the dev
  agent owns the how (umbrella contract).
- **Round awareness:** QA reads the last structured `ship:*` comment to
  learn its round; standalone runs have no round.
- **Error handling:** bring-up failure, health check never green, missing
  env vars, Playwright unavailable, browser download blocked, ticket not
  found, board comment failure after verification succeeded (verdict must
  not be lost).
- **Verification section:** acceptance tests for the plugin itself, in the
  style of the planning spec — including a deliberately failing criterion, a
  repo that cannot launch (→ `tests-only`), and a standalone run proving
  board status is untouched.

## Parked review findings this stage must absorb

From `docs/superpowers/reviews/2026-07-23-feature-pipeline-architecture-review.md`:

- **#5 QA environment contract** — per-worktree ports/env/seed data,
  secrets, and a *designed* degraded tier, explicitly labeled. Addressed by
  locked decisions 3 and 4; Part 2 must carry it into the run's mechanics.
- **#10 (partial)** — headless-runner compatibility as a stated design
  property. Addressed by decision 2; Part 3 should state it as an explicit
  design property rather than an implementation accident.

Also noted in that review, unowned and *not* in scope here unless we decide
otherwise: the loop cap counts rounds but not tokens, so there is no
per-ticket spend ceiling. QA is the expensive stage — worth a decision when
`ship` is specced.

## Non-goals

- Authoring production tests. QA runs the suite and verifies criteria; the
  dev agent owns test authorship (plan.md carries the testing approach).
- Prescribing fixes. Findings only.
- Moving tickets between statuses (decision 6).
- Running the dev ⇄ QA loop. QA issues one verdict per invocation; ship owns
  the loop and its round cap.
