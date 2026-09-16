# Forge plugin — end-to-end acceptance recipe

**Status:** Not yet run. This is the checklist for the follow-up session
that runs it, once the plan in
`docs/superpowers/plans/2026-09-15-forge-plugin.md` has landed on main.

**Target repo:** `Jaxsonman/shipyard-e2e` (the same scratch repo the dev
plugin's headless harness uses — memory: `dev-plugin-e2e-harness`). Forge
never reads or writes its board/tickets, so reusing it is safe: forge's
branches are `forge/*` (never `feat/*`), its state lives under `.forge/`
(never `.qa/` or `docs/ship/`), and its worktrees are
`../shipyard-e2e-forge/<slug>` (never `../shipyard-e2e-ship/dev-<id>`).

**Preflight prerequisites.** `running-forge/SKILL.md`'s Step 0 stops the
run — writing nothing under `.forge/` and creating no branch or worktree —
before either scenario's `/forge:forge` call does any real work, unless
both of these are already true. Check both up front, not just once at the
top of the session (a scenario 2 run started well after scenario 1 can
drift out of sync with origin in between):

```bash
gh auth status
git -C /Users/jaxsonmansouri/Desktop/Projects/shipyard-e2e fetch origin main
git -C /Users/jaxsonmansouri/Desktop/Projects/shipyard-e2e rev-list --count main..origin/main
```

`gh auth status` non-zero → fix auth before running anything; Step 0
check 5 stops the run and prints its stderr verbatim. A non-zero
`rev-list --count` output → local `main` is behind `origin/main` by that
many commits; fast-forward it first
(`git -C /Users/jaxsonmansouri/Desktop/Projects/shipyard-e2e pull --ff-only origin main`),
or Step 0 check 4 stops with "base branch main is behind origin by N
commit(s); pull first". Local `main` being *ahead* of `origin/main` is not
fatal — Step 0 records the ahead count as `state.baseAheadOfOrigin` and
`report.md`'s Outcome section notes the PR includes those commits.

## Recipe

Nested headless sessions are launched from the scratch clone with the
plugin loaded by path, following the exact pattern
`docs/superpowers/reviews/2026-09-09-hardening-acceptance.md` established
for `ship`/`dev`/`qa`/`pr`. The slash command must be namespaced when
loaded via `--plugin-dir`: `/forge:intent`, `/forge:forge`.

```bash
cd /Users/jaxsonmansouri/Desktop/Projects/shipyard-e2e

# Scenario 1: full pass to a ready PR.
claude -p "/forge:intent full-pass-smoke" \
  --plugin-dir <worktree>/plugins/forge \
  --permission-mode acceptEdits \
  --allowedTools "Read Write Edit Bash(git *) Bash(gh *) Bash(node *) Bash(npm *)" \
  --output-format stream-json --verbose > <scratchpad>/intent-full-pass.jsonl 2>&1

# Fill in .forge/full-pass-smoke/intent.md by hand with a small, genuinely
# achievable Done-means criterion (e.g. "the CLI prints the sum of two
# numbers passed as arguments"), matching the calc library's existing
# surface. Re-run /forge:intent to interview any remaining placeholder
# sections and approve.

claude -p "/forge:forge full-pass-smoke" \
  --plugin-dir <worktree>/plugins/forge \
  --permission-mode acceptEdits \
  --allowedTools "Agent Read Write Edit Bash(git *) Bash(gh *) Bash(node *) Bash(npm *) Bash(npx *) Bash(lsof *) Bash(kill *) Bash(curl *)" \
  --output-format stream-json --verbose > <scratchpad>/forge-full-pass.jsonl 2>&1

# Scenario 2: forced fail (an unsatisfiable Done-means criterion) to a
# draft-PR terminal.
claude -p "/forge:intent forced-fail-smoke" \
  --plugin-dir <worktree>/plugins/forge \
  --permission-mode acceptEdits \
  --allowedTools "Read Write Edit Bash(git *) Bash(gh *) Bash(node *) Bash(npm *)" \
  --output-format stream-json --verbose > <scratchpad>/intent-forced-fail.jsonl 2>&1

# Fill in .forge/forced-fail-smoke/intent.md with one Done-means
# criterion the calc library genuinely cannot satisfy without a
# dependency the intent's Constraints forbid (e.g. "the CLI parses
# natural-language number words like 'seven'" with a Constraints line
# "no new dependencies") so every dev round's best attempt keeps
# failing the same acceptance check for a real, non-contrived reason.
# Set .claude/forge.config.json's devQaCap to 2 first, to keep this
# scenario's real model spend small.

claude -p "/forge:forge forced-fail-smoke" \
  --plugin-dir <worktree>/plugins/forge \
  --permission-mode acceptEdits \
  --allowedTools "Agent Read Write Edit Bash(git *) Bash(gh *) Bash(node *) Bash(npm *) Bash(npx *) Bash(lsof *) Bash(kill *) Bash(curl *)" \
  --output-format stream-json --verbose > <scratchpad>/forge-forced-fail.jsonl 2>&1
```

macOS has no `timeout`; wrap each long-running call in the watchdog
pattern from the hardening-acceptance recipe:
`cmd & CPID=$!; ( sleep $WD; kill -TERM $CPID ) & WPID=$!; wait $CPID; kill $WPID`.
Size `$WD` around the dispatch budgets the skill now hands out
(`plugins/forge/skills/running-forge/SKILL.md` Steps 1–2: 60 minutes
wall-clock per `developer` dispatch, 20 minutes per QA verifier
dispatch) — these are advisory lines in the dispatch prompt, not an
enforced kill, so give real headroom above them: at least 200 minutes
for scenario 1's `/forge:forge` call (`devQaCap` default 3, one dev
round budget each plus QA/review overhead) and at least 150 minutes for
scenario 2's (`devQaCap` set to 2 above).

## Checklist

- [ ] **Scenario 1 — full pass.** `/forge full-pass-smoke` reaches
  `state.json` `terminal.kind: "ready"`; a non-draft PR exists on
  `shipyard-e2e` titled `full-pass-smoke: <Problem first line>`; the
  worktree `../shipyard-e2e-forge/full-pass-smoke` was removed; the
  in-chat report's Outcome section says "Passed".
- [ ] **Scenario 1 — evidence trail.** `.forge/full-pass-smoke/run/`
  (main-root) contains `state.json`, `report.md`, **and** every
  `round-*/` and `review-*/` directory — the Terminal (ready) step
  copies these out of the worktree before removing it, so no separate
  `git worktree add` is needed to inspect them. `round-1/dev-handoff.json`
  and `round-1/qa/report.json` contain real evidence paths, not fixture
  text.
- [ ] **Scenario 2 — forced fail.** `/forge forced-fail-smoke` runs
  `devQaCap` rounds, each genuinely attempting and failing the
  unsatisfiable criterion; `state.json` reaches `terminal.kind: "draft"`
  with `terminal.cause` of **either `"qa-cap"` or `"no-progress"`** —
  both are correct outcomes for a genuinely unsatisfiable criterion, and
  which one lands depends on whether the QA reports came back
  byte-identical (guard B fires and overrides the cap) or merely
  same-id (guard A escalates and the run rides to the cap); a **draft**
  PR exists on `shipyard-e2e`
  labeled `forge:not-passed`; the worktree
  `../shipyard-e2e-forge/forced-fail-smoke` was **kept**; the in-chat
  report's Outcome section leads with "Not passed" and inlines the
  recurring finding's evidence text, not just its path.
- [ ] **Scenario 2 — oscillation guard.** If the same finding id recurs
  across rounds (likely, given a genuinely unfixable criterion),
  `state.escalated` is `true` and the later round's `developer` dispatch
  used `models.developerEscalated` — check the session transcript for
  the model actually used, not just the config value.
- [ ] **No board coupling.** Neither run ever calls `gh issue`/`gh api`
  against any ticket, never reads `.claude/kanban.config.json` or
  `.claude/ship.config.json` (confirm neither exists in the scratch repo
  at all, or that forge never opens them if they do from prior
  dev/qa/ship acceptance runs), and never touches a label other than
  `forge:not-passed`.
- [ ] **Cleanup.** Remove `../shipyard-e2e-forge/forced-fail-smoke`
  manually once its draft PR has been inspected
  (`git worktree remove ../shipyard-e2e-forge/forced-fail-smoke`); close
  both PRs on `shipyard-e2e` once reviewed, since they are throwaway
  smoke artifacts, not real features. Then delete the branches both runs
  pushed, so a re-run of this recipe starts from a clean scratch repo
  instead of tripping Step 0's collision rule:

  ```bash
  git push origin --delete forge/full-pass-smoke forge/forced-fail-smoke
  git branch -D forge/full-pass-smoke forge/forced-fail-smoke
  ```

  Finally remove the main-root run directories both scenarios wrote —
  they are git-excluded, so nothing else will ever clean them up:

  ```bash
  rm -rf .forge/full-pass-smoke .forge/forced-fail-smoke
  ```

  (Delete the remote branches only after the PRs are closed; closing a
  PR whose head branch is already gone is fiddlier than the other
  order.)

## Outcome

_(Filled in by the session that runs this recipe — one paragraph per
checklist item, plus PR links and transcript paths, following the shape
of `docs/superpowers/reviews/2026-09-09-hardening-acceptance.md`.)_
