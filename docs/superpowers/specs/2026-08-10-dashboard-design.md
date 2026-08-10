# Shipyard Dashboard — Design Spec

**Date:** 2026-08-10
**Status:** Approved (user-approved design; user delegated spec/plan review)
**Design source:** `Dashboard and design system.zip` handoff (Claude-generated, "Modernist" design system) — HTML prototype is a visual/behavioral spec, not code to import.

## What & Why

A visual pipeline dashboard for Shipyard, delivered **as a marketplace plugin** (`plugins/dashboard`). A `/dashboard` command starts a local web server showing every ticket across linked project repos, its current pipeline stage, a per-stage Gantt timeline with time/token cost, and board-level actions (approve to next stage, reassign).

Coexistence with the marketplace is a non-issue by construction: the dashboard **is** a marketplace entry. Claude Code only reads `.claude-plugin/marketplace.json` and the listed plugin source dirs; the dashboard lives in its own plugin dir like every other stage.

## Decisions (user-approved)

1. **Delivery:** marketplace plugin, not a standalone app or hosted site.
2. **Stage metrics:** instrument the pipeline for real per-stage time/token data (not derived-only, not mocked).
3. **Actions:** board-only writes in v1, and only transitions that are legitimately human-owned (only ship transitions mid-pipeline labels): Approve on **Awaiting Review** = close the issue (accept); Approve on **Needs Human** = reset to `ship:planned` (re-enter pipeline, the documented human recovery); Approve disabled on all other stages. Reassign = change assignee. No launching pipeline runs. "Retry stage" from the mock is omitted from v1 UI.
4. **Stack:** zero-dependency Node (stdlib HTTP server) + vanilla JS frontend recreating the prototype; `styles.css` design system used verbatim. GitHub-only v1 (board adapter isolated so Jira can slot in later).

## Plugin structure

```
plugins/dashboard/
  .claude-plugin/plugin.json
  commands/dashboard.md      # /dashboard — starts the server, opens the browser
  server/server.js           # Node stdlib HTTP server (no npm deps)
  server/board.js            # gh CLI adapter — all board reads/writes
  server/metrics.js          # parses shipyard-metrics blocks from ticket comments
  web/                       # index.html, app.js, styles.css (Modernist, verbatim)
  README.md
```

Also: new entry in root `marketplace.json`; README stage table row (pre-commit hook `check-readme-updated.sh` enforces this).

`/dashboard` runs `node ${CLAUDE_PLUGIN_ROOT}/server/server.js`, binds to `127.0.0.1` on a default port (increment on conflict), and opens the browser.

## Data model & board mapping

- **Projects** — linked local repo folders, stored in a machine-level JSON config at `~/.claude/shipyard-dashboard.json` (projects span repos, so not per-repo config). Server derives `owner/repo` from the folder's git remote. Sidebar shows name + repo path + open-ticket count; "All projects" aggregates.
- **Tickets** — `gh issue list` per project: number, title, assignee, priority, updated time. **Stage** derives from the pipeline's actual labels (`plugins/ship/references/github.md`): `ship:specced` → Spec'd, `ship:planned` → Planned, `ship:in-dev` → Dev, `ship:in-qa` → QA, `ship:awaiting-review` → Awaiting Review, `ship:needs-human` → Needs Human, no `ship:*` label → Backlog; >1 `ship:*` label = conflict, flagged in UI. **Priority**: no pipeline convention exists — read an optional `priority:*` label if present, else show "—" (no new convention invented).
- **Drawer tabs** — Overview = issue body. Spec / Plan = the repo files `docs/ship/<ticket>/spec.md` / `plan.md` read from the linked local folder (placeholder if absent). Logs = stage handoff comments (`ship:dev` / `ship:qa` / `ship:review-packet` / `ship:escalation` headers) rendered as a monospace log trail.
- **"Running" dot** — shown when the board says the ticket is actively in Dev/QA (in-progress stage label with a recent handoff comment). No process introspection.

## Stage metrics instrumentation

Each stage that posts a handoff comment (spec, plan, dev, qa, ship) appends one hidden HTML comment:

```html
<!-- shipyard-metrics {"stage":"dev","started":"2026-08-10T14:02:11Z","finished":"2026-08-10T15:42:33Z","tokens_in":420000,"tokens_out":38000} -->
```

- Invisible on the board; machine-readable; board stays the single source of truth (same trail-reconstruction pattern ship uses).
- `stage`, `started`, `finished` required — enough for Gantt bars and durations.
- `tokens_in`/`tokens_out` best-effort: a small shared helper script sums usage from the current session transcript (`~/.claude/projects/...jsonl`, same source the session-report skill parses); stages omit the fields when unavailable.
- Old tickets without metrics blocks: Gantt falls back to handoff-comment timestamps for rough bars; stat labels empty.
- Scope: one-paragraph convention + helper invocation added to each stage plugin's skill docs (spec, plan, dev, qa, ship).

## Server API

Read:
- `GET /api/projects`
- `GET /api/tickets?project=<id|all>`
- `GET /api/tickets/:project/:number` — detail: body, spec/plan text, logs, parsed metrics

Write (board-only):
- `POST /api/projects` — link a folder `{path, name}`; validates git remote
- `POST /api/tickets/:project/:number/approve` — advance stage label to next stage
- `POST /api/tickets/:project/:number/assign` — set assignee

All board I/O shells out to `gh` (inherits user's existing auth; server never handles credentials). Server binds localhost only.

## Frontend

Faithful recreation of the prototype's three states — ticket table (default), ticket drawer (slide-over with Gantt + tabs), add-project dialog — in vanilla JS with plain DOM rendering functions replacing the prototype's `{{ }}`/`sc-for` templating. Pagination page size 5, Prev/Next clamped. Design tokens and component classes from `styles.css` untouched (Archivo, accent `#ec3013`, radius 0). Table polls the server every ~30s for live stage changes and the running dot.

Deviation from mock: the add-project folder picker uses `webkitdirectory` only to *name* the folder (browsers don't expose full paths); the user confirms/edits the actual path in a text field the server validates.

## Error handling

- `gh` missing/unauthenticated → server still starts; UI shows full-width banner with remedy (`gh auth login`).
- Linked folder with no GitHub remote → dialog-level error.
- Board API failure → per-request error as table-level empty-state message; never a crash.
- Port busy → increment and retry.

## Testing

- Unit (`node:test`, zero new dev deps): metrics parser; board adapter with `gh` stubbed.
- `--mock` server flag serves fixture data (prototype's mock tickets) for UI development/manual review without a real board.
- E2E: scripted pass against the shipyard-e2e scratch repo — link it, verify tickets render, approve one ticket, confirm label moved on the board.

## Out of scope (v1)

Jira adapter; "Retry stage"; launching pipeline runs from the dashboard; hosted deployment; auth beyond local gh; ticket creation/editing beyond approve+reassign.
