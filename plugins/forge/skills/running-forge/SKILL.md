---
name: running-forge
description: The forge loop procedure — developer, QA, and peer review rounds from an approved intent to a pushed branch and an opened PR. Use when the user runs /forge, or wants to start or resume an unattended forge run for an intent.
---

# Running forge

One invocation of this skill drives ONE intent from an approved
`intent.md` to a terminal state: a **ready** PR (full pass) or a
**draft** PR (capped out, still reporting exactly what is failing). The
orchestrator — the session model following this skill — does no
reasoning beyond dispatch, read JSON, branch on it, print. It never
keeps state in its head: every branch decision below re-reads
`.forge/<slug>/run/state.json` or the latest round artifact, never a
value from earlier in this same conversation.

**Path convention.** `state.json` and `report.md` are always relative to
this checkout's root (main-root). Main-root is **never assumed to be the
orchestrator's cwd** — it is resolved fresh by the standard preamble (see
below) at the top of every fenced block that touches a main-root-relative
path, which then `cd`s there before anything else in that block. Every
other artifact named below — `dev-handoff.json`, QA artifacts,
`review.json` — is relative to the run's **worktree** root, `state.json`'s
own `worktree` field; whenever this skill reads one, it resolves it
against that path, e.g.
`<worktree>/.forge/<slug>/run/round-N/dev-handoff.json`.

**Model policy — read once, use on every dispatch.** Read
`.claude/forge.config.json` if it exists; for any field it omits (or if
the file is entirely absent), use these defaults:

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

Pass `model: <the resolved value>` explicitly on every single Agent
dispatch this skill makes (`developer`, `qa-orchestrator`, and — in the
nested-dispatch-unavailable fallback — `qa-verifier` directly). The Agent
tool's `model` parameter overrides whatever an agent's own frontmatter
says, so this config is the only place model tier is actually decided.

**Contracts:** `${CLAUDE_PLUGIN_ROOT}/references/contracts.md` — every
JSON shape this skill reads or writes is defined there once; this file
never restates a shape, only which file to read/write and when.

**Idempotency rule (used by every step below and by Resume).** Before
dispatching in Step 1, 2, or 4, check whether that round's artifact
already exists on disk (`round-N/dev-handoff.json` for Step 1,
`round-N/qa/report.json` for Step 2, `review-R/review.json` for Step 4).
If it does, skip the dispatch entirely and proceed straight to that
step's post-dispatch handling using the existing file. This is what
makes a dead session's resume safe — it never re-dispatches work that
already landed.

**Every fenced block is self-contained.** Each fenced code block below is
its own Bash tool call — shell state (variables, `cd`) does **not**
survive from one fenced block to the next, even within the same step.
Every block recomputes what it needs at its own top and never relies on
a variable a different block set. A fence computes only what it reads —
a block that never mentions `$WORKTREE` stops at `MAIN_ROOT` and `cd
"$MAIN_ROOT"` instead of deriving a path it will not use. The standard
preamble, used at the top of every block that needs `$MAIN_ROOT`,
`$REPO_DIR`, `$WORKTREE`, or a main-root-relative path:

```bash
MAIN_ROOT="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")"
REPO_DIR="$(basename "$MAIN_ROOT")"
WORKTREE="$(dirname "$MAIN_ROOT")/${REPO_DIR}-forge/<slug>"
cd "$MAIN_ROOT"
```

## Step 0: Preflight

`<slug>` comes from the command invocation. Check, in this exact order,
and stop with a plain message on the first failure. Preflight writes
nothing under `.forge/` and creates no branch or worktree before every
check passes; it may append the exclude rule and fetch the base branch,
both idempotent:

1. **Intent exists and is approved.**

   ```bash
   MAIN_ROOT="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")"
   cd "$MAIN_ROOT"
   test -f .forge/<slug>/intent.md; echo "intent=$?"
   awk 'NR>1 && /^---$/{exit} NR>1' .forge/<slug>/intent.md 2>/dev/null | grep -qx 'status: approved'; echo "approved=$?"
   ```

   `intent=1` → stop: "No intent found at .forge/<slug>/intent.md. Run
   `/intent <slug>` first." `intent=0`, `approved=1` → stop: "Intent for
   <slug> is still `draft`. Run `/intent <slug>` to finish and approve it
   before `/forge` will start." `intent=0`, `approved=0` → continue.

   (The `awk` filter scopes the `status:` match to the intent's YAML
   frontmatter: it skips line 1's opening `---` and exits at the closing
   `---`, so only frontmatter lines ever reach `grep`. A line reading
   `status: approved` in the intent's prose body — an example, a quoted
   checklist item — can therefore never approve a `draft` intent.)
2. **Working tree clean.**

   ```bash
   MAIN_ROOT="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")"
   cd "$MAIN_ROOT"
   EXCLUDE="$(git rev-parse --path-format=absolute --git-common-dir)/info/exclude"
   grep -qxF ".forge/" "$EXCLUDE" 2>/dev/null || echo ".forge/" >> "$EXCLUDE"
   git status --porcelain
   ```

   First ensures the exclude rule exists (idempotent, in case `/intent`
   never ran here), then runs `git status --porcelain` in the main
   checkout — non-empty output → stop: "Working tree is not clean.
   Commit or stash your changes before starting a forge run." (`.forge/`
   is exclude-listed per Global Constraints, so an uncommitted intent
   never trips this check.)
3. **`baseBranch` exists locally and on the remote.** Read `baseBranch`
   from the intent's frontmatter (set once at `/intent` scaffold time,
   from `.claude/forge.config.json`'s `baseBranch` or the default
   `main`). `git show-ref --verify --quiet refs/heads/<baseBranch>` and
   `git ls-remote --exit-code --heads origin <baseBranch>` — either
   failing → stop, naming which check failed and the branch name.
4. **`baseBranch` is not stale.**

   ```bash
   git fetch origin <baseBranch> || exit 1
   behind=$(git rev-list --count <baseBranch>..origin/<baseBranch>)
   ahead=$(git rev-list --count origin/<baseBranch>..<baseBranch>)
   echo "behind=$behind ahead=$ahead"
   ```

   This block's own exit non-zero (the `git fetch` failed) → stop:
   "cannot fetch origin/<baseBranch>". Otherwise read `behind`/`ahead`
   from the line it printed — this block's stdout, not a shell variable,
   since nothing set here survives into any later block. `behind > 0` →
   stop: "base branch <baseBranch> is behind origin by <behind>
   commit(s); pull first". `ahead > 0` → this never stops the run; carry
   the printed `ahead` value forward as a literal integer, substituted
   for `<ahead>` in the state-file write below (`state.baseAheadOfOrigin`)
   and in `report.md` section 1 (a warning line: "Base branch was
   <ahead> commit(s) ahead of origin when this run started; the PR
   includes them.").
5. **`gh auth status` succeeds.** Non-zero exit → stop, printing its
   stderr verbatim.
6. **No collision, unless resumable.** One fence does everything and
   prints what the branch below reads — nothing here is a decision made
   inside the fence, only facts printed for the orchestrator to branch
   on outside it:

   ```bash
   MAIN_ROOT="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")"
   REPO_DIR="$(basename "$MAIN_ROOT")"
   WORKTREE="$(dirname "$MAIN_ROOT")/${REPO_DIR}-forge/<slug>"
   cd "$MAIN_ROOT"
   git show-ref --verify --quiet "refs/heads/forge/<slug>"; echo "branch=$?"
   git worktree list --porcelain | grep -qxF "worktree $WORKTREE"; echo "worktree=$?"
   git worktree list --porcelain | grep -A4 -xF "worktree $WORKTREE" | grep -q '^prunable'; echo "prunable=$?"
   if [ -f ".forge/<slug>/run/state.json" ]; then
     echo "state=present"
     PHASE="$(grep -o '"phase": *"[a-z]*"' .forge/<slug>/run/state.json | sed 's/.*"\([a-z]*\)"$/\1/' | head -1)"
     KIND="$(grep -oE '"kind": *(null|"draft"|"ready")' .forge/<slug>/run/state.json | sed 's/.*: *//; s/"//g' | head -1)"
     echo "phase=${PHASE:-UNREADABLE}"
     echo "terminal=${KIND:-null}"
   else
     echo "state=absent"
   fi
   echo "WORKTREE=$WORKTREE"
   ```

   (This is the one place in this skill that reads a `state.json` field
   from inside a fence — it always uses this exact grep/sed extraction,
   never a different mechanism elsewhere and never an interpreter that
   may not be installed. `state.json` is only ever written by this
   skill's own heredoc and by the orchestrator following the shapes in
   `contracts.md`, so its formatting is known: `phase` is a lowercase
   string on its own line, and `kind` is the JSON literal `null` or the
   string `"draft"`/`"ready"`, whether the `terminal` object is written
   on one line or several. Each extraction ends in `head -1`, so even a
   file that somehow carried a second `"phase"` or `"kind"` match prints
   exactly one value line. `terminal=null` is printed both when `kind`
   is JSON `null` and when the field cannot be found at all; an empty
   `phase` extraction prints `phase=UNREADABLE`, which is its own rule
   below. `worktree=0` means `git worktree list` still has a
   registration for that path; `prunable=0` means that registration is
   stale — the directory under it is gone — and `git worktree prune`
   would drop it. The probe's `-A4` window spans the widest porcelain
   entry `git worktree list` emits — `worktree`, `HEAD`, `branch`,
   `locked`, `prunable` — so a worktree that is both locked and prunable
   is still seen as prunable.) Branch on the printed lines only, taking the rules
   below **top to bottom — the first matching rule wins**:
   1. `state=present` and `phase=UNREADABLE` → stop: "state.json at
      .forge/<slug>/run/state.json is unreadable; inspect it, then
      either repair it or remove `.forge/<slug>/run/` to start over."
   2. `state=present` and `phase=terminal` → stop: "Branch/worktree for
      <slug> already exists and the last run reached a terminal state.
      Remove `forge/<slug>` and `<state.json's worktree field — the
      absolute path recorded there>` manually before starting a new
      run." No automatic cleanup, ever.
   3. `state=present` and `worktree=1` → stop with Resume's own
      worktree-existence message: "state.json names a worktree that no
      longer exists: <state.json's worktree field>; remove
      .forge/<slug>/run/ to start over."
   4. `state=present`, `worktree=0`, and `prunable=0` → the
      registration survives but its directory does not, so the run is
      just as unresumable as in rule 3 → stop with that same
      "worktree no longer exists" message.
   5. `state=present` (so: a non-terminal, readable phase, with a
      worktree that is registered and not prunable) → this is a
      **resume**: skip straight to "Resume" below instead of creating
      anything.
   6. `state=absent` and (`branch=0` or `worktree=0`) → stop: "Branch or
      worktree `forge/<slug>` already exists but no run state was found
      at .forge/<slug>/run/state.json — remove `forge/<slug>` and/or the
      printed `WORKTREE` path manually before starting a new run."
   7. `state=absent`, `branch=1`, and `worktree=1` → no collision;
      continue to branch/worktree creation below.

**Create the branch and worktree** (only on a fresh, non-colliding
start), from the main checkout root. `state.worktree` is always an
**absolute** path — every dispatched agent is handed this value
verbatim as its working directory, and a relative `../...` path would
resolve differently depending on the orchestrator's own cwd at dispatch
time, which is not guaranteed stable across a resumed session:

```bash
MAIN_ROOT="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")"
REPO_DIR="$(basename "$MAIN_ROOT")"
WORKTREE="$(dirname "$MAIN_ROOT")/${REPO_DIR}-forge/<slug>"
cd "$MAIN_ROOT"
git branch forge/<slug> <baseBranch>
git worktree add "$WORKTREE" forge/<slug>
mkdir -p "$WORKTREE/.forge/<slug>"
cp .forge/<slug>/intent.md "$WORKTREE/.forge/<slug>/intent.md"
cp -r .forge/<slug>/context "$WORKTREE/.forge/<slug>/context"
[ -n "$WORKTREE" ] || exit 1
cd "$WORKTREE" || exit 1
git add -f .forge/<slug>/intent.md .forge/<slug>/context
git commit -m "chore(forge): commit intent for <slug>"
```

(`git add -f` is required: `.forge/` is exclude-listed, and an
explicitly-named excluded path needs `-f` to be tracked. The `[ -n
"$WORKTREE" ]` and `cd "$WORKTREE" || exit 1` guards before the commit
are deliberate belt-and-suspenders: `$WORKTREE` is freshly recomputed at
the top of this very block, so it should never be empty, but if it ever
were, a bare `cd ""` silently no-ops and stays in the main checkout —
these two lines turn that into a hard failure instead of a commit
landing on the user's actual branch.)

Still from the main checkout root, write the initial state file, with
`worktree` set to the freshly-recomputed `$WORKTREE`, and
`baseAheadOfOrigin` set to the literal integer check 4 printed above
(`0` if that check found none — the orchestrator substitutes this
literal number for `<ahead>` below before running the block, exactly
like every other `<placeholder>` in this skill):

```bash
MAIN_ROOT="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")"
REPO_DIR="$(basename "$MAIN_ROOT")"
WORKTREE="$(dirname "$MAIN_ROOT")/${REPO_DIR}-forge/<slug>"
cd "$MAIN_ROOT"
mkdir -p .forge/<slug>/run
cat > .forge/<slug>/run/state.json <<EOF
{
  "version": 1,
  "slug": "<slug>",
  "phase": "dev",
  "devRound": 0,
  "reviewRound": 0,
  "escalated": false,
  "pendingFix": null,
  "regressionPass": false,
  "reviewPending": false,
  "branch": "forge/<slug>",
  "worktree": "$WORKTREE",
  "baseAheadOfOrigin": <ahead>,
  "noProgress": [],
  "stageErrors": [],
  "terminal": {"kind": null, "cause": null, "pr": null}
}
EOF
```

(Note the heredoc above is unquoted — `<<EOF`, not `<<'EOF'` — precisely
so `$WORKTREE` expands into the file; `<ahead>` is not a shell
expansion at all, it is the literal integer from check 4's printed
output, substituted in by the orchestrator before this block runs. Every
other heredoc in this skill that writes literal `<slug>`/`<baseBranch>`
placeholders stays quoted.)

Continue to Step 1 with `devRound` about to become `1`.

## Step 1: Dev round N

Read `state.json`. `N = state.devRound + 1`. Model:
`models.developerEscalated` if `state.escalated` is `true`, else
`models.developer`.

This step, and its sibling entry point Step 5.1, are the only two places
`developer` gets dispatched. Both are entered with `state.phase ==
"dev"` — from Step 0 (round 1), Step 3's FAIL-below-cap branch (directly,
or via Step 5.3 reusing Step 3's rules), Step 5's CHANGES-below-cap
branch, or Resume — and which one runs is decided by `state.pendingFix`,
read fresh from `state.json`, **never** inferred from `N` or any round
counter:

- **`state.pendingFix == null`** → round 1: no fix-list, the literal
  line `"(none — round 1)"`.
- **`state.pendingFix == "qa"`** → **(this step, Step 1)** every finding
  in `<worktree>/.forge/<slug>/run/round-<N-1>/qa/report.json` — the QA
  report (full or regression-only; same shape either way) that set this
  pending fix; `N-1` is `state.devRound`'s current, not-yet-incremented
  value. Extract **only** `id`, `criterion`, `repro`, and the evidence
  paths from each finding — never the raw JSON, never any other field —
  into:

  ```
  Finding <id>
    Criterion: <criterion>
    Repro:     <repro, one line, semicolon-joined if multiple steps>
    Evidence:  <every evidence path or excerpt, comma-separated>
  ```
- **`state.pendingFix == "review"`** → **(Step 5.1 instead of this
  step)** every `blocking: true` finding in
  `review-<state.reviewRound>/review.json`, rendered with five fields
  instead of four:

  ```
  Finding <id>
    Criterion: <principle> — <summary>
    Repro:     <file>:<line>
    Evidence:  review-<state.reviewRound>/review.json (peer-reviewer, round <state.reviewRound>)
    Suggestion: <suggestion>
  ```

Apply the idempotency rule: if
`<worktree>/.forge/<slug>/run/round-N/dev-handoff.json` already exists,
skip dispatch and go straight to the "On a valid handoff" paragraph
below using that file. Otherwise dispatch the `developer` agent,
`model: <resolved above>`, with a prompt of exactly this form:

```
Implement intent `<slug>` in worktree `<worktree>`, round <N>/<devQaCap>, forge-invoked.

Intent: .forge/<slug>/intent.md
Budget: 60 minutes wall-clock.

Fix-list:
<the Finding blocks above, or the literal line "(none — round 1)">
```

Wait for its final message (must be exactly the `dev-handoff.json`
object). Malformed or missing JSON → **stage error** (see below) with
agent `developer`.

On a valid handoff: write `state.devRound = N`, `state.phase = "qa"`,
`state.pendingFix = null`, save `state.json`. Continue to Step 2.

## Step 2: QA round N

Read `state.json` for `N = state.devRound`. Model:
`models.qaOrchestrator`. Verifier count: `verifiers` from config
(default `3`), except the one regression-only dispatch from Step 5,
which always uses count `1` with lens `regression` explicitly, ignoring
the configured count.

Apply the idempotency rule: if
`<worktree>/.forge/<slug>/run/round-N/qa/report.json` already exists,
skip dispatch entirely and go straight to Step 3 using that file.
Otherwise dispatch the `qa-orchestrator` agent with `model:
<models.qaOrchestrator>` — the Agent tool's dispatch parameter; `mode`
is not one, it is carried in the prompt's own first line below — and a
prompt of exactly this form:

```
Verify intent `<slug>` in worktree `<worktree>`, round <N>, mode full, verifiers <verifierCount>, forge-invoked.

Intent: .forge/<slug>/intent.md
Dev handoff: .forge/<slug>/run/round-<N>/dev-handoff.json
```

(For the Step 5 regression-only dispatch, replace `verifiers
<verifierCount>` with the literal `verifiers 1, lens regression`.)

Read its final message:

- **Exactly the literal string `nested-dispatch-unavailable`** (this
  host does not let `qa-orchestrator` dispatch further agents itself —
  see `agents/qa-orchestrator.md`'s nested-dispatch detection) → run the
  three-dispatch fallback below instead of treating this as a stage
  error.
- **A `report.json` object** → continue to Step 3.
- **Exactly the literal string `verifier-artifacts-missing`** (no
  verifier produced a valid artifact this round — see
  `agents/qa-orchestrator.md`'s Merge step) → **stage error**, agent
  `qa-orchestrator`, with **no retry**: append
  `{"agent": "qa-orchestrator", "round": N, "detail": "verifier-artifacts-missing"}`
  to `state.stageErrors`, record
  `state.terminal = {"kind": "draft", "cause": "stage-error:qa-orchestrator", "pr": null}`,
  save `state.json`, and go straight to **Terminal** — retrying would
  re-run a whole QA round for no reason, unlike the generic retry below.
- **Anything else** (missing, malformed, or a JSON shape matching
  neither) → **stage error**, agent `qa-orchestrator` — this one follows
  the ordinary retry-once rule in "Stage errors" below.

**Nested-dispatch fallback (three dispatches, in order):**

1. Dispatch `qa-orchestrator` again with `model: models.qaOrchestrator`
   (the dispatch parameter) and a prompt whose first line names `mode
   bring-up` in place of `mode full`, otherwise the same
   intent/worktree/round fields. Wait for its final message,
   `{"url": ..., "logPath": ..., "pid": ..., "mode": ..., "error": ...}`.
   `error` non-null → bring-up itself failed; `qa-orchestrator` already
   wrote `round-N/qa/report.json` as the bring-up-failure artifact —
   skip straight to Step 3 using that file, no further dispatch needed
   this round.
2. `error` null → dispatch the verifiers yourself, in one message with
   one Agent call per lens, `model: models.qaVerifier`, using the
   `url`/`logPath` just returned. Use the lens named in this round's
   dispatch when the loop named one explicitly (the Step 5 regression
   pass names `lens regression`, so this is a single verifier, not the
   table below); otherwise use the same count-based lens-assignment
   table as `agents/qa-orchestrator.md`:

   ```
   Verify intent `<slug>` against lens `<lens>` — worktree `<worktree>`, round <N>, verifier <K>, forge-invoked.

   Intent: .forge/<slug>/intent.md
   Handoff: .forge/<slug>/run/round-<N>/dev-handoff.json
   App: <app URL, or "n/a (cli mode)">
   Log: <.forge/<slug>/run/round-<N>/qa/app.log, or "n/a (cli mode)">
   Budget: 20 minutes wall-clock.
   Criteria: <"all Done-means criteria", or this verifier's exclusive slice for a split acceptance dispatch>
   ```

3. Dispatch `qa-orchestrator` a third time with `model:
   models.qaOrchestrator` and a prompt whose first line names `mode
   merge-only`, naming every verifier JSON path you just produced plus
   the `pid`/`mode` step 1 returned (`qa-orchestrator` needs the `pid`
   to tear the app down — it did not start it). Wait for its final
   message (must be
   exactly the `report.json` object). Malformed or missing JSON at
   this or the `bring-up` dispatch → **stage error**, agent
   `qa-orchestrator`.

On a valid report (from either path): continue to Step 3.

## Step 3: Branch on QA

Read `<worktree>/.forge/<slug>/run/round-<N>/qa/report.json`
(`N = state.devRound`).

- **`verdict: "PASS"`:** `state.phase = "review"`, save, go to Step 4.
  (`state.reviewPending` is already `false` on every path that reaches
  here — Step 0 seeds it `false`, and Step 5 clears it in the same write
  that acts on a review verdict — so this write leaves it `false`, which
  is what makes a crash between here and Step 4's dispatch resume as
  "start review round `reviewRound + 1`" rather than as "re-read a
  verdict".)
- **`verdict: "FAIL"`:** run **both** oscillation guards first, on every
  FAIL regardless of whether `N` has reached `devQaCap` — a guard's job
  is to catch a stuck loop, which is exactly as true at the last round
  as at any earlier one — then branch on the cap:
  - **Oscillation guard A.** Compare the **set** of `findings[].id` in
    this report against `round-<N-1>/qa/report.json` (skip this check
    on `N == 1`, there is no prior round). Same set →
    `state.escalated = true`, save `state.json` (the next dev round that
    actually runs, if any, uses `models.developerEscalated`).
  - **Oscillation guard B.** Compare this report's merged `findings[]`
    array **exactly** — every field, including each finding's
    `evidence[]` paths, with no exclusions — against
    `round-<N-1>/qa/report.json`'s `findings[]` (skip on `N == 1`).
    Identical → append `{"round": N, "reason": "byte-identical-report"}`
    to `state.noProgress`, save `state.json`.
  - **Then branch:**
    - Guard B fired this round → record
      `state.terminal = {"kind": "draft", "cause": "no-progress", "pr": null}`
      (`state.phase` unchanged, still non-terminal — Terminal is what
      sets it), save `state.json`, go to **Terminal** — this overrides
      the ordinary cap outcome below, since a byte-identical report
      means more rounds would not help even if the cap has not been
      reached yet.
    - Guard B did not fire and `N >= devQaCap` → record
      `state.terminal = {"kind": "draft", "cause": "qa-cap", "pr": null}`,
      save `state.json`, go to **Terminal**.
    - Guard B did not fire and `N < devQaCap` → `state.phase = "dev"`,
      `state.pendingFix = "qa"`, `state.regressionPass = false` (a
      defensive reset — this branch is also reached via Step 5.3, and a
      regression FAIL must not leave a stale `true` behind for the next
      ordinary QA round to misread on Resume), save, go to Step 1 for
      round `N+1`.

## Step 4: Review round R

Read `state.json`. On entry, set `state.regressionPass = false` and
`state.reviewPending = false` in one save — both idempotent
(`regressionPass` is already `false` except right after a review-fix
regression pass just finished, and `reviewPending` is already `false` on
every path that reaches Step 4). The first is what makes a later
`"qa"`-phase Resume read as "ordinary", not "mid review-fix"; the second
guarantees the round about to be dispatched is never mistaken for a
round whose verdict is already on disk, whatever this run did before.
`R = state.reviewRound + 1`. Model: `models.peerReviewer`. Every
`round-*/dev-handoff.json` path produced so far this run (glob
`round-*/dev-handoff.json` under the worktree's `.forge/<slug>/run/`,
sorted by round number).

Apply the idempotency rule: if
`<worktree>/.forge/<slug>/run/review-R/review.json` already exists,
skip dispatch and go straight to the "On a valid review" paragraph
below, using that file — the skip never jumps over that write, since
`state.reviewRound = R` and `state.reviewPending = true` are exactly
what make the existing artifact findable on the next resume. Otherwise
dispatch the `peer-reviewer` agent, `model: models.peerReviewer`, with a
prompt of exactly this form:

```
Review intent `<slug>` in worktree `<worktree>` against base `<baseBranch>`, round <R>, forge-invoked.

Intent: .forge/<slug>/intent.md
Handoffs: <comma-separated list of every round-*/dev-handoff.json path>
```

Wait for its final message (must be exactly the `review.json` object).
Malformed or missing JSON → **stage error**, agent `peer-reviewer`.

On a valid review: `state.reviewRound = R`, `state.reviewPending =
true`, save — one write, both fields together. `reviewPending` is what
makes this verdict findable on a resume: `reviewRound` alone cannot
distinguish "review `R` has returned and Step 5 has not acted on it yet"
from "review `R-1`'s verdict was acted on and round `R` never got
dispatched", because during round `R`'s dispatch the saved
`reviewRound` is still `R-1` while `review-<R-1>/review.json` is sitting
on disk from the previous round. Step 5 clears the flag in its own first
write, so the pair is only ever `true` in the window between a verdict
landing and that verdict being acted on. Continue to Step 5.

## Step 5: Branch on review

Read `<worktree>/.forge/<slug>/run/review-<R>/review.json`.

- **`verdict: "CHANGES"` and `R < reviewCap`:** The very first action —
  before anything else, and with no decision left lingering in the
  orchestrator's head between reading `review.json` and saving —
  is this state write: `state.reviewPending = false` (this verdict is
  now acted on) and `state.devRound += 1` (this counts toward
  `devQaCap` — the same counter Step 1/3 use). If the incremented
  `state.devRound` is now **greater than** `devQaCap`, record
  `state.terminal = {"kind": "draft", "cause": "qa-cap", "pr": null}` in
  that same write, save `state.json`, and go straight to **Terminal** —
  a review fix round never gets a dev round for free outside the cap.
  Otherwise, in that same save, also set `state.phase = "dev"`,
  `state.pendingFix = "review"`. Either way `reviewPending` goes to
  `false` in the one write that acts on the verdict, so no crash can
  leave a verdict both acted on and still flagged pending. A crash right
  after this save resumes correctly (see the Resume table: `phase ==
  "dev"`, `pendingFix == "review"` → Step 5.1). Then:
  1. **Step 5.1: dispatch the fix round.** If `state.pendingFix` is
     already `"review"` (a resume, or the write just above), the
     increment and cap check already happened; skip them and use
     `state.devRound` as `N`, unchanged — never `+= 1` again here. Using
     the same idempotency check as Step 1 (skip dispatch if
     `round-<N>/dev-handoff.json` already exists), dispatch `developer`
     for round `N`, using Step 1's fix-list-and-dispatch logic verbatim
     (`state.pendingFix == "review"` here, so the fix-list is Step 1's
     `"review"` table entry — every `blocking: true` finding from
     `review-<R>/review.json`, five fields). Save the resulting handoff
     as `round-<N>/dev-handoff.json` exactly as Step 1 would. On a valid
     handoff, set `state.phase = "qa"`, `state.pendingFix = null`,
     `state.regressionPass = true`, save `state.json` in that one write
     (mirroring Step 1's own post-dispatch write, plus marking this
     `"qa"` phase as review-fix-sourced — the earliest point this phase
     transition can be observed, so no crash window between here and
     Step 5.2 can leave `phase == "qa"` with `regressionPass` still
     `false`), then continue to 2 below.
  2. **Step 5.2: one regression pass.** `state.regressionPass` is
     already `true` from Step 5.1's write above — this (not a separate
     write here) is what tells Resume to re-enter here rather than Step
     2 if the session dies before the regression report comes back.
     Using the same idempotency check as Step 2, dispatch
     `qa-orchestrator` exactly as Step 2 does, but with `verifiers 1,
     lens regression` (never the configured `verifiers` count) — this
     writes `round-<N>/qa/report.json` the same as any QA round would,
     from exactly one `regression`-lens verifier.
  3. **Step 5.3: branch on the regression report** using **Step 3's
     rules verbatim** (same oscillation guards, same cap check against
     `devQaCap`, same FAIL/PASS split, same `state.terminal` writes on a
     draft outcome, same `state.pendingFix`/`state.regressionPass` reset
     on the FAIL-below-cap branch) — a regression `FAIL` re-enters the
     ordinary dev↔QA loop at Step 1 for the next round (Step 3's
     FAIL/under-cap branch already sets `state.phase = "dev"`,
     `state.pendingFix = "qa"`, `state.regressionPass = false`); a
     regression `PASS` sets `state.phase = "review"`, saves, and returns
     here to Step 4 for another review round (Step 3's PASS branch
     already does this; Step 4's own entry resets `state.regressionPass`
     and `state.reviewPending` to `false` too, redundantly but
     harmlessly — `reviewPending` has been `false` since Step 5's own
     first write above, so this `"review"` phase resumes as "dispatch
     the next review round", never as "re-read the last verdict").
- **`verdict: "CHANGES"` and `R >= reviewCap`:** record
  `state.terminal = {"kind": "draft", "cause": "review-cap", "pr": null}`
  and `state.reviewPending = false` in one write, save `state.json`, go
  to **Terminal**.
- **`verdict: "APPROVE"`:** record
  `state.terminal = {"kind": "ready", "cause": null, "pr": null}` and
  `state.reviewPending = false` in one write, save `state.json`, go to
  **Terminal**.

## Stage errors

Whenever a dispatched agent (`developer`, `qa-orchestrator`,
`peer-reviewer`) returns a final message that is missing, not valid
JSON, or missing a required field for the artifact it should have
produced: **retry that exact same dispatch once**, unchanged. A second
failure is a stage error:

```json
{"agent": "<developer|qa-orchestrator|peer-reviewer>", "round": <N or R>, "detail": "<what was wrong with the final message>"}
```

append it to `state.stageErrors`, then record
`state.terminal = {"kind": "draft", "cause": "stage-error:<agent>", "pr": null}`,
save `state.json`, and go to **Terminal**. Never infer a verdict from
prose — a stage error is not a FAIL and not a CHANGES, it is its own
terminal cause.

## Writing `report.md`

Write `.forge/<slug>/run/report.md` (main-root, resolved via the
standard preamble like every other main-root-relative path in this
skill — never assumed to be the cwd; this is also the PR body file
passed to `gh pr create --body-file`), in exactly this section order:

1. **Outcome first.** "Passed" or "Not passed" in the first line, rounds
   used (`devRound`/`devQaCap`, `reviewRound`/`reviewCap`). If not
   passed: every still-open finding from the last QA report or review,
   with its evidence text inlined (fenced blocks for excerpts, prose
   outside the fence) — not just a path. If `state.baseAheadOfOrigin > 0`
   (set during Step 0's preflight), add the line: "Base branch was
   `<state.baseAheadOfOrigin>` commit(s) ahead of origin when this run
   started; the PR includes them."
2. **What was built.** The last `dev-handoff.json`'s `summary`, in
   prose.
3. **How it works.** `filesChanged[]` from every round, grouped by role
   (roughly: implementation / tests / other) if the grouping is obvious
   from the paths; the last handoff's `howToRun`.
4. **Verification.** One line per round: `dev <sha>`, `qa <verdict>`
   (and `review <verdict>` for review rounds); the path to
   `.forge/<slug>/run/` as the local evidence directory (machine-local —
   say so) — the **main-root** copy on a ready outcome (Terminal below
   copies everything there before removing the worktree), or the
   **worktree**'s copy at that same relative path on a draft outcome
   (the worktree is kept).
5. **Suggested follow-ups.** Every `review.json` finding with
   `blocking: false`, every verifier `observations[]` entry, every
   `dev-handoff.json` `deferred[]` entry — across every round, deduped.
6. **PR link, branch, worktree state.** The PR URL, `forge/<slug>`, and
   — draft only — the worktree removal command. Written as the literal
   line `PR: (pending)` the first time this section is produced (below),
   corrected afterward once `gh pr create` returns a URL, or to
   "PR creation failed: <error>" if it never does.

This section is written **twice** per Terminal call, never once: first
before any push or PR call (its section 6 cannot know the PR URL yet),
then again — only the PR line changes — once `gh pr create` returns. See
Terminal below for the exact order; this is what keeps `gh pr create
--body-file` from racing its own not-yet-known output.

## Terminal

Read `state.json`'s current phase/round counters one last time before
acting — this is the last state re-read of the run. `state.terminal.kind`
(`"ready"` or `"draft"`) and, on a draft, `state.terminal.cause` were
already recorded by whichever branch above sent the run here (Step 3,
Step 5, Step 2's `verifier-artifacts-missing` case, or Stage errors) —
Terminal reads them, it never re-decides which outcome this run had.
`$REPO` and `$TITLE` are **not** resolved once here — per "Every fenced
block is self-contained" above, each is computed fresh inside whichever
of the Ready/Draft `gh pr create` fences below actually runs. Filling in
`state.terminal.pr` (steps 5/4 below) is likewise mechanical, defined
once here: `<pr_url_or_null>` means substitute the URL that fence's
trailing `echo "$PR_URL"` printed, quoted as a JSON string; if that line
was empty, substitute the bare `null` instead.

**Ready** (`state.terminal.kind == "ready"`, set by Step 5's `APPROVE`
branch), in this exact order:

1. Write `.forge/<slug>/run/report.md` per "Writing report.md" above,
   section 6 as the literal line `PR: (pending)` — `gh pr create
   --body-file` needs a real file on disk before it can run, and the PR
   URL does not exist until after it returns.
2. Copy every agent-written artifact out of the worktree **before** it
   is removed — they live under the worktree and are git-excluded, so
   `git worktree remove` deletes them irrecoverably otherwise:
   ```bash
   MAIN_ROOT="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")"
   REPO_DIR="$(basename "$MAIN_ROOT")"
   WORKTREE="$(dirname "$MAIN_ROOT")/${REPO_DIR}-forge/<slug>"
   cd "$MAIN_ROOT"
   cp -R "$WORKTREE/.forge/<slug>/run/." .forge/<slug>/run/
   ```
   (`state.json`/`report.md` already live at main-root and are never
   present under the worktree's copy, so this merges round-*/review-*
   directories in without touching either.)
3. Push and open the PR — `$REPO` and `$TITLE` computed here, in this
   same fence, not carried in from anywhere else:
   ```bash
   MAIN_ROOT="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")"
   cd "$MAIN_ROOT"
   REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner)"
   PROBLEM_LINE="$(sed -n '/^## Problem$/,/^## /{/^## /d;/./p;}' .forge/<slug>/intent.md | head -1)"
   TITLE="<slug>: $PROBLEM_LINE"
   git -C <worktree> push -u origin forge/<slug>
   PR_URL="$(gh pr create --repo "$REPO" --base <baseBranch> --head forge/<slug> --title "$TITLE" --body-file .forge/<slug>/run/report.md)"
   echo "$PR_URL"
   ```
4. Rewrite report.md's PR line with the real URL — read from step 3's
   printed output and substituted below as the literal `<pr_url>`, the
   same way check 4's `<ahead>` works, never as a `$PR_URL` shell
   expansion (step 3's `$PR_URL` does not survive into this fence). The
   copy already sent to `gh pr create --body-file` keeps `PR: (pending)`
   (the PR body is never re-edited after opening); only the local,
   in-chat copy is corrected before printing:
   ```bash
   MAIN_ROOT="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")"
   cd "$MAIN_ROOT"
   sed -i.bak "s#^PR: (pending)#PR: <pr_url>#" .forge/<slug>/run/report.md && rm .forge/<slug>/run/report.md.bak
   ```
5. Record `state.terminal = {"kind": "ready", "cause": null, "pr":
   <pr_url_or_null>}`, `state.phase = "terminal"`, save.
6. Remove the worktree: `git worktree remove <worktree>`. If removal
   fails (exit non-zero, typically untracked files left behind by the
   app), do not retry with `--force`; print `worktree kept at
   <worktree>; remove with: git worktree remove --force <worktree>` and
   continue to the final message — step 2 already copied everything out
   of it, so nothing is lost by leaving it in place.

**Draft** (`state.terminal.kind == "draft"`; `state.terminal.cause`
names which of `no-progress`, `qa-cap`, `review-cap`, or
`stage-error:<agent>`), same write-then-correct order:

1. Write `.forge/<slug>/run/report.md`, section 6 as `PR: (pending)`.
2. `$REPO` and `$TITLE` computed here, in this same fence:
   ```bash
   MAIN_ROOT="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")"
   cd "$MAIN_ROOT"
   REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner)"
   PROBLEM_LINE="$(sed -n '/^## Problem$/,/^## /{/^## /d;/./p;}' .forge/<slug>/intent.md | head -1)"
   TITLE="<slug>: $PROBLEM_LINE"
   gh label create "forge:not-passed" --repo "$REPO" --color "B60205" --description "Forge run finished without a full pass — see the run report" --force
   git -C <worktree> push -u origin forge/<slug>
   PR_URL="$(gh pr create --repo "$REPO" --base <baseBranch> --head forge/<slug> --draft --title "$TITLE" --body-file .forge/<slug>/run/report.md)"
   gh pr edit "$PR_URL" --repo "$REPO" --add-label "forge:not-passed"
   echo "$PR_URL"
   ```
   The label-create and label-add steps are best-effort — a failure in
   either is reported in `report.md`'s outcome line but never blocks the
   PR itself (skip straight to `gh pr create` if label creation failed).
3. Rewrite report.md's PR line with the literal `<pr_url>` read from step
   2's printed output, the same way the ready path's step 4 does.
4. Record `state.terminal = {"kind": "draft", "cause": "<cause>", "pr":
   <pr_url_or_null>}`, `state.phase = "terminal"`, save. **Keep the worktree** — no copy
   step runs on this path, since nothing is removed — and print the
   removal command (`git worktree remove <worktree>`) in the report.

**Push or PR creation itself fails** (network, auth, permissions): print
the error verbatim in the report, correct report.md's PR line to
"PR creation failed: <error>" instead of a URL, set
`state.terminal.pr = null`, still set `phase = "terminal"` and the
`kind`/`cause` that were already decided, keep the worktree, and do not
retry. On the ready path specifically, this means step 6 (worktree
removal) never runs — a worktree is only ever removed once its PR has
actually been opened.

Print the corrected `report.md` in chat as the final message of this
run.

## Resume

Triggered from Step 0 when `state.phase` is not `"terminal"` on an
existing branch/worktree. Read `state.json`. First, **worktree still
exists**: `test -d "<state.worktree>"` — missing → stop: "state.json
names a worktree that no longer exists: <state.worktree>; remove
.forge/<slug>/run/ to start over." No automatic cleanup, ever.

Otherwise, check the rows below **top to bottom — the first matching row
wins** — then let the idempotency rule above skip any step whose
artifact already exists on disk:

| Condition | Re-enter at |
|---|---|
| `state.terminal.kind` already set (non-null), even though `phase` isn't `"terminal"` yet | **Terminal**, directly — a session can die between recording `state.terminal` and Terminal actually finishing; every one of its steps (report.md's write-then-correct, push, `gh pr create`, the state write) is safe to re-enter without re-litigating which outcome this run had. |
| `phase == "dev"`, `state.pendingFix == "review"` | Step 5.1, round `state.devRound` (Step 5 already incremented it before dispatching; the idempotency rule applies exactly as it does in Step 1) |
| `phase == "dev"` (`state.pendingFix` is `"qa"` or `null`) | Step 1, round `state.devRound + 1` |
| `phase == "qa"`, `state.regressionPass == true` | Step 5.2, round `state.devRound` (the review fix round's regression pass) |
| `phase == "qa"` (otherwise) | Step 2, round `state.devRound` (the dev round already completed; QA may or may not have) |
| `phase == "review"`, `state.reviewPending == true` | Step 5 with `review-<state.reviewRound>/review.json` — the flag means that exact artifact has returned and no Step 5 write has acted on it yet, so re-entering is idempotent either way: `APPROVE` records the terminal outcome, `CHANGES` re-runs Step 5's own atomic write, exactly as a live run would. Never keyed on the artifact merely existing: during review round `R`'s dispatch `state.reviewRound` still reads `R-1` and `review-<R-1>/review.json` is already on disk, so an existence test would re-act on the previous round's verdict and burn a dev round |
| `phase == "review"` (otherwise — `reviewPending` is `false` or absent) | Step 4, round `state.reviewRound + 1` |

No automatic cleanup of anything else — resume only ever adds the next
artifact forward from where `state.json` says the run stopped, or, when
the idempotency rule finds artifacts already sitting past that point,
proceeds straight through every already-satisfied step to the first one
still missing.

## Hard rules

- Every Agent dispatch in this skill carries an explicit `model:` value
  resolved from `.claude/forge.config.json` (or its defaults) — never an
  unset model, never a value remembered from earlier in the run instead
  of read fresh from config.
- The orchestrator never keeps state in its head: every branch above
  re-reads `state.json` or the round artifact it names, every time.
- Fix-list entries are always the extracted fields named above — four
  for a QA-sourced entry (id/criterion/repro/evidence), five for a
  review-sourced entry (the same four plus `suggestion`) — never a raw
  JSON blob, never raw finding prose, pasted into a dispatch prompt.
- Nothing under `.forge/<slug>/run/` ever enters the branch diff. Only
  `intent.md` and `context/` are committed, and only once, at Step 0.
- `report.md`'s screenshots stay local; only text evidence goes into the
  PR body.
