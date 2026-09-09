# Dashboard Plugin

Visual pipeline dashboard — a local web UI for viewing pipeline tickets, stages, per-stage time and token statistics, and performing board actions across linked projects.

## Usage

After installing the dashboard plugin, run:

```
/dashboard
```

The dashboard server starts in the background and opens in your browser. The URL is `http://127.0.0.1:<port>`.

## Requirements

- **GitHub only** — v1 is GitHub-board only. Jira support is planned.
- **`gh` CLI** — requires GitHub CLI authentication (`gh auth login`).

## Features

- View tickets across all configured pipeline stages
- Stage timeline and per-stage metrics (time, token usage)
- Board actions:
  - Approve (`Awaiting Review` → close; `Needs Human` → re-plan)
  - Reassign

## Development

Run the test suite from the repo root:

```
node --test "plugins/dashboard/**/*.test.js"
```

The glob must be quoted so Node — not the shell — expands it. The bare-directory
form (`node --test plugins/dashboard/server/`) fails on Node 23 and newer, which
resolves a directory argument as a module specifier.

## Architecture

`server/trail.js` is the single place comment bodies are parsed — metrics blocks, stage-handoff headers, and escalation headers all go through it and come out as one normalized trail. Every other module (`metrics.js`, and later `timeline.js`/`stats.js`) consumes `trail.parseTrail()` output instead of parsing comment bodies itself.

- `web/timeline-scale.js` — pure time-scale math for the board-wide Timeline
  (zoom presets, domain resolution, pan clamping, gridline ticks, segment →
  pixel-rect projection). It touches no DOM, so it is unit-tested under
  `node --test` alongside the server modules.
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

**Timeline** — a board-wide Gantt across every ticket. Rows are grouped by
project and sorted by last activity; the axis is real time with gridlines, a
"now" line, day/week/month/all zoom presets and horizontal pan (wheel, drag, or
arrow keys). One bar per stage the trail has evidence for: accent for the stage
the ticket is in now, a neutral ramp by recency for earlier stages, and a hatch
overlay for bars estimated from comment timestamps rather than metrics footers.
The active bar pulses. Hovering or focusing a bar shows stage, round, duration,
tokens in/out and whether it is estimated. Stage chips and a "hide backlog"
toggle filter the view; clicking or pressing Enter on a row opens the drawer.

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
