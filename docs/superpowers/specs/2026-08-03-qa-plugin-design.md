# QA Plugin — /qa Design

**Date:** 2026-08-03
**Status:** ✅ Design approved in session (all three parts). Awaiting final spec review.
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
  "test":        "npm test",
  "health":      "http://localhost:{PORT}/",
  "basePort":    41000,
  "envFile":     ".env.qa.local",
  "requiredEnv": ["DATABASE_URL"],
  "e2e":         "auto"
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
review. Exact conditions for each tier are defined in Part 2.

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

## Part 1 — Structure and resolution (approved)

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

## Part 2 — The run (approved)

### Config home

The `qa` block (decision 3) lives in `.claude/ship.config.json`. Standalone
`/qa` creates the file with just that block if it doesn't exist — QA must
not require ship to have run first. **This supersedes the umbrella spec's
top-level `runCommand` / `e2e` sketch**; those keys move inside the `qa`
block (`run`, `e2e`), and ship's future spec follows this shape. The block
also carries `test` (suite command) and `healthTimeoutSeconds` (optional,
default 120). A missing `.claude/kanban.config.json` follows the same
must-not-require-ship-first rule: standalone bootstraps it (or continues
boardless if the human declines); ship-invoked returns the error envelope.

### First-run interview (standalone only)

No `qa` block → detect from `package.json` / `docker-compose.yml` /
`.env.example` using `references/environments.md` recipes: node/npm,
docker-compose, python, go, static site, CLI-only. QA presents the proposed
block; the human confirms or edits; it persists. Each recipe must state
*how the port is injected* (PORT env var, `--port` flag, compose env
override); if detection can't determine a port mechanism, the interview
asks.

**A ship-invoked run with no confirmed `qa` block does not
detect-and-proceed.** An autonomous agent must not run guessed setup
commands. It returns `tier=static` with reason `no confirmed QA environment
— run /qa --env-check once interactively`, and ship escalates per the tier
rule.

### Bring-up sequence

1. **Port allocation:** probe upward from `basePort` for a free port;
   export it as `PORT` and substitute `{PORT}` in the health URL. Probing
   (not arithmetic on worktree index) is what makes parallel waves
   collision-proof.
2. **Env preflight:** check `requiredEnv` names against the environment
   plus `envFile`. Missing vars → skip launch entirely, report the *names*
   (never values), continue on the tests-only path.
3. **setup → seed → launch → health poll:** setup has a 10-minute timeout,
   seed 5 minutes; `run` launches in its own process group; the health URL
   is polled until it returns 200 or `healthTimeoutSeconds` (default 120)
   elapses. Any failure captures the tail of the app log as evidence and
   falls through to the tests-only path.
4. **Stale-run check (scoped to this ticket):** each run writes `app.pid`
   inside its own artifacts dir. On start, QA looks only under this
   ticket's `.qa/` tree: a dead PID's file is removed as stale; a live PID
   is an orphan from a crashed previous run of this same ticket and its
   process group is killed. Other tickets' `.qa` dirs are never touched —
   live processes there belong to legitimate parallel runs.

### Teardown discipline

Teardown is unconditional: kill the app's process group and remove
QA-created scratch worktrees on *every* exit path — success, failure,
error, interruption. The artifacts dir is the only survivor. No orphaned
app processes, no orphaned worktrees.

### `--env-check` mode

Resolution + bring-up + health check + a printed report (detected config,
allocated port, health status, app-log tail) + teardown. No tests, no E2E,
no board comment. This is both the debugging path (carried over from
rejected Approach B) and the natural way to run the first-run interview
ahead of time.

### Test suite execution

The command comes from `qa.test` (interview-filled; recipes provide
defaults). QA runs it in the QA worktree and parses failures. If any test
fails, QA classifies before blaming the branch: it creates a *temporary
second worktree at the merge-base* and re-runs **only the failing tests**
there.

- Fails on base too → **pre-existing**: excluded from the verdict, listed
  in the comment as "pre-existing (not counted)".
- Passes on base → **regression**: becomes a finding.
- Test file doesn't exist at merge-base → branch-introduced by definition;
  its failures always count.

This provides the already-red-suite protection without doubling suite
runtime. If the classification worktree itself fails (broken merge-base
checkout), failures still count but are marked "unclassified — may be
pre-existing" rather than silently blamed on the branch.

### Per-criterion E2E

For each criterion, the main loop — which owns the browser session — runs:

```
plan steps → navigate/act (Playwright MCP, or shell in cli mode)
  → assert an observable outcome → screenshot at the assertion point
  → append to the step transcript
```

Sonnet reading-subagents feed it the map (diff summary, criterion →
implementing code, fixture locations) but never drive the browser or judge
outcomes. Three per-criterion results:

- **pass** — the expected outcome was observed.
- **fail** — the contrary was observed, or an app error blocked the path.
  Always carries repro steps.
- **unverifiable** — the criterion cannot be exercised in this environment
  (external service, email/SMS channel, a fixture QA can't fabricate).
  Never silently converted to pass *or* fail.

**Overall verdict rule:** FAIL if any criterion fails. PASS requires zero
fails; unverifiable criteria do not block PASS but are surfaced in the
header (`verified 4/5, 1 unverifiable`) and itemized. Rationale: the stage
after a QA PASS is the *human review gate*, so unverified criteria land in
front of a person anyway; escalating every ticket with one unreachable
criterion would park most real-world tickets on `Needs Human`.

**e2e mode:** `qa.e2e` is `browser | cli | auto`. `auto` resolves once at
interview time: health URL serves HTML → browser; bin-entry/CLI project →
cli (driven via shell invocations with the same transcript discipline).

The interview persists the *resolved* value. If a confirmed block still
contains `auto`, resolve it at run start without rewriting config: the
block has a `run` command and the health URL serves HTML → `browser`;
no `run` command → `cli`.

### Tier determination — exact conditions

| Tier | Condition | Reason wording |
|------|-----------|----------------|
| `full` | E2E ran on ≥1 criterion AND the suite ran — **or the repo has no suite at all**, recorded as "no test suite found" in the verdict body | — |
| `tests-only` | suite ran; launch/E2E impossible (health never green, missing env vars, Playwright or browser download unavailable) | `tier=tests-only (launch: <one-line cause>)` |
| `static` | nothing executed (setup failed, no runnable test command, or no confirmed env in ship mode) | `tier=static (<phase>: <cause>)` |

A repo with no test suite can still earn `full` when E2E ran: QA executed
everything that *exists*, and the missing suite is flagged in the verdict
body rather than punishing the tier. The strict reading of decision 4
("tests + E2E both ran") would make `full` permanently unreachable for
suite-less repos.

## Part 3 — Contracts and error handling (approved)

### Verdict contract

Two forms, one source of truth. **The agent's final message to ship is a
single JSON object** — that is what "returns a structured result" means
concretely; ship parses the agent's last message:

```json
{
  "verdict": "FAIL",
  "tier": "full",
  "tierReason": null,
  "round": 2,
  "ticket": "42",
  "branch": "feat/42-login",
  "criteriaSource": "spec",
  "criteria": [
    {"id": 1, "text": "...", "source": "spec", "result": "pass",
     "evidence": ".qa/42/round-2/c1.png"}
  ],
  "suite": {"ran": true, "passed": 41, "failed": 1, "preExisting": 1,
            "command": "npm test"},
  "findings": [
    {"id": 1, "symptom": "...", "repro": ["..."], "criterion": 2,
     "evidence": ".qa/42/round-2/f1.png"}
  ],
  "unverifiable": [],
  "artifacts": ".qa/42/round-2/",
  "repro": "PORT=41007 npm run dev",
  "commentPosted": true
}
```

`criteriaSource` is `"spec"` or `"derived"` — `"derived"` when criteria
did not come from spec.md's "Done means". `criteria[].result` is
`"pass" | "fail" | "unverifiable" | "not-run"` (`not-run` = the tier
degraded before this criterion could be exercised — all criteria in
`static`; all in `tests-only`).

The board comment is the human-readable rendering of the same data:

```
ship:qa verdict FAIL round 2/3 tier=full verified 4/5

| # | Criterion | Verdict | Evidence |
|---|-----------|---------|----------|
| 1 | <text> | pass | .qa/42/round-2/c1.png |
| 2 | <text> | pass | .qa/42/round-2/c2.png |
| 3 | <text> | pass | .qa/42/round-2/c3.png |
| 4 | <text> | FAIL | .qa/42/round-2/f1.png |
| 5 | <text> | unverifiable | — |

## Findings
1. <symptom> / <repro steps> / criterion #4 violated

## Unverifiable
- <criterion>: <why>

Repro: PORT=41007 npm run dev
Artifacts: .qa/42/round-2/   (gitignored)
```

`verified k/n`: `k` = criteria whose result is `pass` or `fail`
(actually exercised and judged); `n` = total criteria. A `static`
verdict carries all criteria as `not-run`, `verified 0/n`, and its
comment states it cannot advance the ticket.

Standalone runs stamp `standalone` where the round goes. When
`criteriaSource` is `derived`, the header appends ` criteria=derived`
(omitted entirely when the source is `spec`), e.g.:
`ship:qa verdict PASS standalone tier=full verified 5/5 criteria=derived`.
A standalone run whose branch resolves to *no ticket* prints the
comment to the terminal instead and performs no board operations at
all.

QA ensures `.qa/` is ignored via `.git/info/exclude` (resolved via
`git rev-parse --git-common-dir` so it works from linked worktrees),
never by editing the repo's `.gitignore` — decision 5's "nothing QA
produces enters the diff" applies to the ignore rule itself too.

**Ship-invoked error envelope.** Fail-fast paths (ticket/branch not
found; no `spec.md`; board unavailable before verification started)
return, as the agent's final message, exactly:

```json
{"error": "<one-line cause>", "phase": "resolve|config|worktree|board",
 "ticket": "42", "branch": "feat/42-login"}
```

(`ticket`/`branch` null when unresolved.) No `verdict` field — ship
treats an `error` object as a failed invocation, distinct from a
verdict. Standalone fail-fast paths report the same facts as prose.

### Fix-list rules

Numbered findings: symptom, repro steps, criterion violated, evidence
path. **Never a prescribed solution** — the dev agent owns the how
(umbrella contract). Every finding must be reproducible by a human from
its steps alone.

### Round awareness

Ship passes the round when invoking QA. If absent, QA derives it as the
last `ship:qa` comment's round + 1. Standalone runs have no round. QA
never enforces the loop cap — that is ship's job.

### Error handling

Beyond the bring-up failures Part 2 routes to tiers. Ship-invoked
fail-fast rows below return the error envelope defined in the Verdict
contract, as the agent's final message, in place of a verdict:

| Failure | Behavior |
|---------|----------|
| Ticket or branch not found | Fail fast with a clear message; no artifacts, no comment. |
| No spec.md, ship-invoked | Fail fast (error, not verdict) — never invent criteria. |
| Playwright MCP unavailable / browser download blocked | `tests-only`; reason names it explicitly. |
| Merge-base classification worktree fails | Suite failures still count, marked "unclassified — may be pre-existing". |
| Board comment post fails after verification succeeded | **The verdict must not be lost.** Retry once; then write the rendered comment to `.qa/<id>/round-N/comment.md`, set `commentPosted: false` in the returned object, and report it. The JSON object and artifacts persist regardless, so ship or a human can repost. |

### Headless compatibility — stated design property

Closes review finding #10 for this stage: **every autonomous path runs
with zero interactive dependencies** — headless browser, no prompts, no
desktop session, no per-site grants. Anything that requires a human (the
env interview, derived-criteria confirmation) exists *only* on the
standalone interactive path. This is a design property to be preserved,
not an implementation accident.

## Verification

Acceptance tests for the plugin itself:

1. Standalone `/qa` on a branch with a deliberately failing criterion →
   FAIL verdict whose finding is reproducible from its repro steps; board
   status untouched.
2. A repo that cannot launch → `tests-only` with the exact reason wording;
   a PASS at this tier is flagged as degraded.
3. No confirmed env under simulated ship invocation → `static`; verdict
   states it must not advance.
4. `--env-check` on a fresh repo runs the interview once, persists the
   block; a second run skips the interview.
5. Two parallel QA worktrees allocate distinct ports; no collision.
6. A suite that is red on the merge-base → failures listed as pre-existing,
   not counted as findings.
7. Simulated comment-post failure → `comment.md` saved in artifacts, JSON
   object intact with `commentPosted: false`.
8. Standalone run on a branch with no resolvable ticket → terminal verdict,
   zero board operations.
9. Inspection: `references/github.md` and `references/jira.md` contain no
   set-status operation.

## Parked review findings this stage absorbs

From `docs/superpowers/reviews/2026-07-23-feature-pipeline-architecture-review.md`:

- **#5 QA environment contract** — per-worktree ports/env/seed data,
  secrets, and a *designed* degraded tier, explicitly labeled. Addressed
  by decisions 3 and 4; Part 2 carries it into the run's mechanics.
- **#10 (partial)** — headless-runner compatibility as a stated design
  property. Addressed by decision 2; stated explicitly in Part 3.

Also noted in that review, unowned and *not* in scope here: the loop cap
counts rounds but not tokens, so there is no per-ticket spend ceiling. QA
is the expensive stage — worth a decision when `ship` is specced.

## Non-goals

- Authoring production tests. QA runs the suite and verifies criteria; the
  dev agent owns test authorship (plan.md carries the testing approach).
- Prescribing fixes. Findings only.
- Moving tickets between statuses (decision 6).
- Running the dev ⇄ QA loop. QA issues one verdict per invocation; ship owns
  the loop and its round cap.
