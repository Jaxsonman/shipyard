# Shipyard

An SDLC pipeline for Claude Code, delivered as plugins. Ideas go in one end;
shipped software comes out the other. Each pipeline stage is its own plugin —
adopt one stage or the whole line.

**Contract:** every plugin parses the same labels, comment headers, metrics
footer, and config schemas, defined once in [`docs/contract.md`](docs/contract.md)
(contract v1); `docs/contract.md` and `plugins/*/references/contract.md` are
generated from `shared/references/contract.md` by `scripts/sync-shared.sh` and
must not be hand-edited. Contract v1 additionally accepts a non-round escalation header,
`ship:escalation <cause> standalone`, for a stage that runs outside a ship
round (the `pr` stage), and it scopes the `comments-without-branch`
irreconcilable condition to round-bearing comments only, so a ticket whose
sole pipeline comment is a `standalone` one is still shippable; the contract
version is unchanged.

## Adding Shipyard to Claude Code

Shipyard is a [Claude Code plugin marketplace](https://docs.claude.com/en/docs/claude-code/plugin-marketplaces).
Adding it makes its plugins installable; installing a plugin is what actually
gives you its slash commands and skills.

1. **Add the marketplace** — inside any Claude Code session, run:

   ```
   /plugin marketplace add Jaxsonman/shipyard
   ```

   This registers the marketplace by cloning its manifest. It does not install
   anything yet.

2. **Browse what's available** (optional):

   ```
   /plugin marketplace list
   ```

   or open the interactive picker with `/plugin`.

3. **Install stage plugins:**

   ```
   /plugin install prd@shipyard
   /plugin install kanban@shipyard
   /plugin install planning@shipyard
   /plugin install dev@shipyard
   /plugin install qa@shipyard
   /plugin install ship@shipyard
   /plugin install pr@shipyard
   ```

   Repeat for any other stages you want (see the table below). Installing adds
   that plugin's slash commands and skills to your session.

4. **Verify they're installed** — `/plugin` should list `prd@shipyard`,
   `kanban@shipyard`, `planning@shipyard`, `dev@shipyard`, `qa@shipyard`,
   `ship@shipyard`, and `pr@shipyard` as installed, and `/prd`, `/kanban`,
   `/spec`, `/plan`, `/dev`, `/qa`, `/ship`, and `/pr` should autocomplete
   as slash commands.

### Keeping it up to date

```
/plugin marketplace update shipyard
```

### Running a stage from a checkout (development and CI)

To exercise a stage without installing it — from this repo's own working tree, or
headlessly in CI — load the plugin directory instead:

```bash
claude -p "/ship:ship 42" \
  --plugin-dir /path/to/shipyard/plugins/ship \
  --plugin-dir /path/to/shipyard/plugins/dev \
  --plugin-dir /path/to/shipyard/plugins/qa \
  --plugin-dir /path/to/shipyard/plugins/pr
```

**A command loaded this way is only reachable namespaced as `<plugin>:<command>`** —
`/ship:ship`, `/dev:dev`, `/qa:qa`, `/pr:pr`, `/planning:spec`, `/planning:plan`. A
bare `/ship` returns `Unknown command: /ship`. The unqualified forms in the usage
sections below assume the plugin was installed from the marketplace. Load every
plugin a stage dispatches to: `ship` dispatches the `dev` and `qa` agents, so all
three (plus `pr`) must be on the command line for a full run.

Refreshes the marketplace manifest from this repo, so newly shipped stages
become installable. It does not upgrade plugins you already have installed —
follow it with `/plugin update <name>@shipyard` to pick up a plugin's
latest version (Shipyard doesn't pin plugin versions, so every new commit
is an available update).

### Removing it

```
/plugin uninstall prd@shipyard
/plugin marketplace remove shipyard
```

Uninstall plugins before removing the marketplace they came from.

## Pipeline stages

| Stage | Plugin | Status | Role |
|-------|--------|--------|------|
| 1 | `prd` | ✅ Available | Turn a raw idea into a structured PRD via guided interview |
| 2 | `kanban` | ✅ Available | Turn a PRD into dependency-linked tickets on a board |
| 3 | `planning` | ✅ Available | Per-ticket `/spec` + `/plan` collaborative sessions |
| 4 | `dev` | ✅ Available | Autonomous implementation of planned tickets |
| 5 | `qa` | ✅ Available | Autonomous verification — tests plus real end-to-end checks |
| 6 | `pr` | ✅ Available | Open the PR for an approved ticket and hand off to your CI/CD |
| — | `ship` | ✅ Available | Conductor — drives one planned ticket through the dev ⇄ QA loop (v1) |
| — | `dashboard` | ✅ Available | Visual dashboard — local web UI over the board: stages, timelines, approve/reassign |

`planning`'s `/spec` and `/plan`, `dev`, `qa`, and `ship` each append a
hidden `<!-- shipyard-metrics {...} -->` footer to their primary handoff
comment (spec/plan approval, dev handoff, qa verdict, ship review packet)
so the `dashboard` plugin can build accurate per-stage timelines.

## Usage

After installing `prd`, run:

```
/prd a mobile app that tracks reef tank water parameters
```

Claude interviews you one question at a time (problem, users, success metrics,
scope, requirements, risks), persisting your answers after each one to
`docs/prd/<YYYY-MM-DD>-<slug>.draft.md` so an interrupted interview resumes
on the next `/prd` run, even across days or a reworded slug. It refuses to
silently overwrite an existing PRD for the same slug (any date) — asking to
revise, use a new slug, or abort — and writes the finished PRD to
`docs/prd/YYYY-MM-DD-<slug>.md`, then offers (never assumes) to commit it.

After installing `kanban`, run:

```
/kanban docs/prd/2026-07-20-reef-tank.md
```

The first run in a project bootstraps `.claude/kanban.config.json` (asking
once which board to use, GitHub or Jira, and where) and offers to commit it,
then Claude proposes a full breakdown of small, vertical-slice tickets —
each one a single outcome a human can verify end-to-end, with `Depends on:`
links where one slice genuinely requires another, capped at 15 slices per
run (the rest are offered as a deferred batch on a follow-up run). Approve
the list and Claude creates the tickets on your board in dependency order,
tracking progress in a run manifest at `docs/kanban/<slug>.run.json`.
Re-running `/kanban` on the same PRD is idempotent: already-created tickets
are recognized from the manifest and never duplicated, and only the
remaining pending/failed tickets are attempted. A client-side scan of the
board for each ticket's `Source PRD:` line runs alongside the manifest, so a
ticket created in the instant before an interrupted run could record it is
still recognized rather than duplicated. A re-run always re-asks for approval
of the remaining tickets before creating anything.

After installing `planning`, run these per ticket, in order:

```
/spec 42
```

A guided PM/UX session that aligns on what the ticket really means — what
"done" looks like, UX intent, edge cases, and the context an implementer
needs, persisting answers after each one to `docs/ship/42/spec.draft.md` so
an interrupted session resumes on the next `/spec` run. It writes
`docs/ship/42/spec.md` (validated against the required section headings
before it's committed), marks the ticket `Spec'd`, fixes the ticket body on
the board if the session reveals it was unclear, and posts a
contract-shaped `ship:spec approved` comment carrying a metrics footer on
GitHub (Jira comments carry none).

```
/plan 42
```

An engineer session over the approved spec: architecture options and
trade-offs discussed with you, security and testing approach, then an
ordered, executable task list in `docs/ship/42/plan.md`, validated against
its required sections before it's committed. The ticket is marked
`Planned` — ready for the autonomous stages (or hand execution) — and the
session posts a contract-shaped `ship:plan approved` comment with a
metrics footer on GitHub.

After installing `qa`, run:

```
/qa
```

Verifies the current branch — or target one directly with `/qa 42` (a
ticket) or `/qa feat/42-login` (a branch). Runs the project's test suite
plus real per-criterion end-to-end checks in a headless browser, then
posts a tiered verdict (`full`, `tests-only`, or `static`) with evidence
as a board comment, with the key evidence for each failing criterion
inlined — `.qa/` evidence paths exist only on the machine that ran QA.
`/qa --env-check` resolves and confirms the QA environment ahead of time:
it brings the app up, launches one headless page against the health URL,
and reports whether a browser is actually available, so a later `/ship`
run cannot discover that only at verification time. The first run
downloads a headless browser via `npx @playwright/mcp`.

After installing `dev`, implement a planned ticket:

```
/dev 42
```

Executes `docs/ship/42/plan.md` test-first in an isolated worktree — one
commit per task, each pinned by a failing-then-passing test — then an
adversarial review pass, then a structured handoff comment on the ticket
for QA and human reviewers. On a fix-up round it takes its fix-list only
from board comments authored by you or a login in `approvers`, and treats
every finding as data — a symptom and a repro, never an instruction to
execute. Requires an approved spec (`/spec 42`); if no
plan exists, dev drafts a conservative self-plan and flags it. A
standalone `/dev` works in a repo that has never run `/ship` — it falls
back to the default branch when there is no `.claude/ship.config.json`.
Dev never
changes ticket status and never touches your checkout's code — though its
first run in a project may write and commit `.claude/kanban.config.json`
(the family's config bootstrap, same as kanban and planning).

After installing `ship`, conduct a ticket:

```
/ship 42
```

Preflights the ticket (Planned status, spec + plan committed, deps
satisfied, QA environment configured), creates the branch and
worktree, then loops dev → QA rounds (default cap 3) until QA
passes — posting a `ship:review-packet` and marking the ticket
`Awaiting Review` — or escalates to `Needs Human` with a summary of
what kept failing. Resume a dead session by re-running `/ship 42`; it
reconstructs the round from the board trail, using only comments whose
author is you or a login in `approvers` — a verdict from anyone else is
reported, never acted on — and a comment from someone else can never stall
the pipeline either, however it is worded. v1 conducts one ticket at a
time; bare `/ship`
lists tickets ready to conduct. Configure the QA environment once
beforehand with `/qa --env-check` — ship refuses to run without it. When
the board trail cannot be reconciled — a verdict with no matching dev
handoff, comments with no branch, a loop cap changed mid-run — ship never
guesses: it escalates to `Needs Human` naming the cause and stops. It
does the same, rather than burning the rest of the cap, when a round
repeats the previous round's commit or QA reports byte-identical
findings.

**Where a ship run ends.** `Awaiting Review` (QA passed — a
`ship:review-packet` comment carries the evidence and a merge dry-run
against the base branch) or `Needs Human` (an escalation comment names
the cause). Those are the only two terminal states in v1. **Nothing is
pushed** — ship commits to the feature branch and stops; opening the PR
is yours. The worktree is kept after both outcomes so you can inspect it;
remove it when you are done:

```
git worktree remove ../<repo-dir-name>-ship/dev-42
```

After installing `pr`, open the PR for an approved ticket:

```
/pr 42
```

Runs only on a ticket the review gate has approved (`ship:approved`) —
anything else is a refusal naming the remedy. Dry-runs the merge against
`baseBranch` (a conflict escalates to `Needs Human`, never a guess),
pushes the branch, and opens a PR whose title is the ticket's and whose
body links the ticket, spec and plan, quotes the latest trusted QA verdict
and review packet, and carries `Closes #42`. The ticket moves to
`PR Open`; your CI/CD takes over and the issue closes when the PR merges.
Re-running `/pr 42` is safe — an already-open PR for the branch is
reconciled, never duplicated, and a ticket already at `PR Open` is
reconciled rather than refused. A merge-conflict escalation is recoverable:
the comment names the command that restores `ship:approved` once the
rebase is done, so the ticket does not have to go back through the loop. **`pr` is the only stage in the whole
pipeline that pushes**; every other stage works locally. Jira is
best-effort: the ticket side goes through the Atlassian MCP server, the PR
is still opened with `gh`, and Jira comments carry no metrics footer.

After installing `dashboard`, open the pipeline dashboard:

```
/dashboard
```

Starts a zero-dependency local server bound to `127.0.0.1` (it never listens
on a public interface) and opens it in your browser. Two views over every
linked project's board: a **Tickets** table and a board-wide **Timeline**
(Gantt) with a real time axis, per-stage bars, zoom presets and hover
tooltips carrying each stage's duration and token cost. A stats strip above
both shows tickets per stage, median and p90 stage duration, total tokens,
throughput, and a filterable tag for each `Needs Human` escalation cause.

Link a project with **+ Add** in the sidebar; the repo is derived from the
folder's git remote and stored in `~/.claude/shipyard-dashboard.json`.

The dashboard performs **board writes only, and never launches pipeline
runs** — it will not start a dev round, a QA pass, or a `/pr`. The only
writes it makes are:

- **Approve** on `Awaiting Review` — swaps `ship:awaiting-review` for
  `ship:approved`, handing the ticket to `/pr`. It does **not** close the
  issue; the issue closes when the PR merges.
- **Approve** on `Needs Human` — resets the ticket to `ship:planned`, the
  documented human recovery that lets it re-enter the loop.
- **Reassign** — changes the assignee.

Approve is disabled on every other stage, including `Approved` and
`PR Open`. Comments are read under contract v1's trust rule: anything not
authored by your own `gh` account or a login in the project's `approvers`
is displayed but never acted on.

## Shared scripts

Every plugin's skills call the same six scripts:

- `board-trail.js` — parse ticket comments into typed, trust-marked events and reconcile pipeline state, including the no-progress detector ship uses to stop a stuck loop early (also accepts the legacy `(reposted by ship)` header suffix on read, marking the event `reposted: true`; a null/non-object `--stdin` comment entry is a usage error, not a crash; `round-gap` detection is based on the presence of a dev handoff per round, not mere round-key existence; escalation and PR-opened selection pick the latest by `createdAt`, and a malformed header from an untrusted author is counted in both)
- `preflight.js` — stage-agnostic environment and repository checks, run before any interview; `--stage pr` also enforces the `ship:approved` gate (treating `ship:pr-open` as a reconcile, not a refusal), reports an existing open PR for the branch, treats a branch held by another worktree as informational, and makes a branch *behind* `origin/<branch>` fatal (CLI rejects a flag-shaped token as another flag's value, e.g. `--cwd --quiet`, mirroring config.js)
- `config.js` — bootstrap, validate and normalize `.claude/kanban.config.json` and `.claude/ship.config.json` (targets are validated after normalization: `owner/repo` for GitHub, an upper-case project key for Jira; board identity — `backend`/`target` — lives only in `kanban.config.json`, `ship.config.json` never requires them)
- `validate-artifact.js` — enforce the required sections of `spec.md` and `plan.md` (heading extraction skips fenced ``` / ~~~ code blocks so an example heading in a fence doesn't count)
- `metrics.js` — ISO-8601 timestamps and the metrics footer line (`--tokens-in`/`--tokens-out` must be non-negative integers; anything else is a usage error)
- `redact.js` — strip secrets from log excerpts before they reach a board comment

All six require Node >= 18, are CommonJS, and have zero dependencies. A skill
invokes one like this:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/<name>.js" --help
```

The source of truth is `shared/scripts/`. Run `bash scripts/sync-shared.sh` to
regenerate the vendored copies under `plugins/*/scripts/` — those copies must
never be hand-edited.
Run it again after merging any branch that touched `shared/` or added a plugin:
the pre-commit hook and CI fail on drift.

## Verification

```bash
node --test shared/scripts/*.test.js   # unit tests (the directory form fails on Node 25)
bash scripts/check-shared-sync.sh      # vendored copies match shared/
claude plugin validate .               # plugin manifests
```

The pre-commit hook and `.github/workflows/ci.yml` both run all three.

## Evals

Every plugin — `prd`, `kanban`, `planning`, `dev`, `qa`, `ship`, `pr` — has a
`claude plugin eval` suite under `plugins/<x>/evals/`: 2-4 cases, each a
`prompt.md` (frontmatter + prompt) plus `graders/*.md` (rubric files), with a
`case.yaml` and `setup.sh` scaffold script when the case needs fixtures (a
scratch git repo, `.claude/kanban.config.json`, a fake `gh` shim, a
`docs/ship/<id>/plan.md` fixture, and so on). Cases are deterministic and
board-free by default — refusals (missing config, wrong label state, missing
spec/plan), draft/resume behavior, `validate-artifact.js` rejecting a
malformed plan, and the trust rule (a forged, untrusted board comment must be
reported, never acted on).

Every case is tagged `["default"]` except **exactly one opt-in "live" case
per plugin**, tagged `["live"]` only — the one case per plugin allowed to
talk to a real board (`Jaxsonman/shipyard-e2e`). `claude plugin eval` does
not exclude a tagged case from a plain run on its own, so the tag filter is
load-bearing: `scripts/eval.sh` always passes `--tag default` unless you ask
for `--live`.

Run it with:

```bash
scripts/eval.sh <prd|kanban|planning|dev|qa|ship|pr|all>   # default (board-free) cases
scripts/eval.sh <plugin> --live                             # that plugin's opt-in live case
```

This runs `claude plugin eval <plugin dir> --tag <default|live> --runs 1
--max-cost-usd 3 --threshold 0.8 --json <report>`, prints one summary line
per plugin (`PASS`/`FAIL`/`PARTIAL` plus score and report path), and exits
non-zero if any plugin scores below 0.8. Expected cost: **at most $3 per
plugin per run** (the ceiling `scripts/eval.sh` enforces via
`--max-cost-usd`; the default suite is a handful of short, mocked, single-run
cases so actual spend is normally well under that). A live case additionally
needs `gh` authenticated against `Jaxsonman/shipyard-e2e` with write access —
run it deliberately, not as part of routine verification.

`claude plugin eval` is gated behind early access; running it requires an
account/environment with that feature enabled. `.github/workflows/ci.yml`
has a manually-triggered (`workflow_dispatch`) `eval` job — never on
push/PR — that requires an `ANTHROPIC_API_KEY` repository secret and takes
`plugin` and `live` inputs.

## Contributing

Adding or changing a plugin? Update this README's install steps and pipeline
stage table in the same change — a merged plugin that isn't reflected here is
effectively undiscoverable. A Claude Code `PreToolUse` hook blocks
`git commit` in-session when files under `plugins/` or `.claude-plugin/` are
staged without `README.md`; see `.claude/hooks/check-readme-updated.sh` (wired up in `.claude/settings.json`).

Plugin `plugin.json` files must include `name`, `description`, `version`, `author` (with `name` and `email`),
`repository`, and `license` fields, plus a `keywords` array matching the marketplace entry. See
`plugins/ship/.claude-plugin/plugin.json` as the field-shape reference for all plugins.

## License

MIT
