---
name: verifying-branches
description: Verification session — run a project's test suite plus real per-criterion E2E against a branch, then issue a tiered verdict with evidence and post it to the ticket. Use when the user wants to QA or verify a branch or ticket, runs /qa, or ship invokes the qa-verifier agent.
---

# Verifying Branches

One invocation = one verdict. QA never moves ticket status, never
prescribes fixes, and writes nothing into the feature branch's diff.

Two modes, decided by how this skill was entered:

- **standalone** — via `/qa`. Interactive: interviews and confirmations
  are allowed. QA creates its own scratch worktree and never touches the
  user's checkout.
- **ship-invoked** — via the `qa-verifier` agent. Autonomous: zero
  prompts, zero interactive dependencies (headless browser, no OAuth
  flows, no questions). Ship passes ticket id, branch, worktree path, and
  round; QA reuses ship's worktree.

Entered directly (neither via `/qa` nor the `qa-verifier` agent) →
default to standalone.

Board mechanics live in `../../references/github.md` and
`../../references/jira.md` — **comment-only by design**; whenever a step
says "via the backend reference," read the file matching `config.backend`
(from `.claude/kanban.config.json`) and follow its named operation
exactly (auth check, fetch ticket, post comment). Environment detection
recipes live in `../../references/environments.md`.

## Step 1: Resolve

Turn the input into `(branch, ticket?, criteria, criteria-source)`:

| Input | Resolves via |
|-------|--------------|
| ticket id (`42`, `PROJ-12`, URL) | ticket → its branch: a worktree claim comment on the ticket, else a branch whose name contains the id (`feat/42-*`) |
| branch name | branch → ticket: id parsed from the branch name, else from its commit messages (`#42`, `PROJ-12`) |
| empty | the current branch, then as above |

Fetch the ticket via the backend reference when one resolved. Ticket or
branch not found → fail fast with the exact error; no artifacts, no
comment, no verdict.

`.claude/kanban.config.json` missing + standalone → bootstrap it exactly as
kanban/planning do (two questions: backend github|jira, target owner/repo or
project key), write and commit the file. If the user declines (repo has no
board), continue boardless: skip ticket fetch, derive criteria from the
diff/PR path, print the verdict to the terminal. Missing + ship-invoked →
error envelope (`"phase": "board"`).

Criteria precedence:

1. `docs/ship/<id>/spec.md`, its **"Done means"** section → authoritative.
2. Ticket body acceptance criteria → *derived*.
3. Diff + PR body → *derived*.

Derived criteria are **standalone-only** and require confirmation: list
them, let the human edit, proceed only on approval. The verdict records
`criteria-source: derived`. Ship-invoked with no `spec.md` → fail fast
(error, not a verdict) — an autonomous run never invents criteria.

Round: ship passes it. Ship-invoked without a round → last `ship:qa`
comment's round + 1 (round 1 if none). Standalone → no round; the comment
header says `standalone`. QA never enforces the loop cap — that is ship's.
`M` in `round N/M` is `loopCap` from the same `.claude/ship.config.json`
(default 3 when absent).

## Step 2: Environment config

Config is the `qa` block of `.claude/ship.config.json`:

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

Optional: `healthTimeoutSeconds` (default 120). `e2e: auto` resolves at
interview time: health URL serves HTML → `browser`; CLI-only repo →
`cli`. No secrets ever — `requiredEnv` holds variable *names*; values
live in the gitignored `envFile`.

The interview persists the *resolved* value. If a confirmed block still
contains `auto`, resolve it at run start without rewriting config: the
block has a `run` command and the health URL serves HTML → `browser`;
no `run` command → `cli`.

- Block present → use it. Never re-detect over a confirmed block.
- Missing + **standalone** → first-run interview: detect using the first
  matching recipe in `environments.md`, present the proposed block
  including *how the port is injected*, let the human confirm or edit,
  then write it to `.claude/ship.config.json` (creating the file with
  only the `qa` block if absent) and commit that file.
- Missing + **ship-invoked** → the verdict is
  `tier=static (config: no confirmed QA environment — run /qa --env-check once interactively)`.
  This is a verdict, not an error: ship applies the static → `Needs
  Human` rule. Never run guessed setup commands autonomously.

## Step 3: Worktree and artifacts

- **standalone:** `git worktree add <repo>/.qa/worktrees/<branch-slug> <branch>`
  and verify there. Record the path for teardown. The user's checkout is
  never touched.
- **ship-invoked:** use the worktree path ship passed; QA did not create
  it and must not remove it.
- **Artifacts dir:** `<main-root>/.qa/<id|branch-slug>/round-<N|standalone>/`,
  where `<main-root>` is the main checkout's top level:
  `dirname "$(git rev-parse --path-format=absolute --git-common-dir)"`.
  This works identically from the main checkout and from any linked worktree.
- Before writing anything, ensure `.qa/` is listed in
  `"$(git rev-parse --path-format=absolute --git-common-dir)/info/exclude"` —
  the shared exclude file (usable from linked worktrees, where `.git` is a
  file, not a directory). Never edit the repo's `.gitignore`; nothing QA
  produces may enter the diff, including the ignore rule itself.
- **Stale-run check (scoped to this ticket):** each run writes `app.pid`
  inside its own artifacts dir. On start, look only under this ticket's
  `.qa/<id|branch-slug>/` tree: a PID whose process is dead → delete the
  stale file; a PID whose process is **alive** is an orphan from a crashed
  previous run of this same ticket → kill its process group. Never touch
  other tickets' `.qa` dirs — live processes there belong to legitimate
  parallel runs.

## Step 4: Bring-up

In `cli` mode: run the env preflight, setup, and seed; skip port,
launch, and health — then continue to Step 5.

1. **Port:** probe upward from `basePort` for the first free port.
   Export it as `PORT` and substitute `{PORT}` in the health URL and run
   command. Probing (not arithmetic) is what makes parallel waves
   collision-proof.
2. **Env preflight:** every name in `requiredEnv` must exist in the
   environment or in `envFile`. Missing → record the *names* (never
   values), skip launch, continue on the tests-only path.
3. **setup → seed → launch → health:** setup (10-minute timeout), seed
   (5-minute timeout), then launch `run` in its own process group with
   stdout+stderr redirected to `<artifacts>/app.log` and its PID written
   to `<artifacts>/app.pid`. Poll the health URL every 2s until HTTP 200
   or `healthTimeoutSeconds` elapses.
4. **Any bring-up failure:** capture the last 50 lines of `app.log` as
   evidence and continue on the tests-only path — never abort the whole
   run because the app wouldn't start.

**`--env-check` mode stops here:** print a report (resolved config,
allocated port, health result, app-log tail), tear down, and exit. No
tests, no E2E, no board comment. This is the debugging path and the way
to run the first-run interview ahead of time. Env-check needs no ticket
and performs no board operations — resolution reduces to branch +
config; skip ticket fetch and auth entirely.

## Teardown — unconditional

On **every** exit path (success, failure, error, interruption):

1. If `app.pid` is alive, kill its entire process group.
2. `git worktree remove --force` every worktree **this run created**
   (scratch worktree, merge-base classification worktree). Never remove
   ship's worktree.
3. The artifacts dir is the only survivor.

## Step 5: Test suite

- Command: `qa.test`. Absent or placeholder → record **"no test suite
  found"** in the verdict body and skip to Step 6 (this alone never
  degrades the tier — see Step 7).
- Run it in the QA worktree. Parse failures.
- **Classify before blaming the branch.** If any test fails, create a
  temporary worktree at `git merge-base <branch> <baseBranch>` (ship
  config `baseBranch`, else the repo's default branch) and re-run **only
  the failing tests** there. This temporary worktree lives at
  `<main-root>/.qa/worktrees/mergebase-<id>` (inside the excluded `.qa/`
  tree) and is removed in teardown:
  - fails on base too → **pre-existing**: excluded from the verdict,
    listed in the comment as "pre-existing (not counted)"
  - passes on base → **regression**: becomes a finding
  - test file doesn't exist at merge-base → branch-introduced; counts
  - the classification worktree itself fails → failures still count,
    marked "unclassified — may be pre-existing"

## Step 6: Per-criterion E2E

Delegation rule: cheap reading-subagents (Sonnet-tier) produce the map —
diff summary, criterion → implementing code and routes, fixture
locations. They **never** drive the browser and never judge outcomes.
The main loop owns the Playwright session and every verdict.

For each criterion, **sequentially** (criteria share one app instance,
one database, one auth session — parallel checks corrupt each other's
fixtures, and a flaky verdict feeds ship's dev loop directly):

1. Plan the steps from the criterion text and the map.
2. Act: `mcp__plugin_qa_playwright__*` tools against
   `http://localhost:{PORT}` (or direct CLI invocations in `cli` mode).
3. Assert an **observable** outcome — something a human could see.
4. Screenshot at the assertion point, pass or fail, saved to the
   artifacts dir (`c<n>.png`, findings `f<n>.png`).
5. Append every step to `<artifacts>/transcript.md`.

Per-criterion result:

- **pass** — the expected outcome was observed.
- **fail** — the contrary was observed, or an app error blocked the
  path. Always carries repro steps.
- **unverifiable** — the criterion cannot be exercised in this
  environment (external service, email/SMS channel, a fixture QA cannot
  fabricate). Never silently converted to pass *or* fail.
- **not-run** — the tier degraded before this criterion could be
  exercised: every criterion is `not-run` in a `static` verdict, and all
  criteria are `not-run` in `tests-only` (per-criterion E2E never
  happens without a running app).

## Step 7: Tier and verdict

| Tier | Condition | Reason wording |
|------|-----------|----------------|
| `full` | E2E ran on ≥1 criterion AND the suite ran — or the repo has no suite at all ("no test suite found" recorded in the body) | — |
| `tests-only` | suite ran; launch/E2E impossible (health never green, missing env vars, Playwright or browser unavailable) | `tier=tests-only (launch: <one-line cause>)` |
| `static` | nothing executed (setup failed, no runnable test command, no confirmed env in ship mode) | `tier=static (<phase>: <cause>)` |

**Verdict rule:** FAIL if any criterion failed or any regression finding
exists. PASS requires zero fails; unverifiable criteria do not block
PASS but appear in the header count (`verified 4/5`) and are itemized. A
`static` PASS must state in the comment that it cannot advance a ticket.

## Step 8: Record

1. Write `verdict.json` and `comment.md` to the artifacts dir **before**
   any board call — the verdict must survive a board failure.
2. Ticket known → post the comment via the backend reference:

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
   1. <symptom>. Repro: <numbered steps>. Violates criterion #4.

   ## Unverifiable
   - <criterion>: <why>

   Suite: 41 passed, 1 failed (1 pre-existing, not counted) — `npm test`
   Repro: PORT=41007 npm run dev
   Artifacts: .qa/42/round-2/   (gitignored)
   ```

   `verified k/n`: `k` = criteria whose result is `pass` or `fail`
   (actually exercised and judged); `n` = total criteria.

   Omit empty sections. Standalone header:
   `ship:qa verdict PASS standalone tier=full verified 5/5`. When
   `criteriaSource` is `derived`, append ` criteria=derived` to the
   header (omit entirely when the source is `spec`), e.g.:
   `ship:qa verdict PASS standalone tier=full verified 5/5 criteria=derived`.
   Post fails → retry once → on second failure set
   `commentPosted: false` (the comment is already saved to disk; ship or
   a human reposts it).
3. No ticket resolved → print the comment to the terminal; zero board
   operations.
4. **Findings are findings, never solutions.** Symptom, repro steps,
   criterion violated, evidence path. The dev agent owns the how. Every
   finding must be reproducible by a human from its steps alone.
5. Final output:
   - **ship-invoked:** the agent's final message is **exactly** this
     JSON object, no prose around it:

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
       "suite": {"ran": true, "passed": 41, "failed": 1,
                 "preExisting": 1, "command": "npm test"},
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

     Field notes: `tierReason` is the reason-wording string when tier is
     degraded, else `null`. `round` is `null` standalone.
     `criteriaSource` is `"spec"` or `"derived"` — `"derived"` when
     criteria did not come from spec.md's "Done means".
     `criteria[].source` is `"spec"` or `"derived"`; `criteria[].result`
     is `"pass" | "fail" | "unverifiable" | "not-run"` (`not-run` = the
     tier degraded before this criterion could be exercised — all
     criteria in `static`; all in `tests-only`). `unverifiable` entries
     are `{"criterion": <id>, "why": "<one line>"}`.
   - **standalone:** summarize conversationally — verdict, tier, the
     criteria table, findings, artifact paths, repro command.

## Error handling

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

| Failure | Behavior |
|---------|----------|
| Ticket or branch not found | Fail fast, exact error; no artifacts, no comment |
| No spec.md, ship-invoked | Fail fast (error, not verdict) — never invent criteria |
| No confirmed env, ship-invoked | Verdict `tier=static`, reason names `--env-check` |
| Missing required env vars | Report names only; tests-only path |
| Health never green | Tests-only path; app-log tail as evidence |
| Playwright unavailable / browser download blocked | Tests-only; reason names it explicitly |
| Classification worktree fails | Failures count, marked "unclassified — may be pre-existing" |
| Board auth fails, ship-invoked | Verify anyway; `commentPosted: false`; verdict JSON still returned |
| Comment post fails after verification | Retry once → save to artifacts, `commentPosted: false` — the verdict is never lost |

## Hard rules

- No status transitions, ever. The reference files contain no such
  operation — keep it that way.
- Findings never prescribe solutions.
- A `static` PASS never advances a ticket and must say so.
- Nothing QA produces enters the feature branch's diff — including the
  `.qa/` ignore rule (`.git/info/exclude`, never `.gitignore`).
- Every autonomous path runs headless with zero prompts. Anything
  interactive (interview, derived-criteria confirmation, OAuth) exists
  only on the standalone path.
