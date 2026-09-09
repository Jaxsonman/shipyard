# Dashboard Plugin

Visual pipeline dashboard — a local web UI for viewing pipeline tickets, stages, per-stage time and token statistics, and performing board actions across linked projects.

## Usage

After installing the dashboard plugin, run:

```
/dashboard
```

The dashboard server starts in the background and opens in your browser. The URL is `http://127.0.0.1:<port>`.

## Stages

The dashboard reads contract v1's label ladder (§4):

| Stage | Label |
|---|---|
| Backlog | *(no `ship:*` label)* |
| Spec'd | `ship:specced` |
| Planned | `ship:planned` |
| Dev | `ship:in-dev` |
| QA | `ship:in-qa` |
| Awaiting Review | `ship:awaiting-review` |
| Approved | `ship:approved` |
| PR Open | `ship:pr-open` |
| Needs Human | `ship:needs-human` |

A ticket carrying more than one `ship:*` label is flagged as a conflict in the
UI rather than guessed at. The PR link shown on a `PR Open` ticket comes from
the trusted `ship:pr opened <url>` comment (§5.9), never from a label.

## Requirements

- **GitHub only** — v1 is GitHub-board only. Jira support is planned.
- **`gh` CLI** — requires GitHub CLI authentication (`gh auth login`).

## Features

- View tickets across all configured pipeline stages
- Stage timeline and per-stage metrics (time, token usage)
- Board actions (writes only — the dashboard never launches a pipeline run):
  - Approve on `Awaiting Review` → swaps `ship:awaiting-review` for
    `ship:approved`, handing the ticket to `/pr`. It does **not** close the
    issue; the issue closes when the PR merges (contract v1 §4, program spec
    Decision 6).
  - Approve on `Needs Human` → resets to `ship:planned`, the documented human
    recovery.
  - Approve is disabled on every other stage, including `Approved` and
    `PR Open`.
  - Reassign → changes the assignee.

## Development

Run the test suite from the repo root:

```
node --test "plugins/dashboard/**/*.test.js"
```

The glob must be quoted so Node — not the shell — expands it. The bare-directory
form (`node --test plugins/dashboard/server/`) fails on Node 23 and newer, which
resolves a directory argument as a module specifier.

## Trust rule

Contract v1 §3: a board comment is acted on only when its author is the
invoking `gh` account (resolved once per server start with `gh api user`) or
appears in `approvers` in the linked project's `.claude/ship.config.json`.
Untrusted comments are reported, never acted on — they open no stage segment,
contribute no escalation or tokens, and cannot bump a ticket's last activity.
When the invoking account cannot be determined the server fails closed: every
author outside `approvers` is untrusted. `--mock` mode has no real authorship
and stays in the parser's legacy trust-everything path.

This applies to **both** views and to the drawer's per-ticket Gantt — a
forged verdict draws no bar anywhere, including the one screen a human
opens to inspect a single ticket.

## Shared contract code

`scripts/` and `references/contract.md` are **vendored copies** of `shared/scripts/`
and `docs/contract.md`, written by `scripts/sync-shared.sh` at the repo root.
Never hand-edit them: change `shared/`, add a test there, re-run the sync, and
`scripts/check-shared-sync.sh` will confirm the copies match.

## Architecture

`server/trail.js` is the single place comment bodies are parsed — metrics blocks, stage-handoff headers, escalation headers, and pipeline-log entries (`trail.parseLogEntries`, used for the ticket drawer's Logs tab) all go through it and come out as one normalized trail. Every other module (`metrics.js`, `timeline.js`, `stats.js`, and `server.js` itself) consumes `trail.js`'s exports instead of parsing comment bodies itself.

As of phase 2, `trail.js` owns no comment-header grammar of its own — it is a
thin adapter over the vendored `scripts/board-trail.js` (see "Shared contract
code" above), which recognises every `ship:*`/legacy-emoji header and the
`<!-- shipyard-metrics {...} -->` footer per the contract. `trail.js`'s job
is shaping `{ comments }` into board-trail's `issue` input and folding its
typed events back into the stage-segment/escalation shapes the rest of the
dashboard already depends on.

`parseTrail(comments, opts)` enforces the contract's trust rule (§3): an
event is trusted only when its author matches `opts.viewer` or appears in
`opts.allow`. This is a security boundary — an untrusted event (e.g. a
forged `ship:qa verdict` comment from someone who isn't the invoking `gh`
account or a listed approver) is dropped into the returned `untrusted[]`
array and never opens a segment, contributes to an escalation, contributes
tokens, or bumps `lastActivity`. Calling `parseTrail(comments)` with **no**
second argument at all is a legacy/no-trust-context mode that trusts every
event — this keeps every pre-Task-14 call site (`timeline.js`, `stats.js`,
`metrics.js`, `server.js`) and the mock fixtures (which carry no `author`
field) behaving exactly as they did before the trust rule existed. Passing
`viewer`/`allow` (wiring done in a later task) turns the real trust rule on.

- `web/timeline-scale.js` — pure time-scale math for the board-wide Timeline
  (zoom presets, domain resolution, pan clamping, gridline ticks, segment →
  pixel-rect projection). It touches no DOM, so it is unit-tested under
  `node --test` alongside the server modules.
- `web/pipeline-stats.js` — the pipeline-stats strip's math (percentile,
  `buildStats`, stage keys, the throughput window), in the same dual-mode
  shape as `timeline-scale.js` so the browser can recompute the strip over
  the currently visible row set without loading server code. `server/stats.js`
  is a one-line re-export of this file.
- `server/board.js` lists open issues with an explicit `gh issue list --limit
  1000` (gh's own default is 30, which silently truncated real boards), and
  its `gh` invocations carry a 20s timeout so a wedged `gh` process rejects
  instead of hanging the request indefinitely.
- `server.js`'s `gatherRows(projectId)` — the shared row-building step behind
  both `/api/timeline` and `/api/stats` — caches its result per project id
  for 3 seconds and de-dupes concurrent in-flight calls, so two back-to-back
  polls of both views cost one `gh` fan-out instead of two. Gridlines are placed on the
  **local** wall-clock grid with the UTC offset re-derived at every tick, so a
  window spanning a daylight-saving transition keeps day steps on local
  midnight instead of sliding an hour.
- `server/fixtures.js` — the `--mock` mode board. Covers every timeline code
  path: metrics-backed tickets (full Spec→Review bars), an estimated-only
  ticket (handoff headers, no metrics footers), a running Dev/QA ticket, a
  PR-stage ticket, a Backlog ticket, and one Needs Human ticket per
  escalation cause (`cap`, `static`, `stage-error`, `reconcile`).
- **Theming contract**: `web/styles.css` is the verbatim Modernist design
  system, generated from `docs/design/dashboard/styles.css` — it is never
  hand-edited; a `diff` between the two must always be empty. `web/app.css`
  is the dashboard's own stylesheet: it swaps the design system's token
  *values* for a dark theme (same token names, `prefers-color-scheme` plus an
  explicit `[data-theme="dark"]` override) and holds every app-specific
  component class (`.app-shell`, `.sidebar`, `.proj-row`, `.gantt-grid`,
  `.tabs`, `.dialog-field`, …). No inline `style="…"` attributes remain in
  `web/index.html` or `web/app.js` except CSS-custom-property carriers for
  genuinely dynamic geometry (e.g. `--bar-left`/`--bar-width` on `.gantt-bar`).

## API

- `GET /api/timeline?project=<id|all>` — board-wide timeline model. Resolves the
  project list the same way `GET /api/tickets` does, fetches full ticket detail
  (comments) per issue with bounded `gh` concurrency, and runs it through
  `timeline.buildBoardTimeline`. Returns `{ now, domain: {start, end}, groups,
  rows, warnings }`; a per-ticket detail failure degrades that ticket to a
  list-derived row instead of failing the whole response, and is reported in
  `warnings`.
- `GET /api/stats?project=<id|all>` — pipeline stats strip. Reuses the exact
  same `gatherRows`/`timeline.buildBoardTimeline` row set as `GET
  /api/timeline` so the two views can never disagree, then runs it through
  `stats.buildStats`. Returns `{ counts, stageDuration, tokens, throughput,
  escalations, warnings }` — per-stage ticket counts, median/p90 stage
  duration, token totals, review throughput, and escalation-cause tallies.

A timeline segment exists only when the trail has evidence its stage ran, so no
segment is ever "future". A segment after the ticket's current stage means the
ticket was rewound (QA sent it back, or a human re-planned it) and is rendered
as past.

## Stats strip

A row of five tiles sits above both views (Tickets and Timeline) and stays in
sync as the active project changes: **Stages** (a tag per non-zero pipeline
stage), **Median stage** and **p90 stage** duration, **Tokens** (in/out
totals), and **Throughput** (tickets reaching Awaiting Review per week over a
28-day window). Below the tiles, one chip per escalation cause with a
non-zero count (`cap`, `static`, `stage-error`, `reconcile`); clicking a chip
narrows both views to Needs Human tickets with that cause, and clicking it
again restores the unfiltered view. In the ticket table, a Needs Human
ticket's Stage cell also shows its cause as an outline tag.

## Views

**Tickets** — the paginated table, one row per ticket, grouped by the project
picked in the sidebar.

The **stats strip** sits above both views. It shows tickets per stage, median
and p90 stage duration, total tokens in/out and throughput (tickets reaching
Awaiting Review per week), plus a chip per escalation cause (`cap`, `static`,
`stage-error`, `reconcile`, and `unknown` for a malformed `ship:escalation`
header) that filters both views. The numbers track what is actually visible:
with no client-side filter applied they come straight from `GET /api/stats`,
and as soon as a stage chip, "hide backlog", a cause chip or the search box
narrows the set they are recomputed in the browser from the visible timeline
rows using `web/pipeline-stats.js` — the same module the server runs, so the
two can never disagree.

**Timeline** — a board-wide Gantt across every ticket. Rows are grouped by
project and sorted by last activity; the axis is real time with gridlines, a
"now" line and fit/day/week/month/all zoom presets. `fit` (the default,
falling back to `week` on an empty board) fits the *visible* rows' own
segment span — distinct from `all`, which always fits the whole board's
domain regardless of any active filter. Horizontal pan (wheel, drag or arrow
keys) applies to the day/week/month presets; `fit` and `all` always fit their
respective extent, so pan is inactive on both and the track shows no grab
cursor. One bar per stage the trail has evidence for: accent for the stage
the ticket is in now, a neutral ramp by recency for earlier stages, and a hatch
overlay for bars estimated from comment timestamps rather than metrics footers.
The active bar pulses. Hovering or focusing a bar shows stage, round, duration,
tokens in/out and whether it is estimated. Each row also carries a right-hand
label — the current stage and time-in-stage, `—` when the row has no current
segment (e.g. Backlog). Stage chips and a "hide backlog" toggle filter the
view; clicking or pressing Enter on a row opens the drawer.

## Accessibility

Sidebar project rows, ticket table rows and timeline rows are keyboard
operable: `Tab` reaches them, `Enter`/`Space` activate, and `ArrowUp`/`ArrowDown`
move focus between sibling rows (wrapping at the ends). The ticket drawer and
the add-project dialog are proper modal dialogs (`role="dialog"
aria-modal="true"`): opening one moves focus to its first interactive control
and remembers what was focused before, `Tab`/`Shift+Tab` cycle within the
panel without escaping it, `Escape` closes it from anywhere, and closing
restores focus to what was focused before it opened.

## Metrics

The dashboard reads per-ticket metrics instrumented by the stage plugins (dev, qa, ship). See [metrics specification](../../docs/superpowers/specs/2026-08-10-dashboard-design.md) for the convention (section "Stage metrics instrumentation").
