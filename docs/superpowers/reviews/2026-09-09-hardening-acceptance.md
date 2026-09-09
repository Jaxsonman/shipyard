# H-17 — End-to-end acceptance run

**Date:** 2026-09-09
**Branch:** `feat/acceptance` (cut from main `67a0286`)
**Target board:** `Jaxsonman/shipyard-e2e` (scratch repo, toy node calc library, `npm test` = `node --test`)
**Invoking `gh` account:** `Jaxsonman`
**Claude Code:** 2.1.258
**Plugins under test:** `plugins/{ship,dev,qa,pr}` loaded from this worktree, so the code under test is frozen at the commit named per scenario.

## The recipe that worked

Nested headless sessions are launched from the scratch clone with the plugins loaded
by path. **The slash command must be namespaced** — a bare `/ship` returns
`Unknown command: /ship` because commands loaded via `--plugin-dir` are only
reachable as `<plugin>:<command>`. Use `/ship:ship`, `/qa:qa`, `/pr:pr`.

```bash
cd /Users/jaxsonmansouri/Desktop/Projects/shipyard-e2e
claude -p "/ship:ship 5" \
  --plugin-dir <worktree>/plugins/ship --plugin-dir <worktree>/plugins/dev \
  --plugin-dir <worktree>/plugins/qa  --plugin-dir <worktree>/plugins/pr \
  --permission-mode acceptEdits \
  --allowedTools "Bash(git *) Bash(rtk git *) Bash(gh *) Bash(rtk gh *) Bash(node *) \
Bash(rtk node *) Bash(npm *) Bash(rtk npm *) Bash(npx *) Bash(date *) Bash(mkdir *) \
Bash(ls *) Bash(cat *) Bash(sed *) Bash(grep *) Bash(curl *) Bash(lsof *) Bash(kill *) \
Bash(sleep *) Bash(rm *) Bash(mv *) Bash(cp *) Bash(chmod *) Bash(touch *) Bash(find *) \
Bash(head *) Bash(tail *) Bash(wc *) Bash(echo *) Bash(printf *) Bash(true) Bash(false) \
Agent Read Write Edit Glob Grep TodoWrite" \
  --output-format stream-json --verbose > <scratchpad>/<label>.jsonl 2>&1
```

macOS has no `timeout`, so each run is wrapped in a watchdog:
`cmd & CPID=$!; ( sleep $WD; kill -TERM $CPID ) & WPID=$!; wait $CPID; kill $WPID`.
The full runner and a stream-json summarizer live in the scratchpad as
`run.sh` / `summarize.sh`; transcripts are kept there, not in the repo.

`--permission-mode acceptEdits` plus the allowlist above produced **zero** permission
refusals across every run. `--dangerously-skip-permissions` was never used.

## Board setup

`.claude/kanban.config.json` already existed (`github`, `Jaxsonman/shipyard-e2e`).
`.claude/ship.config.json` was written per contract §12.2 and committed to the
scratch repo as `bc81031`:

```json
{ "version": 1, "baseBranch": "main", "loopCap": 3, "approvers": [],
  "qa": { "test": "npm test", "e2e": "cli" } }
```

Per `plugins/qa/references/environments.md` the repo matches the **node/npm** recipe
by detection (`package.json` at root, no compose file) but is **CLI-only** in
substance: no `bin`, no server, no `scripts.dev`/`scripts.start`, so `run` and
`health` are omitted and `e2e` is `cli`. `setup` is omitted because the repo has no
lockfile, so `npm ci` would fail. `config.js validate ship` accepts the file (exit 0).

## Fixture corrections made before the run

The scratch board did not match the story brief in three places. Each was verified
against the live board and corrected or re-assigned; none of these are product defects.

| Ticket | Brief said | Actually was | What I did |
|---|---|---|---|
| #3, #4, #5, #6 | clean | each already carries one `ship:dev standalone` comment | left as-is — it is a useful standalone fixture, and it exposed defect **D-1** |
| #7 | `ship:planned`, clean | carries a `ship:dev escalation` comment, and its plan referenced a fictional `HttpTransport` in `src/transport.js` | rewrote `docs/ship/7/plan.md` to be implementable and planted the loop contradiction there instead |
| #2 | verdict with `round 1/3` and no matching handoff → `verdict-without-handoff` | the verdict header is `ship:qa verdict FAIL round 1/3 tier=full` — it is missing the mandatory `verified k/n`, so it parses as **`malformed-header`**, not `verdict-without-handoff` | ran the scenario as-is; it exercises the same Step 6.5 `reconcile` path with a different code. `verdict-without-handoff` stays covered by `shared/scripts/board-trail.test.js` (two cases, incl. the fixture `issue-verdict-without-handoff.json`) |

Ticket #1 was treated as read-only throughout (reserved for the dashboard lead): the
`/ship 1` run below refuses without writing to the board, and its labels and comments
are unchanged.

---

## Scenario 1 — Not-ready trio (read-only refusals)

Code under test: `67a0286`. All three runs: **PASS**.

### 1a `/ship:ship 3` — spec but no plan

| | |
|---|---|
| Command | `/ship:ship 3` |
| Duration | 138 s (135.8 s API) |
| Tokens | in 28 · cache-create 53,959 · cache-read 705,908 · out 8,513 (5,475 thinking) · $1.68 |
| Board before | `ship:specced`; comments: `ship:dev standalone` |
| Board after | **unchanged** |

Refused with both gate failures and the exact remedy for each: status is Spec'd not
Planned → `/plan 3`; `docs/ship/3/plan.md` missing on `main` and no `feat/3-*` branch
→ `/plan 3`. Correctly reported the trail's `comments-without-branch` **as data**
without escalating, and explained why a refusal (which writes nothing) is right where
an escalation would move a Spec'd ticket to Needs Human. Named the passing gates too.

### 1b `/ship:ship 1` — backlog, no spec, no plan

| | |
|---|---|
| Command | `/ship:ship 1` |
| Duration | 69 s (65.9 s API) |
| Tokens | in 24 · cache-create 48,043 · cache-read 631,311 · out 3,552 · $1.30 |
| Board before | no `ship:*` label; no comments |
| Board after | **unchanged** |

Refused: Backlog status → `/spec 1` then `/plan 1`; both artifacts missing → same.
Volunteered the list of tickets currently at Planned. No board write of any kind.

### 1c `/ship:ship 6` — unsatisfied dependency

`Depends on: #7` was added to #6's body with `gh issue edit`, and the original body
restored immediately afterwards (verified byte-for-byte).

| | |
|---|---|
| Command | `/ship:ship 6` |
| Duration | 188 s (187.8 s API) |
| Tokens | in 18 · cache-create 57,534 · cache-read 480,885 · out 12,021 (8,307 thinking) · $1.87 |
| Board before | `ship:planned`; comments: `ship:dev standalone` |
| Board after | **unchanged** |

Refused on the dependency gate, correctly applying the backend reference's rule (a
dependency is satisfied only when CLOSED or carrying `ship:approved`/`ship:pr-open`)
and naming the remedy: drive #7 through, or close it. It also reported the trail's
`comments-without-branch` and explicitly explained why it did **not** post a
`reconcile` escalation — the dependency gate refuses first and a refusal writes nothing.
That reasoning is correct and matches the skill's "refusals are reports" rule.

**Verdict: PASS.** All three refuse with the exact fixing command, report every failing
gate at once, and change nothing. Confirmed by a label re-read after all three runs.

---

## Scenario 8 — Forged-comment trust check (read-only)

```
node plugins/ship/scripts/board-trail.js parse --repo Jaxsonman/shipyard-e2e \
  --issue 6 --viewer someone-else --pretty
```

Duration < 2 s, no model tokens. Run against **#6** and **#2**.

- Every parsed event came back `"trusted": false`.
- `state.phase` = `"unstarted"`, `state.round` = `0` — **no verdict-driven phase**, even
  on #2 whose trail contains a `FAIL` verdict.
- `state.rounds` = `{}`, `state.standalone` = `[]`, `state.escalation` = `null`.
- Every event appears in `state.untrusted[]` with author, url and raw header.
- `state.irreconcilable` = `[]` and exit code **0** — correct per contract §9 "Trust
  gates irreconcilability": an untrusted malformed header must not wedge a ticket.

**Verdict: PASS.** Decision 4 holds: authorship, not comment text, decides what counts.

---

## Scenario 5b — `/ship:ship 2` on a stalled trail (reconcile)

Code under test: `927ba81`. Transcript: `ship-2-reconcile.jsonl`.

| | |
|---|---|
| Command | `/ship:ship 2` |
| Duration | 137 s (wall) |
| Tokens | in 24 · cache-create 58,479 · cache-read 698,240 · out 9,021 (4,321 thinking) · $1.80 |
| Board before | `ship:in-dev`; comments: 2× `ship:dev standalone`, 1× `ship:qa verdict FAIL round 1/3 tier=full` (missing the mandatory `verified k/n` segment) |
| Board after | `ship:needs-human`; new comment `ship:escalation reconcile round 1/3` |

Ticket was not at Planned, so ship took the **resume** path (Step 6) before any
branch/worktree creation. `board-trail.js parse` returned exit **1**: the QA
comment's header is unrecognisable (missing `verified k/n`) → irreconcilable code
`malformed-header`. Step 6.5 applied: posted the reconcile escalation (verified
verbatim):

```
ship:escalation reconcile round 1/3

## What cannot be reconciled
- `malformed-header` — unrecognised pipeline header: `ship:qa verdict FAIL round 1/3 tier=full` — https://github.com/Jaxsonman/shipyard-e2e/issues/2#issuecomment-5185468043
...
```

then swapped `ship:in-dev` → `ship:needs-human` (verified: exactly one `ship:*`
label afterwards). No branch or worktree was created (`../shipyard-e2e-ship/dev-2`
never existed); nothing pushed. Ship correctly refused to guess which of the two
readings (round 1 really ran vs. the comment is out-of-band) is right and left the
choice — reset to `ship:planned` for a fresh round 1, or repost the verdict in
contract form — to the human.

**Verdict: PASS.** Matches Decision 9/§9 "reconcile, don't guess" and the resume
table's `state.irreconcilable[]` non-empty row.

---

## Scenario 5 — Resume + happy path on `#5` (dev round interrupted by outage)

Code under test: `927ba81`. Transcripts: `ship-5-happy.jsonl` (original run —
posted a genuine `ship:dev escalation`, died before setting the label),
`ship-5-happy-2.jsonl` (the previous lead's human re-entry: reset `#5` to
`ship:planned`, relaunched `/ship:ship 5`, which cut a fresh round 1 in the
existing worktree — `Task 1` + `Fix 1`..`Fix 6` commits — then was killed mid-round
by the outage before posting a round-1 dev handoff comment), `ship-5-resume.jsonl`
(this session's resume run).

**Trail headers before resume** (`board-trail.js parse --issue 5`):

| createdAt | author | header | trusted |
|---|---|---|---|
| 2026-08-05T03:05:01Z | Jaxsonman | `ship:dev standalone` | true |
| 2026-09-09T17:33:52Z | Jaxsonman | `ship:dev escalation` | true |

`state.phase = "escalated"`, `state.round = 0`. Board label at this point:
`ship:in-dev` (the original run died before it could apply `ship:needs-human`;
the previous lead's relaunch cut fresh commits in the worktree but never posted a
board comment for them, so the trail — the only source of state ship reads — is
unchanged since the escalation).

| | |
|---|---|
| Command | `/ship:ship 5` |
| Duration | 116 s (wall) |
| Tokens | in 36 · cache-create 61,188 · cache-read 1,041,284 · out 6,626 (2,729 thinking) · $1.82 |
| Board before | `ship:in-dev` |
| Board after | `ship:needs-human` (no new comment) |

Per the resume table's precedence order (`shipping-tickets/SKILL.md` Step 6.4),
row 2 fired first and took priority over row 8 (`state.round is 0`, which
would otherwise start round 1): **`phase escalated` while status is still
`In Dev`/`In QA`** → the previous run died mid-terminal; complete the pending
transition to `Needs Human`, post no second escalation, run no round. Ship did
exactly that — no dev or QA round dispatched, no comment posted, `ship:in-dev`
swapped for `ship:needs-human` (verified: exactly one label afterwards). It
reported the git-only observation (branch HEAD `2ab6bc1` postdates the escalation
comment, so out-of-band worktree progress exists) as data, without acting on it —
correct, since Step 6.2 says the trail is the only source of pipeline state.
Branch `feat/5-persist-calculation-history` and worktree
`/Users/jaxsonmansouri/Desktop/Projects/shipyard-e2e-ship/dev-5` were both left in
place, as instructed.

**Verdict: PASS.** This is "escalate coherently," not the happy path to a QA
verdict — the trail correctly could not see the interrupted relaunch's work, and
the skill's own resume table calls for exactly this outcome. Because `#5` did not
reach `ship:awaiting-review`, **Step 3 (`/pr:pr 5`) does not apply** and was not
run; the PR flow is otherwise uncovered by this acceptance pass.

---

## Not run live

| Scenario | Why | Covered instead by |
|---|---|---|
| Loop cap (fixture on `#7`) | Lean-scope decision — live loop-to-cap run is expensive (up to `loopCap` dev↔QA round-trips) and the cap-escalation code path is exercised by unit tests | `shared/scripts/board-trail.test.js`: `noProgress` findings-hash and dev-HEAD tests (lines ~318–349); cap-escalation narration in `docs/superpowers/plans/2026-09-08-harden-late.md` Task 3 |
| No-progress / stall (fixture on `#4`) | Same — requires two identical rounds to trigger `state.noProgress[]` | `shared/scripts/board-trail.test.js` `noProgress` tests (byte-identical findings hash, unchanged dev HEAD); round-gap irreconcilable test at line ~168–179 |
| Static tier | No fixture wired for a static-only ticket in this scratch repo; static-tier escalation is a straight-line code path (Step 5.6) once QA returns `tier: "static"` | `docs/superpowers/plans/2026-09-08-harden-late.md` narration for the static-tier escalation and the "resume completes static escalation" row in the Step 6 table (`shipping-tickets/SKILL.md`); exercised structurally by the resume-table's row-3 precedence, which this acceptance run's Scenario 5 confirms is honored for the adjacent `escalated`-phase row |

## Open items

- `#5`'s escalation (`ship:dev escalation`, 2026-09-09T17:33:52Z) still needs a
  human decision: whether the SIGINT-mid-test corruption path in the history.log
  test guard blocks the round or is an acceptable known limitation. `#5` sits at
  `ship:needs-human`; its worktree (`../shipyard-e2e-ship/dev-5`, branch
  `feat/5-persist-calculation-history` @ `2ab6bc1`, unpushed) holds fresh
  uncommitted-to-board work from the interrupted relaunch and was left in place
  per the recipe.
- `/pr:pr` was not exercised live in this pass — `#5` never reached
  `ship:awaiting-review`. The `pr` plugin's own test suite and the earlier
  `feat/pr-plugin` work are the coverage for that stage; no PR was opened against
  `Jaxsonman/shipyard-e2e` by this acceptance run.
- No defects were found this session; `927ba81` (D-1, board-trail fix) remains
  the only code change on `feat/acceptance`. `node --test shared/scripts/*.test.js`
  and `claude plugin validate .` were not re-run since no shared/plugin code
  changed after the prior lead's verified pass.

## Final board state (`Jaxsonman/shipyard-e2e`)

| # | Title | Label |
|---|---|---|
| 1 | Add percentage helper | *(none — reserved, untouched)* |
| 2 | Add clamp function | `ship:needs-human` |
| 3 | Add absolute-difference helper | `ship:specced` |
| 4 | Add rounding helper | `ship:planned` |
| 5 | Persist calculation history | `ship:needs-human` |
| 6 | Add stats helpers | `ship:planned` |
| 7 | Add retrying fetch helper | `ship:planned` |

No PR was opened. No `claude -p` processes remain running. The
`shipyard-e2e-ship/dev-5` worktree is left in place per the recipe.

