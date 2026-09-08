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

## API

- `GET /api/timeline?project=<id|all>` — board-wide timeline model. Resolves the
  project list the same way `GET /api/tickets` does, fetches full ticket detail
  (comments) per issue with bounded `gh` concurrency, and runs it through
  `timeline.buildBoardTimeline`. Returns `{ now, domain: {start, end}, groups,
  rows, warnings }`; a per-ticket detail failure degrades that ticket to a
  list-derived row instead of failing the whole response, and is reported in
  `warnings`.

## Metrics

The dashboard reads per-ticket metrics instrumented by the stage plugins (dev, qa, ship). See [metrics specification](../../docs/superpowers/specs/2026-08-10-dashboard-design.md) for the convention (section "Stage metrics instrumentation").
