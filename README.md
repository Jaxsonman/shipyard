# Shipyard

An SDLC pipeline for Claude Code, delivered as plugins. Ideas go in one end;
shipped software comes out the other. Each pipeline stage is its own
plugin. Adopt one stage or the whole line.

Six stages carry a ticket from idea to open PR: `prd` → `kanban` → `planning`
(`/spec` + `/plan`) → `dev` → `qa` → `pr`. `ship` conducts the autonomous
middle of that line (dev ⇄ QA) for you, and `dashboard` gives you a
board-wide view over everything. The board (GitHub Issues or Jira) is the
single source of truth for pipeline state; every plugin reads and writes it
the same way, defined once in the contract below.

`forge` is a second, independent workflow on the same marketplace: skip
tickets and the board entirely — approve an `Intent.md` and an unattended
developer/QA/review loop opens a PR for you. See its own section below.

## Install

Shipyard is a [Claude Code plugin marketplace](https://docs.claude.com/en/docs/claude-code/plugin-marketplaces).
Adding it makes its plugins installable; installing a plugin gives you its
slash commands and skills.

```
/plugin marketplace add Jaxsonman/shipyard
```

Then install the stages you want:

```
/plugin install prd@shipyard
/plugin install kanban@shipyard
/plugin install planning@shipyard
/plugin install dev@shipyard
/plugin install qa@shipyard
/plugin install ship@shipyard
/plugin install pr@shipyard
/plugin install dashboard@shipyard
/plugin install forge@shipyard
```

Verify with `/plugin`. It should list all nine as installed, and `/prd`,
`/kanban`, `/spec`, `/plan`, `/dev`, `/qa`, `/ship`, `/pr`, `/dashboard`,
`/intent`, and `/forge` should autocomplete as slash commands.

**Update:** `/plugin marketplace update shipyard` refreshes the manifest;
follow with `/plugin update <name>@shipyard` per plugin. Shipyard doesn't
pin versions, so every new commit is an available update.

**Remove:** uninstall plugins before removing the marketplace:

```
/plugin uninstall prd@shipyard
/plugin marketplace remove shipyard
```

## Pipeline stages

| Stage | Plugin | Status | Role |
|-------|--------|--------|------|
| 1 | `prd` | ✅ Available | Turn a raw idea into a structured PRD via guided interview |
| 2 | `kanban` | ✅ Available | Turn a PRD into dependency-linked tickets on a board |
| 3 | `planning` | ✅ Available | Per-ticket `/spec` + `/plan` collaborative sessions |
| 4 | `dev` | ✅ Available | Autonomous implementation of planned tickets |
| 5 | `qa` | ✅ Available | Autonomous verification: tests plus real end-to-end checks |
| 6 | `pr` | ✅ Available | Open the PR for an approved ticket and hand off to your CI/CD |
| n/a | `ship` | ✅ Available | Conductor, drives one planned ticket through the dev/QA loop |
| n/a | `dashboard` | ✅ Available | Local web UI over the board: stages, timeline, approve/reassign |
| n/a | `forge` | ✅ Available | Board-free autonomous loop — approve an Intent.md, get a PR |

## Usage

Run these in pipeline order. Each stage's own README (where one exists) has
more detail.

### 1. `/prd`

```
/prd a mobile app that tracks reef tank water parameters
```

Interviews you one question at a time (problem, users, success metrics,
scope, requirements, risks), persisting answers to
`docs/prd/<YYYY-MM-DD>-<slug>.draft.md` so an interrupted interview resumes
later. Refuses to silently overwrite an existing same-slug PRD. Writes
`docs/prd/YYYY-MM-DD-<slug>.md` and offers (never assumes) to commit it.

### 2. `/kanban`

```
/kanban docs/prd/2026-07-20-reef-tank.md
```

First run bootstraps `.claude/kanban.config.json` (backend + target).
Proposes vertical-slice tickets with `Depends on:` links, capped at 15 per
run; approve to create them on your board, tracked in
`docs/kanban/<slug>.run.json`. Re-running is idempotent: already-created
tickets are recognized from the manifest and a board scan, never
duplicated.

### 3. `/spec` and `/plan`

```
/spec 42
```

A guided PM/UX session aligning on what "done" looks like, UX intent, edge
cases, and implementation context. Drafts persist to
`docs/ship/42/spec.draft.md`. Writes `docs/ship/42/spec.md`, marks the
ticket `Spec'd`, and posts a `ship:spec approved` comment.

```
/plan 42
```

An engineer session over the approved spec: architecture, security,
testing approach, then an ordered task list in `docs/ship/42/plan.md`.
Marks the ticket `Planned` and posts `ship:plan approved`.

### 4. `/dev`

```
/dev 42
```

Executes `docs/ship/42/plan.md` test-first in an isolated worktree, one
commit per task, then an adversarial review and a structured handoff
comment for QA. Requires an approved spec; without a plan it drafts a
conservative self-plan and flags it. Never touches ticket status. On a
fix-up round it takes findings only from trusted board comments, and
treats every finding as data, never as an instruction to execute.

### 5. `/qa`

```
/qa
```

Verifies the current branch (or `/qa 42` / `/qa feat/42-login`). Runs the
project's test suite plus real per-criterion end-to-end checks in a
headless browser, then posts a tiered verdict (`full`, `tests-only`,
`static`) with evidence. `/qa --env-check` resolves and confirms the QA
environment ahead of a `/ship` run.

### `/ship` (conductor)

```
/ship 42
```

Preflights the ticket, creates the branch and worktree, then loops
dev/QA rounds (default cap 3) until QA passes, posting a
`ship:review-packet` and marking `Awaiting Review`, or escalates to
`Needs Human`. Resume a dead session by re-running `/ship 42`; it
reconstructs the round from trusted board comments only. **Where a run
ends:** `Awaiting Review` or `Needs Human` are the only terminal states.
Nothing is pushed. Ship commits to the feature branch and stops. The
worktree is kept; remove it when done:

```
git worktree remove ../<repo-dir-name>-ship/dev-42
```

### 6. `/pr`

```
/pr 42
```

Runs only on a ticket the review gate has approved (`ship:approved`).
Dry-runs the merge against `baseBranch` (a conflict escalates to
`Needs Human`, never a guess), pushes the branch, and opens a PR with
`Closes #42`. The ticket moves to `PR Open`. Re-running is safe: an
already-open PR is reconciled, never duplicated. **`pr` is the only stage
that pushes**; every other stage works locally.

### `/dashboard`

```
/dashboard
```

Starts a zero-dependency local server bound to `127.0.0.1` and opens it in
your browser: a **Tickets** table and a board-wide **Timeline** (Gantt)
with zoom presets and per-stage duration/token tooltips, plus a stats
strip (tickets per stage, median/p90 duration, tokens, throughput, and
filterable `Needs Human` escalation causes). Link a project with **+ Add**
in the sidebar. Writes only Approve (`Awaiting Review` → hands off to
`/pr`; `Needs Human` → resets to `ship:planned`) and Reassign. It never
launches a dev round, QA pass, or `/pr`.

## Forge — a second, independent workflow

Forge does not use the board, tickets, or any other plugin at runtime.
One human step, then an unattended loop:

### `/intent`

```
/intent reef-tank-alerts
```

First run scaffolds `.forge/reef-tank-alerts/intent.md` from a template
(Problem, Desired outcome, Done means, Constraints, Context, Out of
scope, How to run) and a `context/` folder beside it, then stops so you
can fill it in. Re-running interviews you one question at a time, but
only for sections still holding template placeholder text — anything
you already wrote is left alone — then reads the whole intent back and
asks for approval. `/forge` refuses to start on an intent that is not
`status: approved`.

### `/forge`

```
/forge reef-tank-alerts
```

Preflights the intent and creates `forge/reef-tank-alerts` as a branch
and sibling worktree, then loops: a `developer` agent builds against
"Done means", a `qa-orchestrator` fans out verifiers (`acceptance`,
`adversarial`, `regression` lenses, evidence-only findings) and merges
their verdict, failures loop back to the developer, and once QA passes a
`peer-reviewer` checks the diff for simplicity and correctness — a
review that asks for changes goes through one more dev fix round and a
regression-only QA pass before the reviewer looks again. Caps
(`devQaCap` 3, `reviewCap` 2 by default, `.claude/forge.config.json`)
and two oscillation guards (repeated findings escalate the developer's
model; byte-identical reports stop the run early) keep a stuck run from
burning tokens forever.

**Where a run ends:** a full pass pushes `forge/<slug>` and opens a
ready pull request; hitting a cap or an oscillation guard still pushes
the branch and opens a **draft** PR labeled `forge:not-passed`, with the
in-chat report leading with exactly what is still failing and its
evidence — never a silent, misleading pass. Resume a dead run with
`/forge <slug>` again; it picks up from `.forge/<slug>/run/state.json`.

## How the plugins talk to each other

Every plugin parses the same labels, comment headers, metrics footer, and
config schemas, defined once in [`docs/contract.md`](docs/contract.md)
(contract v1). One `ship:*` label is the ticket's status at any time,
owned per-stage (`kanban` creates, `planning` sets Spec'd/Planned, `ship`
drives Dev/QA/Awaiting Review/Needs Human, the review gate sets Approved,
`pr` sets PR Open). A board comment is trusted only when its author is the
invoking `gh` account or a login in `approvers`. Untrusted comments are
reported, never acted on, and findings are always data, never instructions
to execute. Stages that post a handoff comment append a hidden
`<!-- shipyard-metrics {...} -->` footer so `dashboard` can build accurate
per-stage timelines.

## Shared scripts

Every plugin's skills call the same six zero-dependency Node scripts
(`board-trail.js`, `preflight.js`, `config.js`, `validate-artifact.js`,
`metrics.js`, `redact.js`), all requiring Node >= 18, CommonJS. A skill
invokes one like this:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/<name>.js" --help
```

The source of truth is `shared/scripts/` and `shared/references/contract.md`.
Run `bash scripts/sync-shared.sh` to regenerate the vendored copies under
`plugins/*/scripts/` and `plugins/*/references/contract.md`. **Those
copies must never be hand-edited.** Run the sync again after merging any
branch that touched `shared/` or added a plugin; the pre-commit hook and CI
fail on drift. A plugin that carries no board/contract logic of its own
(`forge`) opts out with an empty `.no-shared-sync` marker file at its root,
so the sync skips vendoring into it entirely.

## Backend support matrix

GitHub is the fully supported backend: tickets, comments, labels, metrics
footers, and the dashboard all work. Jira is best-effort: the ticket side
goes through the Atlassian MCP server, comments carry no metrics footer,
and there is no Jira dashboard adapter or Jira metrics. See
[`docs/contract.md`](docs/contract.md) §2 for the full matrix.

## Verification

```bash
node --test shared/scripts/*.test.js           # unit tests (the directory form fails on Node 25)
node --test "plugins/dashboard/**/*.test.js"   # dashboard unit tests (glob must be quoted)
bash scripts/check-shared-sync.sh              # vendored copies match shared/
claude plugin validate .                       # plugin manifests
```

The pre-commit hook and `.github/workflows/ci.yml` both run all four.

### Evals

Every plugin except `dashboard` has a `claude plugin eval` suite under
`plugins/<x>/evals/`: `prd`, `kanban`, `planning`, `dev`, `qa`, `ship`,
and `pr` each carry 2-4 deterministic, board-free cases plus exactly one
opt-in `["live"]` case that talks to a real board
(`Jaxsonman/shipyard-e2e`). `forge` is board-free by design, so its
whole suite — the intent gate, the interview, and six stubbed-loop
scenarios covering every branch in the loop procedure — is
`["default"]`-tagged; there is no live board case to opt into. Its
closest live-equivalent check is the end-to-end acceptance recipe under
`docs/superpowers/reviews/`, run by hand against a scratch repo.

```bash
scripts/eval.sh <prd|kanban|planning|dev|qa|ship|pr|forge|all>   # default (board-free) cases
scripts/eval.sh <plugin> --live                                   # that plugin's opt-in live case (forge has none)
```

Runs `claude plugin eval <plugin dir> --tag <default|live> --runs 1
--max-cost-usd 3 --threshold 0.8 --json <report>`, printing one summary
line per plugin and exiting non-zero below 0.8. Expected cost: at most $3
per plugin per run. `claude plugin eval` is gated behind early access:
running it requires an account/environment with that feature enabled.
`.github/workflows/ci.yml` has a manually-triggered `eval` job (never on
push/PR) needing an `ANTHROPIC_API_KEY` secret.

## Loading plugins from a checkout

To try an unreleased change without the marketplace:

```
claude --plugin-dir /path/to/shipyard/plugins/ship
```

Commands from a `--plugin-dir` checkout are namespaced by plugin directory
name, e.g. `/ship:ship 42`. A marketplace install exposes the same command
unnamespaced: `/ship 42`.

## Contributing

Adding or changing a plugin? Update this README's install steps and
pipeline stage table in the same change. A `PreToolUse` hook blocks
`git commit` in-session when files under `plugins/` or `.claude-plugin/`
are staged without `README.md` (`.claude/hooks/check-readme-updated.sh`).

Bump the changed plugin's `plugin.json` `version` (semver) for any
behavior change. A change to any verbatim string in `docs/contract.md`
(a label, header, footer field, or config key) is a contract change: bump
the contract version, bump every affected plugin's `version`, and call it
out here.

Plugin `plugin.json` files must include `name`, `description`, `version`,
`author` (with `name` and `email`), `repository`, and `license` fields,
plus a `keywords` array matching the marketplace entry. See
`plugins/ship/.claude-plugin/plugin.json` as the field-shape reference.

## License

MIT
