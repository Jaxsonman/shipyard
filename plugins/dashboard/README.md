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

## Metrics

The dashboard reads per-ticket metrics instrumented by the stage plugins (dev, qa, ship). See [metrics specification](../../docs/superpowers/specs/2026-08-10-dashboard-design.md) for the convention (section "Stage metrics instrumentation").
