# Dev Plugin — /dev Design

**Date:** 2026-08-03
**Status:** Approved
**Parent:** `2026-07-22-feature-pipeline-architecture-design.md` (build order item 4)

## Purpose

The implementation stage of the feature pipeline. `/dev` takes a ticket
that carries an approved `spec.md` and `plan.md`, executes the plan
test-first in an isolated worktree, adversarially reviews its own work,
and hands a structured report to QA. Ship's dev ⇄ QA loop invokes it once
per round; round 1 executes the plan, round 2+ executes a fix-list.

Dev is sequenced fourth in the umbrella's build order: it consumes
planning's artifacts and targets qa's verdict/fix-list contract. The parts
of the QA design it depends on (fix-list shape, findings-not-solutions,
comment-only board writes) are locked in the umbrella and QA's locked
decisions, so QA's draft status does not block this design.

## Locked decisions

Each was chosen deliberately over stated alternatives.

### 1. Superpowers methodology — distilled, not depended on

Dev's skill internalizes the relevant superpowers methodology (test-driven
development, verification-before-completion, adversarial review) rewritten
for the autonomous pipeline context. Self-contained like every other
Shipyard plugin.

*Rejected:* declaring superpowers a required plugin and invoking its
skills (they assume a human in the room; a hard external dependency whose
updates silently change pipeline behavior); hybrid opportunistic use (two
behavior paths to test and document).

### 2. Execution model — orchestrator + per-task subagents

The dev agent stays small: it holds spec, plan, and progress, and
dispatches a fresh subagent per plan task with a self-contained brief.
Each task ends in a commit; the orchestrator verifies the result before
moving on. Survives big tickets without context exhaustion, and the
per-task commit trail is what makes ship's resume protocol work.

*Rejected:* single sequential agent (the umbrella calls dev the biggest
build; a long ticket risks mid-implementation context exhaustion with no
clean recovery); adaptive-by-plan-size (two code paths to specify, test,
and keep honest).

### 3. Testing discipline — test-first per task

Each plan task follows red → green: write the failing test, observe it
fail, implement, observe it pass, commit test and implementation
together. Genuinely untestable tasks (config, docs, asset moves) are
declared in the brief, skipped explicitly, and listed in the handoff
report — an untested change is acceptable, an invisibly untested change
is not.

*Rejected:* tests-with-implementation, order unenforced (loses the
observed-red step, which is the proof the test tests something);
plan-decides-per-ticket (pushes the decision upstream to every planning
session and makes dev's behavior unpredictable across tickets).

### 4. Preconditions — spec required always; plan optional standalone

Ship-invoked runs always have both artifacts (ship gates on `Planned`).
Standalone `/dev <ticket>` requires `spec.md` — it refuses and points at
`/spec` if missing — but may run without `plan.md`: dev drafts a
self-plan in the same shape as `/plan`'s output, commits it to the
branch, and stamps `self-planned` in the handoff report so QA and the
human reviewer know the how had no human eyes. What to build is never
guessed; the how may be, visibly.

*Rejected:* require both always (standalone dev useless on an unplanned
ticket); degrade-with-confirmation mini-plan approval (duplicates /plan's
job in worse conditions, creating a second, weaker planning path).

### 5. Self-review — adversarial reviewer every round

Before writing the handoff report, dev dispatches one reviewer subagent
prompted to refute the round's full diff against spec, plan, and
`practices.md`. Findings are fixed before QA ever runs. Grounding:
McConnell's inspection data puts independent review at ~55–60% defect
detection vs ~25–45% for testing alone, and QA structurally never reads
code for quality — without this pass, code quality has no checkpoint
anywhere in the pipeline.

*Rejected:* review only on round 1 (round-2 fixes made under "make QA
pass" pressure are exactly where hacks sneak in); no internal review
(simplest machinery, but self-certification contradicts the umbrella's
failure-honesty rule).

## Approach — A: one skill, phased, prompt-template briefs (approved)

A single `implementing-tickets` skill running **Intake → Execute →
Review → Handoff**. Per-task subagents and the adversarial reviewer are
dispatched with prompt templates carried in references — not separate
agent definitions. Mirrors the QA plugin's approved shape.

*Rejected:* typed worker agent definitions for executor/reviewer (three
agent files to keep in sync with the skill; deeper agent nesting than
anything else in the family — the reviewer's read-only nature is stated
in its brief instead); splitting per-task methodology into a second skill
subagents load (cleanest reuse if a future hotfix pipeline wants the task
discipline without the loop, but YAGNI today and doubles the doc
surface).

## Part 1 — Structure and intake

```
plugins/dev/
├── .claude-plugin/plugin.json
├── commands/dev.md                    # /dev [ticket] — thin trigger
├── agents/dev-implementer.md          # what /ship invokes
├── skills/implementing-tickets/SKILL.md   # Intake → Execute → Review → Handoff
└── references/
    ├── github.md                      # fetch ticket, post comment — comment-only
    ├── jira.md                        # same, via Jira
    ├── practices.md                   # the distilled top-10 (injected into every brief)
    └── briefs.md                      # prompt templates: task-executor, adversarial reviewer
```

**This plugin has an agent definition** for the same reasons QA does:
ship invokes it, and a full implementation transcript must stay in the
agent's context — only the structured handoff crosses back into ship's.

**Intake** resolves `(ticket, spec, plan?, worktree, round)`:

- **Ship-invoked:** ship passes the ticket and the worktree it already
  created. Both artifacts exist by construction. Round comes from the
  last structured `ship:*` comment — round 1 executes `plan.md`; round
  2+ executes the current fix-list instead.
- **Standalone:** `/dev 42` resolves the ticket, enforces decision 4's
  preconditions, and gets its own `git worktree` under a scratch path —
  never the user's checkout (QA's convention).
- **Board writes are comment-only by construction.** The reference files
  carry fetch-ticket and post-comment — deliberately not set-status — so
  the one-writer-to-board-state rule (QA decision 6) is enforced by what
  the plugin can physically do. Dev posts `ship:dev round N/M` handoff
  comments; only ship transitions tickets.
- **Resume honesty:** on entering a worktree with uncommitted changes
  (a dead session's partial task), dev follows the umbrella rule —
  review, then commit or reset before continuing. The per-task commit
  trail makes "last completed task" reconstructable from git log alone.

## Part 2 — The Execute phase

The orchestrator never edits code itself. Per task, in plan order:

1. **Brief.** Build a self-contained task brief from the template: the
   task's text from `plan.md`, the spec excerpts ("done means" criteria)
   it serves, file paths from the plan, one line on what each previous
   task built, and `practices.md`. Self-contained means the subagent
   needs zero conversation history.
2. **Dispatch** a task-executor subagent into the worktree. Its
   contract, in order: write the failing test(s) → run and observe red →
   implement minimally → observe green → run the full affected suite →
   commit test + implementation together, message referencing ticket and
   task number. It reports: what it did, red-then-green evidence, files
   touched, deviations from the plan, anything noticed but not touched.
3. **Verify, don't trust.** The orchestrator checks the report against
   reality — the commit exists, the tests named actually ran and pass —
   before marking the task done. A subagent's claim is not evidence.
4. **Blockers escalate, never improvise.** When a task can't be done as
   planned, the executor stops and reports. The orchestrator makes one
   bounded call: a *mechanical* mismatch (renamed file, moved function)
   → re-brief with the correction, note it under Deviations; a
   *substantively* wrong plan (the architecture doesn't fit reality) →
   `Needs Human` escalation with a written explanation. Dev never
   redesigns the plan mid-flight — that would put an autonomous agent in
   exactly the ambiguity-guessing position the pipeline exists to
   prevent.

**Round 2+ (fix-list rounds)** run the same loop with the task list
replaced by QA's findings (or ship-converted human change requests). Each
finding becomes a task brief — symptom, repro steps, criterion violated —
and the executor's first step is reproducing the finding as a failing
test where feasible, so the fix is pinned by the same red-then-green
evidence. Findings prescribe no solutions (QA's contract); the executor
owns the how. No drive-by changes outside the findings.

## Part 3 — Review and Handoff

**Review (per round, before any handoff).** The orchestrator dispatches
one adversarial reviewer subagent with the round's full diff, spec, plan,
and `practices.md`. Its brief is to refute, not summarize: find the input
that breaks it, the criterion not actually met, the swallowed error, the
abstraction the plan didn't ask for, the test that can't fail. It is told
to try things — run the suite, poke edge inputs — not just read. It
returns findings in the same shape QA uses (symptom / where / what's
violated), or explicitly "no findings."

- Findings loop back into Execute as fix tasks — one internal mini-round
  on the same machinery as a QA fix-list.
- **One internal review round, capped.** If the re-review still finds
  substantive problems, the implementation is fighting the plan —
  escalate rather than churn. Dev's internal loop must not become a
  second unbounded QA loop.

**Handoff.** The round ends with the handoff report, posted as a ticket
comment under the structured header:

```
ship:dev round N/M

## What changed and why        — per plan task: one line + commit sha
## How to run it               — exact commands (QA's bring-up consumes this)
## Criteria coverage           — each "done means" item → where implemented, how tested
## Deviations                  — plan corrections taken; self-planned flag if standalone
## Known limitations           — untestable tasks; reviewer findings accepted as-is
```

Standalone runs have no round — the header is `ship:dev standalone`
(QA's convention). Escalations follow the same write-authority rule as
everything else: dev posts the escalation comment and returns an
escalation result; ship (not dev) moves the ticket to `Needs Human`, and
a standalone run simply reports to the user.

Written for two readers at once: the QA agent (criteria map, run
instructions) and the human at the review gate (audit trail on the
ticket). The agent returns the same content as its structured result to
ship. Uncommitted work never survives a round boundary — the report
describes only what is in the branch.

## Part 4 — practices.md: the ten practices

Injected into every task brief and the reviewer prompt. Each is carried
in the file as a short imperative with a one-line rationale; sources live
in a footer. Ordered by evidence strength:

1. **Simplicity first (KISS, corrected).** Prefer the simplest design
   that fully satisfies the stated requirements — including required
   security and scale constraints — and nothing more. Complexity
   (dependencies + obscurity) is the enemy, not a trade-off.
   *(Ousterhout, A Philosophy of Software Design; Gabriel, "Worse is
   Better"; PEP 20)*
2. **YAGNI.** Implement exactly what the plan task specifies — no
   speculative config flags, abstraction layers, or generalized
   interfaces. Agents scope-creep by inference; this is the checkable
   constraint against it. *(Fowler, bliki "Yagni"; Jeffries/XP)*
3. **Tests as proof, not decoration.** Red-then-green observed output is
   the only evidence a change does what it claims. A test never seen
   failing proves nothing. *(Beck, TDD by Example; Google Testing Blog;
   DORA)*
4. **Small, verifiable increments.** One task, one commit, independently
   reviewable. DORA's AI-era finding: small batches are specifically
   what keeps AI-generated velocity from becoming instability. *(Google
   eng-practices "Small CLs"; Forsgren/Humble/Kim, Accelerate;
   dora.dev)*
5. **Independent verification before "done".** Inspections catch
   ~55–60% of defects vs ~25–45% for testing alone; no
   self-certification. *(McConnell, Code Complete; DORA 2019)*
6. **Fail fast, fail loud.** Never swallow an error to keep going.
   Loud failure at the point of fault is what makes an autonomous
   agent's mistakes cheap to catch. *(Shore, "Fail Fast," IEEE
   Software 2004; Fowler)*
7. **Read-optimized, convention-matching code.** Code is read far more
   than written; match the surrounding codebase's idioms, never import a
   preferred style. *(Software Engineering at Google ch. 3; PEP 20)*
8. **Secure by default.** Least privilege, validate at trust boundaries,
   fail closed. The explicit KISS carve-out: "simplest" never means
   skipping validation — it means the simplest solution that still
   validates and fails closed. *(OWASP secure design principles)*
9. **Small, single-purpose units.** One reason to change per unit — the
   enabler that makes small diffs, focused tests, and reviewable changes
   possible. Noted in the file as design doctrine, not measured
   evidence. *(Martin, SRP)*
10. **Duplication over the wrong abstraction.** Don't unify
    similar-looking code unless the plan calls for it or a third
    duplicate appears. Unwinding a bad abstraction costs later agents
    far more than duplication does. *(Hunt & Thomas, The Pragmatic
    Programmer; Metz, "The Wrong Abstraction")*

## Part 5 — Error handling

Each case has one designed answer, never a silent guess:

- **Pre-existing red suite.** Before task 1, dev runs the suite at the
  branch point and records the baseline. Later verification compares
  against it — dev is accountable for regressions, not inherited
  failures. The baseline goes in the handoff report (QA holds the
  mirror-image rule for verdicts).
- **Executor's claim fails verification** (no commit, tests don't
  actually pass): re-brief once with what was found; a second failure
  escalates — repeated claim/reality mismatch means something structural
  is wrong.
- **Plan substantively wrong** → `Needs Human` escalation comment: what
  the plan assumed, what reality is, what dev needs decided.
- **Comment post fails after work is committed:** the work is safe in
  the branch; the report is written to `docs/ship/<id>/` as a fallback
  file and the structured result to ship still carries it. A
  handoff-shaped artifact is never lost to a network hiccup.
- **Internal review cap hit** → escalate with both review rounds'
  findings attached.

## Verification

Acceptance tests for the plugin itself:

1. `/dev` on a planned ticket produces a branch where every plan task is
   one commit with test + implementation, suite green, handoff comment
   posted, ticket status untouched.
2. A plan referencing a deleted file → mechanical correction taken and
   listed under Deviations; a plan with substantively wrong architecture
   → `Needs Human`, no code written past the discovery point.
3. Standalone run without `spec.md` refuses and points at `/spec`;
   without `plan.md` self-plans, commits the self-plan, and the handoff
   report carries the `self-planned` flag.
4. A round-2 invocation with a QA fix-list produces fix commits each
   pinned by a reproducing test, and no drive-by changes outside the
   findings.
5. Killing the session mid-task and re-running resumes from the commit
   trail with no duplicated or lost work.
6. The reviewer catches a planted defect (e.g., a swallowed exception)
   before handoff — proven by the internal fix commit.

## Non-goals

- Running QA or the dev ⇄ QA loop — ship owns rounds and the cap; dev
  executes one round per invocation.
- Transitioning tickets between statuses (comment-only, decision
  enforced by construction).
- Opening PRs (the `pr` stage's job).
- Authoring or revising plans beyond mechanical corrections — except the
  flagged standalone self-plan path of decision 4.
- Performance or refactoring work the plan didn't ask for.
