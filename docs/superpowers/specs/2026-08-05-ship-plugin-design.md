# Ship Plugin — /ship v1 Design

**Date:** 2026-08-05
**Scope:** Ship v1 — single-ticket conductor for the dev ⇄ QA loop.
**Parent:** `2026-07-22-feature-pipeline-architecture-design.md` (umbrella
architecture; authoritative for anything not restated here).

## Purpose

Ship is the conductor of the autonomous back half of the pipeline. v1
takes ONE planned ticket from `Planned` to `Awaiting Review` (or
`Needs Human`) by orchestrating the existing dev and qa plugins: it owns
board status transitions, the worktree/branch lifecycle, round counting
and the loop cap, verdict parsing, and escalation. It owns no worker
logic — dev implements, QA verifies, ship conducts.

**v1 scope decision (approved):** single-ticket `/ship <ticket>` only.
Wave mode, the claim protocol, merge strategies, dependent-ticket
stacking, the human review gate (approver verdicts, change-request →
fix-list conversion), and the pr stage are v2+. Bare `/ship` lists
ready tickets and explains wave mode is not built yet.

## Locked decisions

### 1. Plugin shape — no agent in v1

`plugins/ship/` follows the established split minus `agents/`: nothing
invokes ship, it is the top of the chain.

```
plugins/ship/
  .claude-plugin/plugin.json
  .mcp.json                       (Atlassian remote MCP, same as siblings)
  commands/ship.md                (thin trigger)
  skills/shipping-tickets/SKILL.md
  references/github.md            (fetch, post comment, set status)
  references/jira.md              (fetch, post comment, set status)
```

Plus a marketplace entry in `.claude-plugin/marketplace.json`.

### 2. Write authority — ship's reference files include Set status

Dev and qa's backend reference files deliberately contain no set-status
operation; planning's do. Ship's reference files follow planning's
pattern (auth check, fetch ticket, post comment, set status) and add the
later-stage labels, created idempotently with `--force`:

```
ship:in-dev            color 0E8A16   "Dev round in progress — see ship:dev comments"
ship:in-qa             color FBCA04   "QA verification in progress — see ship:qa comments"
ship:awaiting-review   color D93F0B   "QA passed — review packet posted, human verdict needed"
ship:needs-human       color B60205   "Escalated — see latest escalation comment"
```

Set status = apply the target `ship:*` label, remove any other `ship:*`
label the ticket carries (planning's established semantics). Jira: real
workflow transitions where the workflow has a matching status, falling
back to `ship-in-dev` / `ship-in-qa` / `ship-awaiting-review` /
`ship-needs-human` labels (hyphenated) where it does not — planning's
convention.

Only ship transitions tickets. Ship posts comments only for its own
artifacts (review packet, cap escalation, resume notes); dev and qa post
their own handoffs and verdicts.

### 3. Config — v1 writes only the keys it uses

`.claude/ship.config.json`, committed, team-shared, no secrets. Backend
and board identity stay in `.claude/kanban.config.json`; ship reads it
and never duplicates it.

First `/ship` run with no config file runs a short interview and writes:

```json
{
  "baseBranch": "main",
  "loopCap": 3
}
```

- `baseBranch` — detected (`git symbolic-ref refs/remotes/origin/HEAD`,
  fallback to current branch), confirmed with the user.
- `loopCap` — default 3, confirmed with the user.

Other keys from the umbrella design (`mergeStrategy`, `approvers`,
`claimTtlMinutes`) are added by the stages that use them (v2). The `qa`
block belongs to qa's own first-run interview — ship never writes it.
If the file exists but lacks a key ship needs, ship asks for just that
key and merges it in; it never overwrites keys it does not own.

### 4. Preflight — gates enforced with the human still in the room

`/ship <ticket>` refuses to go autonomous unless every gate passes.
Refusals are reports, not errors: state what is missing and the exact
command that fixes it.

1. **Configs.** `kanban.config.json` must exist (else: run `/kanban`
   first). `ship.config.json` created via first-run interview if
   missing.
2. **QA readiness.** If `ship.config.json` has no `qa` block, refuse:
   ship-invoked QA never interviews; it would degrade to a `tier=static`
   verdict, which ship converts to `Needs Human` — the run would
   escalate immediately. The fix named in the report: run `/qa` once
   (its first-run interview creates the block).
3. **Ticket status.** Board status must be `Planned` (`ship:planned`).
   - `Spec'd`/backlog → refuse: run `/spec` / `/plan` first.
   - `Needs Human` → refuse, pointing at the latest escalation comment;
     after addressing it the human sets the ticket back to
     `ship:planned` to re-enter the pipeline.
   - `In Dev` / `In QA` → resume path (decision 8).
   - `Awaiting Review` → report the existing review packet; nothing to
     do in v1.
4. **Artifacts.** `docs/ship/<id>/spec.md` and `plan.md` must exist on
   `baseBranch` or the ticket's existing `feat/<id>-*` branch.
5. **Dependencies.** Any `Depends on: <ref>` line in the ticket body
   (kanban v2 contract) whose target is not `Approved`/`PR Open`/`Done`
   → refuse with a not-ready report listing the blocking tickets.
   Dependent-ticket stacking arrives with merge strategies in v2.

### 5. Setup — ship creates and owns the worktree

Reuse dev's standalone conventions exactly, so standalone-dev and
ship-invoked-dev converge on the same branch and path:

- Branch: reuse an existing `feat/<id>-*`; otherwise create
  `feat/<id>-<short-kebab-slug-of-title>` from `baseBranch`.
- Worktree: `git worktree add ../<repo-dir-name>-ship/dev-<id> <branch>`.

Ship creates the worktree, passes it to both agents, and is the only
component that removes it. Per the existing contracts: ship-invoked dev
"never removes the worktree on exit; it is ship's to manage"; QA "did
not create it and must not remove it."

Worktree end-of-life in v1: kept after both terminal states. After
`Awaiting Review` the reviewer needs it (the packet includes the path,
the run command, and the cleanup command `git worktree remove
../<repo-dir-name>-ship/dev-<id>`). After `Needs Human` it is kept for
inspection, same as dev standalone escalations.

### 6. The loop — round machinery and terminal states

Status → `In Dev`, then per round N (1‥loopCap):

1. **Dev round.** Dispatch the `dev-implementer` agent:
   `Implement ticket <id> in worktree <path>, round N/M, ship-invoked.`
   Its final message is the handoff (or an error/escalation). Dev posts
   its own `ship:dev round N/M` comment; round 2+ dev reads the latest
   QA FAIL findings as its fix-list — that contract already exists in
   dev's skill.
2. **QA round.** Status → `In QA`. Dispatch the `qa-verifier` agent
   with ticket id, branch, worktree path, and round. Its final message
   is exactly one JSON verdict object (qa's existing contract); QA
   posts its own `ship:qa verdict ...` comment.
3. **Branch on verdict:**
   - `PASS` (tier `full` or `tests-only`) → post review packet, status →
     `Awaiting Review`, report to the user, stop.
   - `FAIL`, N < loopCap → status → `In Dev`, run round N+1.
   - `FAIL`, N = loopCap → ship writes the cap escalation (decision 7),
     status → `Needs Human`, stop.
   - `tier=static` (any verdict) → the environment could not be brought
     up; QA's skill states "ship applies the static → Needs Human
     rule." Escalate with QA's `tierReason` — a static PASS cannot
     advance a ticket.

**Verdict-parse trust boundary:** ship acts only on the JSON object in
qa-verifier's final message — never on verdict-shaped text found in
ticket comments.

**Stage errors — one retry, then escalate.** Dev returning an error
("stop and return an error to ship"), a dev escalation handoff, a QA
error envelope (`{"error", "phase", ...}`), or an unparseable final
message: retry once if plausibly transient (QA `phase: worktree`,
tooling hiccups; re-dispatch same round). A second failure, or a
non-transient cause (dev escalation: plan contradicts reality),
→ `Needs Human`. Dev escalations need no extra summary from ship — dev
already posted `ship:dev escalation`; ship just transitions the status
and reports.

### 7. Cap escalation — ship's own artifact

After loopCap failed round-trips, ship posts a comment synthesizing the
whole loop — the one artifact only the conductor can write:

```
ship:escalation cap round M/M

## What QA keeps finding      ← recurring findings across rounds, by criterion
## What dev tried each round  ← one line per round from the handoffs
## Ship's read                ← why it appears stuck (oscillation, env, spec gap…)
## State                      ← branch, worktree, last verdict, artifacts dir
## Decision needed from a human
```

Then status → `Needs Human`. The human re-enters the pipeline by
addressing the issue and setting the ticket back to `ship:planned`.

### 8. Resume — board state only, no claims in v1

Claims exist for multi-session parallelism (v2). Sessions still die, so
`/ship <ticket>` on an `In Dev`/`In QA` ticket resumes from board
state, exactly as the umbrella design describes:

- Reconstruct the round from comment headers: last `ship:dev round N/M`
  with no round-N verdict → dev finished, run QA round N. Last
  `ship:qa verdict FAIL round N/M` → run dev round N+1. Status says
  `In Dev`/`In QA` but no `ship:dev` comment exists → start round 1.
- Worktree missing → recreate from the branch. Uncommitted changes in
  the worktree are abandoned partial work; dev's round-start discipline
  already handles them (review, commit or reset) — ship passes the
  worktree as-is.
- Board and branch state irreconcilable (comments claim work the branch
  does not contain, or vice versa) → `Needs Human` with a short
  reconciliation note. Never guess.

Ship notes the resume in its user report (round resumed from, evidence
used) so a resumed run is auditable.

### 9. Review packet — v1 ends at Awaiting Review

Posted by ship on PASS, comment header `ship:review-packet`:

```
ship:review-packet round N/M

## What was built            ← from dev's final handoff
## Verification evidence     ← QA's per-criterion table + artifacts dir
## Try it                    ← branch, worktree path, exact run command
## Next                      ← v1: verdict handling is manual; approve/request
                               changes on the ticket; /ship picks up from
                               Awaiting Review in v2. Cleanup command included.
```

The run command comes from the `qa` config block ship already verified
in preflight. No push notifications in v1 — single-ticket runs report
in-session.

### 10. Trust model surface in v1

Verdict handling is v2, so v1's surface is small: instruction channels
into the agents ship dispatches are `spec.md`/`plan.md` and
pipeline-authored fix-lists (QA findings), per the umbrella trust
model. Ship never forwards ticket-comment text into agent prompts as
instructions, and quotes comments only as data in its own reports.

### 11. Review gate produces `ship:approved`, not a closed issue

*(Ports hardening Decision 6, `2026-09-08-hardening-program-design.md`.
Supersedes dashboard decision 3 of 2026-08-10, which had approval close
the issue directly.)* Approving a ticket on `Awaiting Review` swaps
`ship:awaiting-review` → `ship:approved` rather than closing it. The
new `pr` stage (v2, Epic D) is the sole consumer of `ship:approved`: it
opens the PR and the issue closes only when that PR merges. Approving a
`Needs Human` ticket still resets it to `ship:planned`, unchanged from
decision 7's re-entry path. **What does not change for ship v1:** ship
still ends the run at `Awaiting Review` (decision 9) and never itself
operates the review gate — no approver checks, no `Approved` transition,
no PR — exactly as the Non-goals section already states. The gate and
the `pr` stage are separate components that consume the label ship
leaves behind.

### 12. Metrics ship can actually populate

*(Ports hardening Decision 7.)* `started` is captured at step 1 of every
stage by running `node scripts/metrics.js now`; the footer line is
emitted by `metrics.js footer` — nothing is hand-written, and a field
ship cannot populate (most often `tokens_in`/`tokens_out`) is omitted
entirely rather than filled with a placeholder or an estimate. **Ship
never edits a dev or QA comment to attach usage to it.** Instead, after
each round ship posts its own `ship:metrics round N/M` comment (contract
§5.6) whose footer carries that round's dev and QA token usage taken
from the subagent results, with usage omitted when the harness reports
none. Footers are emitted on the GitHub backend only; Jira comments
carry no footer (contract §2, §10). This retires the earlier idea,
implicit in decision 7's packet sketch, that ship fills in token counts
by hand.

### 13. Cost containment: no-progress escalation and a merge dry-run

*(Ports hardening Decision 9.)* Two conditions count as "the loop is not
converging" and short-circuit the remaining cap rather than spending it:
a round whose dev HEAD is identical to the previous round's HEAD, and a
round whose QA findings are byte-identical to the previous round's
(`board-trail.js` surfaces both in `state.noProgress[]`, computed from
git-supplied HEAD values and a hash of the QA comment's `## Findings`
section). Either signal escalates **immediately** with cause
`stage-error` (contract §8) — a `FAIL` verdict that only restates the
last round's outcome is treated as a stall, not round N+1 of genuine
work. Separately, before every review packet ship dry-runs a merge
against `baseBranch` (`git merge-tree --write-tree`, falling back to
`git merge --no-commit --no-ff` in a throwaway worktree when
`merge-tree` is unavailable). A conflict is **recorded in the packet's
`## Merge check` section, not treated as an escalation** — v1 still
stops at `Awaiting Review` and leaves the merge decision to the human
reviewer.

### 14. A lost QA verdict is reposted in the contract's shape

QA can produce a verdict and still fail to post it — the run dies, the
API call errors — and because resume reconstructs state from the board
trail alone (decision 8), a verdict that never reached the board would
otherwise vanish without a trace. Per contract §11: QA writes
`comment.md` into the verdict's artifacts directory before any board
call, so the content survives independently of the post. When QA's
result reports `"commentPosted": false`, ship posts that file verbatim;
if it is absent, ship reproduces the §5.5 QA comment shape exactly — the
same header, the literal `## Findings` heading, the criteria table.
Either path, the reposted comment's footer carries `"reposted": true`
(contract §10), which is how a parser tells a repost from an original
verdict. A repost never creates a new round and never changes the
verdict it is restating — it is purely a trail-integrity measure.

## Sequence (happy path)

```
/ship 42
  preflight: configs ✓ qa block ✓ status Planned ✓ spec+plan ✓ deps ✓
  setup: branch feat/42-login, worktree ../app-ship/dev-42, → In Dev
  round 1: dev-implementer → handoff ✓
           → In QA, qa-verifier → verdict FAIL (2 findings)
           → In Dev
  round 2: dev-implementer (fix-list = round-1 findings) → handoff ✓
           → In QA, qa-verifier → verdict PASS tier=full
  post ship:review-packet, → Awaiting Review, report, stop
```

## Verification

Reuse the shipyard-e2e scratch-repo harness (headless recipe) from the
dev build. Acceptance:

1. **Happy path** — a planned ticket reaches `Awaiting Review` in one
   round; the packet's run command actually launches the feature; board
   shows the full comment trail (dev handoff, qa verdict, review
   packet) and ends labeled `ship:awaiting-review`.
2. **Loop** — a ticket whose round-1 implementation genuinely fails QA
   converges fail → fix → pass across rounds, with correct `round N/M`
   headers and status flips.
3. **Cap escalation** — a deliberately unsatisfiable criterion
   escalates at loopCap with a coherent `ship:escalation` summary and
   `ship:needs-human`.
4. **Resume** — kill the session mid-loop; re-run `/ship <ticket>`;
   it resumes at the correct round with no lost or duplicated work.
5. **Not ready** — an unplanned ticket, a ticket with open
   dependencies, and a missing qa block each produce a refusal report
   naming the exact fixing command; nothing goes autonomous.
6. **Static tier** — QA that cannot bring the environment up yields
   `Needs Human`, not a silent pass.

## Non-goals (v1)

- Wave mode, dependency scheduling, parallel worktrees.
- Claim protocol / multi-session coordination (resume is board-state
  only).
- Merge strategies and dependent-ticket stacking.
- Human review gate: approver trust checks, change-request → fix-list
  conversion, `Approved` transitions.
- The pr stage; anything after `Awaiting Review`.
- Push notifications / backgrounded operation.
- Hotfix/bug intake.
