# Shipyard Dashboard Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `dashboard` marketplace plugin whose `/dashboard` command serves a local web UI showing tickets across linked project repos, per-stage Gantt timelines with time/token stats, and board-only actions.

**Architecture:** Zero-dependency Node stdlib HTTP server (`server/`) shelling out to `gh` for all board I/O, serving a vanilla-JS frontend (`web/`) that recreates the committed design prototype. Stage metrics come from hidden `shipyard-metrics` HTML comments that stage plugins append to their existing handoff comments; the board remains the single source of truth.

**Tech Stack:** Node ≥ 18 stdlib only (`node:http`, `node:fs`, `node:child_process`, `node:test`). No npm dependencies, no build step. `gh` CLI for GitHub. Design system: `docs/design/dashboard/styles.css` used verbatim.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-08-10-dashboard-design.md`. **Design prototype (visual/behavioral source of truth):** `docs/design/dashboard/Shipyard Dashboard.dc.html` + `docs/design/dashboard/README.md`. Read both before frontend work.
- **No npm dependencies anywhere.** No `package.json` with deps, no `node_modules`. Tests use `node:test` via `node --test`.
- **Server binds `127.0.0.1` only.** Default port `7433`; on `EADDRINUSE` increment up to `7453` then fail with a clear message.
- **Stage labels (verbatim, from `plugins/ship/references/github.md:36-44`):** `ship:specced` → Spec'd, `ship:planned` → Planned, `ship:in-dev` → Dev, `ship:in-qa` → QA, `ship:awaiting-review` → Awaiting Review, `ship:needs-human` → Needs Human, no `ship:*` label → Backlog. More than one `ship:*` label = conflict.
- **Only ship transitions mid-pipeline labels.** Dashboard writes exactly two transitions: Awaiting Review → close issue; Needs Human → set `ship:planned` (add `ship:planned`, remove `ship:needs-human`). All other stages: Approve disabled.
- **Handoff comment headers (first line, plain text):** `ship:dev round N/M`, `ship:dev standalone`, `ship:dev escalation`, `ship:qa verdict <V> round N/M tier=<t> verified k/n`, `ship:review-packet round N/M`, `ship:escalation <cause> round N/M`. Spec comment starts `📋 Spec approved`, plan comment starts `🗺️ Plan approved`.
- **Spec/plan artifacts are repo files:** `docs/ship/<ticket-number>/spec.md` and `plan.md` in each linked project repo.
- **Metrics block format (exact):** `<!-- shipyard-metrics {"stage":"dev","started":"<ISO8601>","finished":"<ISO8601>","tokens_in":420000,"tokens_out":38000} -->` — `stage`/`started`/`finished` required; `tokens_in`/`tokens_out` optional. Valid `stage` values: `spec`, `plan`, `dev`, `qa`, `ship`.
- **Commits:** conventional-commit style, end body with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- **Repo hook:** committing a change under `plugins/` without staging `README.md` fails (`.claude/hooks/check-readme-updated.sh`) — Task 1 stages the README table row with the scaffold commit.
- **Run all tests with:** `node --test "plugins/dashboard/**/*.test.js"` from repo root.

---

### Task 1: Plugin scaffold + marketplace registration

**Files:**
- Create: `plugins/dashboard/.claude-plugin/plugin.json`
- Create: `plugins/dashboard/commands/dashboard.md`
- Create: `plugins/dashboard/README.md`
- Create: `plugins/dashboard/web/styles.css` (copy of `docs/design/dashboard/styles.css`, unmodified)
- Modify: `.claude-plugin/marketplace.json` (add entry after `ship`)
- Modify: `README.md` (stage table: add dashboard row)

**Interfaces:**
- Produces: `/dashboard` command contract — runs `node ${CLAUDE_PLUGIN_ROOT}/server/server.js --open` in the background (Task 4 creates that file; command is written now, inert until then).

- [x] **Step 1: Write `plugin.json`**

```json
{
  "name": "dashboard",
  "description": "Visual pipeline dashboard — local web UI for tickets, stages, per-stage time/token stats, and board actions across linked projects.",
  "version": "0.1.0",
  "author": { "name": "Jaxson Mansouri" }
}
```

(Match the exact field shape of `plugins/ship/.claude-plugin/plugin.json` — read it first and mirror any additional required fields.)

- [x] **Step 2: Write `commands/dashboard.md`**

```markdown
---
description: Start the Shipyard dashboard — a local web UI for pipeline tickets across linked projects
---

Start the Shipyard dashboard server and give the user the URL.

1. Run in the background: `node ${CLAUDE_PLUGIN_ROOT}/server/server.js --open`
2. The server prints `Shipyard dashboard: http://127.0.0.1:<port>` on stdout when ready, and opens the user's browser (`--open`).
3. Report the URL to the user. If the server exits non-zero, show its stderr verbatim — common causes: Node < 18, all ports 7433–7453 busy.
4. Do not keep polling it; it runs until the user stops it.
```

- [x] **Step 3: Write `plugins/dashboard/README.md`** — short: what it is, `/dashboard`, GitHub-only v1, requires `gh` auth, board-only actions (approve on Awaiting Review/Needs Human only), metrics convention pointer to the spec.

- [x] **Step 4: Copy the design system** — `cp docs/design/dashboard/styles.css plugins/dashboard/web/styles.css` (byte-identical; do not edit).

- [x] **Step 5: Register in `marketplace.json`** — append after the `ship` entry:

```json
{
  "name": "dashboard",
  "source": "./plugins/dashboard",
  "description": "Visual pipeline dashboard — local web UI for tickets, stages, per-stage stats, and board actions.",
  "category": "productivity",
  "keywords": ["dashboard", "ui", "pipeline", "sdlc", "github"]
}
```

- [x] **Step 6: Add README stage table row** — in the `## Pipeline stages` table of root `README.md`, add below the `ship` row: `| — | `dashboard` | ✅ Available | Visual dashboard — local web UI over the board: stages, timelines, approve/reassign |`

- [x] **Step 7: Validate JSON** — Run: `node -e "JSON.parse(require('fs').readFileSync('.claude-plugin/marketplace.json')); JSON.parse(require('fs').readFileSync('plugins/dashboard/.claude-plugin/plugin.json')); console.log('ok')"` — Expected: `ok`.

- [x] **Step 8: Commit**

```bash
git add plugins/dashboard .claude-plugin/marketplace.json README.md
git commit -m "feat(dashboard): scaffold dashboard plugin and register in marketplace"
```

---

### Task 2: Metrics parser + timeline builder (`server/metrics.js`)

**Files:**
- Create: `plugins/dashboard/server/metrics.js`
- Test: `plugins/dashboard/server/metrics.test.js`

**Interfaces:**
- Consumes: comment objects shaped `{ body: string, createdAt: string }` (matches `gh issue view --json comments` output).
- Produces (exact exports):
  - `parseMetrics(comments) -> Array<{stage, started, finished, tokens_in?, tokens_out?}>` — all valid blocks, comment order; invalid JSON / missing required fields skipped silently.
  - `buildTimeline(comments, currentStage) -> Array<{stage, label, startPct, widthPct, stat, state}>` — one row per pipeline stage in order `["Spec","Plan","Dev","QA","Review"]`; `state` ∈ `"past"|"current"|"future"`; `stat` like `"1h 40m · 420K/38K"`, `"1h 40m"` (no tokens), or `""` (future/no data); `startPct`/`widthPct` numbers 0–100 scaled to the min-start→max-end window (single-stage window: `startPct 0, widthPct 100`). `currentStage` is a display stage name (`"Dev"` etc.).

**Timeline data sources, in priority order per stage:** (1) metrics blocks (stage keys `spec`,`plan`,`dev`,`qa`,`ship` map to rows Spec,Plan,Dev,QA,Review; multiple blocks for one stage: earliest `started`, latest `finished`, sum tokens); (2) fallback from comment header timestamps — a comment whose body starts with `📋 Spec approved` dates Spec, `🗺️ Plan approved` dates Plan, first line matching `/^ship:dev (round|standalone)/` dates Dev, `/^ship:qa verdict /` dates QA, `/^ship:review-packet /` dates Review; fallback rows get bar position from `createdAt` (zero-duration bars rendered at minimum 2% width) and empty `stat`. Rows with no data and stage order ≥ current stage: `state:"future"`, empty track.

**Token formatting:** `420000 -> "420K"`, `1500000 -> "1.5M"`, below 1000 verbatim. **Duration:** `"Xh Ym"`, `"Ym"` under an hour, `"<1m"` under a minute.

- [x] **Step 1: Write failing tests** — `plugins/dashboard/server/metrics.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { parseMetrics, buildTimeline } = require('./metrics.js');

const mk = (body, createdAt) => ({ body, createdAt });

test('parseMetrics extracts valid blocks and skips junk', () => {
  const comments = [
    mk('ship:dev round 1/3\n\nstuff\n<!-- shipyard-metrics {"stage":"dev","started":"2026-08-10T14:00:00Z","finished":"2026-08-10T15:40:00Z","tokens_in":420000,"tokens_out":38000} -->', '2026-08-10T15:40:00Z'),
    mk('<!-- shipyard-metrics {"stage":"qa","started":"bad json -->', '2026-08-10T16:00:00Z'),
    mk('<!-- shipyard-metrics {"started":"2026-08-10T16:00:00Z","finished":"2026-08-10T16:10:00Z"} -->', '2026-08-10T16:10:00Z'),
  ];
  const out = parseMetrics(comments);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].stage, 'dev');
  assert.strictEqual(out[0].tokens_in, 420000);
});

test('buildTimeline: metrics-backed dev row with stat, future QA row', () => {
  const comments = [
    mk('ship:dev round 1/3\n<!-- shipyard-metrics {"stage":"dev","started":"2026-08-10T14:00:00Z","finished":"2026-08-10T15:40:00Z","tokens_in":420000,"tokens_out":38000} -->', '2026-08-10T15:40:00Z'),
  ];
  const rows = buildTimeline(comments, 'Dev');
  assert.strictEqual(rows.length, 5);
  const dev = rows.find(r => r.stage === 'Dev');
  assert.strictEqual(dev.state, 'current');
  assert.strictEqual(dev.stat, '1h 40m · 420K/38K');
  assert.strictEqual(dev.startPct, 0);
  assert.strictEqual(dev.widthPct, 100);
  const qa = rows.find(r => r.stage === 'QA');
  assert.strictEqual(qa.state, 'future');
  assert.strictEqual(qa.stat, '');
});

test('buildTimeline: falls back to header timestamps without metrics', () => {
  const comments = [
    mk('📋 Spec approved — `docs/ship/42/spec.md`', '2026-08-09T10:00:00Z'),
    mk('🗺️ Plan approved — `docs/ship/42/plan.md`', '2026-08-09T12:00:00Z'),
  ];
  const rows = buildTimeline(comments, 'Planned');
  const spec = rows.find(r => r.stage === 'Spec');
  assert.strictEqual(spec.state, 'past');
  assert.strictEqual(spec.stat, '');
  assert.ok(spec.widthPct >= 2);
});
```

- [x] **Step 2: Run to verify failure** — Run: `node --test "plugins/dashboard/**/*.test.js"` — Expected: FAIL, cannot find module `./metrics.js`.

- [x] **Step 3: Implement `metrics.js`** — CommonJS, exports above. Extraction regex: `/<!--\s*shipyard-metrics\s+(\{[\s\S]*?\})\s*-->/g`; `JSON.parse` in try/catch; require `stage && started && finished`. Implement `formatTokens`, `formatDuration`, stage-key→row-label map `{spec:'Spec',plan:'Plan',dev:'Dev',qa:'QA',ship:'Review'}`, fallback header regexes exactly as in the Interfaces block. Current-stage mapping for `state`: row order index vs `["Spec'd","Planned","Dev","QA","Awaiting Review"]` position of `currentStage` (`"Spec'd"`→Spec current, `"Planned"`→Plan current, `"Dev"`→Dev, `"QA"`→QA, `"Awaiting Review"`/closed→Review; `"Backlog"`→all future; `"Needs Human"`→highest data-bearing row is current).

- [x] **Step 4: Run tests** — Run: `node --test "plugins/dashboard/**/*.test.js"` — Expected: PASS (3 tests).

- [x] **Step 5: Commit** — `git add plugins/dashboard/server README.md && git commit -m "feat(dashboard): metrics parser and Gantt timeline builder"` (README staged only if hook demands it; no content change expected — if the hook blocks, add `README.md` with `git add README.md`).

---

### Task 3: Board adapter (`server/board.js`)

**Files:**
- Create: `plugins/dashboard/server/board.js`
- Test: `plugins/dashboard/server/board.test.js`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces (exact exports):
  - `stageFromLabels(labels) -> {stage, conflict}` — `labels` is `[{name}]`; precedence `needs-human > awaiting-review > in-qa > in-dev > planned > specced`; `conflict: true` when >1 `ship:*` label.
  - `priorityFromLabels(labels) -> string|null` — first label matching `/^priority:\s*(.+)$/i`, captured value capitalized (`"priority: high"` → `"High"`); else `null`.
  - `createBoard(execFile) -> board` where `execFile(cmd, args) -> Promise<string>` (stdout). Board methods (all take `repo` as `"owner/name"`):
    - `listTickets(repo)` → runs `gh issue list --repo <repo> --state open --json number,title,labels,assignees,updatedAt,url` → returns parsed array.
    - `getTicket(repo, number)` → `gh issue view <number> --repo <repo> --json number,title,body,labels,state,url,comments,assignees` → parsed object.
    - `approve(repo, number, stage)` → stage `"Awaiting Review"`: `gh issue close <number> --repo <repo>`; stage `"Needs Human"`: `gh issue edit <number> --repo <repo> --add-label "ship:planned" --remove-label "ship:needs-human"`; any other stage: throws `Error('approve not available for stage <stage>')`.
    - `assign(repo, number, login)` → `gh issue edit <number> --repo <repo> --add-assignee <login>`.
  - `repoFromPath(path, execFile) -> Promise<string>` — runs `git -C <path> remote get-url origin`, parses `owner/name` from both `git@github.com:owner/name.git` and `https://github.com/owner/name(.git)` forms; throws on no remote / non-GitHub remote.

- [x] **Step 1: Write failing tests** — `board.test.js` with a fake `execFile` that records `[cmd, args]` calls and returns canned JSON:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { stageFromLabels, priorityFromLabels, createBoard, repoFromPath } = require('./board.js');

test('stageFromLabels maps ship labels with precedence and conflict flag', () => {
  assert.deepStrictEqual(stageFromLabels([{ name: 'ship:in-qa' }]), { stage: 'QA', conflict: false });
  assert.deepStrictEqual(stageFromLabels([]), { stage: 'Backlog', conflict: false });
  const r = stageFromLabels([{ name: 'ship:in-dev' }, { name: 'ship:planned' }]);
  assert.strictEqual(r.stage, 'Dev');
  assert.strictEqual(r.conflict, true);
});

test('priorityFromLabels reads optional priority label', () => {
  assert.strictEqual(priorityFromLabels([{ name: 'priority: high' }]), 'High');
  assert.strictEqual(priorityFromLabels([{ name: 'bug' }]), null);
});

test('approve: allowed transitions only', async () => {
  const calls = [];
  const fake = async (cmd, args) => { calls.push([cmd, ...args]); return '{}'; };
  const board = createBoard(fake);
  await board.approve('o/r', 42, 'Awaiting Review');
  assert.deepStrictEqual(calls[0], ['gh', 'issue', 'close', '42', '--repo', 'o/r']);
  await board.approve('o/r', 42, 'Needs Human');
  assert.ok(calls[1].includes('--add-label') && calls[1].includes('ship:planned'));
  await assert.rejects(() => board.approve('o/r', 42, 'Dev'), /approve not available/);
});

test('repoFromPath parses ssh and https remotes', async () => {
  assert.strictEqual(await repoFromPath('/x', async () => 'git@github.com:acme/app.git\n'), 'acme/app');
  assert.strictEqual(await repoFromPath('/x', async () => 'https://github.com/acme/app\n'), 'acme/app');
  await assert.rejects(() => repoFromPath('/x', async () => 'https://gitlab.com/a/b\n'), /GitHub/);
});
```

- [x] **Step 2: Run to verify failure** — `node --test "plugins/dashboard/**/*.test.js"` — Expected: FAIL on missing `board.js`.

- [x] **Step 3: Implement `board.js`** per the Interfaces block. Real `execFile` default: `node:child_process` `execFile` promisified, `{ maxBuffer: 10 * 1024 * 1024 }`.

- [x] **Step 4: Run tests** — `node --test "plugins/dashboard/**/*.test.js"` — Expected: PASS (Tasks 2+3 suites).

- [x] **Step 5: Commit** — `git commit -m "feat(dashboard): gh board adapter with stage mapping and guarded approve"` (add server files; include root README.md in staging if the hook requires).

---

### Task 4: HTTP server (`server/server.js`) with config, API, static, mock mode

**Files:**
- Create: `plugins/dashboard/server/server.js`
- Create: `plugins/dashboard/server/fixtures.js` (mock tickets — port the mock data arrays out of the prototype `docs/design/dashboard/Shipyard Dashboard.dc.html`, reshaped to this server's API types)
- Test: `plugins/dashboard/server/server.test.js`

**Interfaces:**
- Consumes: `metrics.js` (`parseMetrics`, `buildTimeline`), `board.js` (everything).
- Produces: `createApp(opts) -> node http.Server` where `opts = { configPath, execFile, mock }`; `main()` parses argv (`--port N`, `--open`, `--mock`, `--config <path>`). Config file JSON shape: `{ "projects": [{ "id": "<slug>", "name": "...", "path": "/abs/path", "repo": "owner/name" }] }`, default path `~/.claude/shipyard-dashboard.json`, created on first write.
- HTTP API (all JSON; errors as `{"error":"<message>"}` with 4xx/5xx, never a crash):
  - `GET /api/projects` → `{ projects: [{id,name,path,repo,openCount}] }` (`openCount` from `listTickets` length; on board failure `openCount: null` plus top-level `{ warning }`).
  - `POST /api/projects` body `{path, name}` → validates dir exists, `repoFromPath`, slugifies name for `id`, appends to config, returns `{ project }`; 400 with message on bad path/remote.
  - `GET /api/tickets?project=all|<id>` → `{ tickets: [{project, projectName, number, title, stage, conflict, running, assignee, priority, updatedAt, url}] }` — `running` = stage is `Dev` or `QA`; aggregate across projects for `all`, sorted `updatedAt` desc.
  - `GET /api/tickets/<projectId>/<number>` → `{ ticket: { ...list fields, body, spec, plan, logs, timeline } }` — `spec`/`plan` read from `<project.path>/docs/ship/<number>/spec.md|plan.md` (`null` when absent); `logs` = comments whose first line matches `/^ship:(dev|qa|review-packet|escalation)/`, as `[{header, body, createdAt}]`; `timeline` = `buildTimeline(comments, stage)`.
  - `POST /api/tickets/<projectId>/<number>/approve` → board.approve with the ticket's current stage → `{ ok: true }`; 409 with the thrown message when not allowed.
  - `POST /api/tickets/<projectId>/<number>/assign` body `{login}` → `{ ok: true }`.
  - `GET /api/health` → `{ ok, gh: true|false }` — `gh` false when `gh auth status` exits non-zero (frontend banner trigger).
  - Anything else under `/api/` → 404 JSON. Non-API paths: serve `web/` static files (`index.html` default, `.css`→`text/css`, `.js`→`text/javascript`; path-traversal blocked by resolving against `web/` and rejecting escapes).
- `--mock`: `createApp` swaps board+config for `fixtures.js` in-memory data (same shapes); actions mutate the in-memory store so the UI is fully exercisable offline.

- [x] **Step 1: Write failing tests** — `server.test.js` boots `createApp` with mock mode on an ephemeral port and uses `fetch`:

```js
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { createApp } = require('./server.js');

let server, base;
before(async () => {
  server = createApp({ mock: true });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

test('GET /api/projects returns mock projects with counts', async () => {
  const r = await fetch(`${base}/api/projects`);
  const j = await r.json();
  assert.ok(j.projects.length >= 2);
  assert.ok(typeof j.projects[0].openCount === 'number');
});

test('tickets list, detail, and guarded approve', async () => {
  const { tickets } = await (await fetch(`${base}/api/tickets?project=all`)).json();
  assert.ok(tickets.length >= 5);
  const t = tickets.find(x => x.stage === 'Awaiting Review');
  const detail = await (await fetch(`${base}/api/tickets/${t.project}/${t.number}`)).json();
  assert.strictEqual(detail.ticket.timeline.length, 5);
  const ok = await fetch(`${base}/api/tickets/${t.project}/${t.number}/approve`, { method: 'POST' });
  assert.strictEqual(ok.status, 200);
  const dev = tickets.find(x => x.stage === 'Dev');
  const blocked = await fetch(`${base}/api/tickets/${dev.project}/${dev.number}/approve`, { method: 'POST' });
  assert.strictEqual(blocked.status, 409);
});

test('static serving and traversal guard', async () => {
  assert.strictEqual((await fetch(`${base}/`)).status, 200);
  assert.strictEqual((await fetch(`${base}/../../etc/passwd`)).status, 404);
});
```

- [x] **Step 2: Run to verify failure** — `node --test "plugins/dashboard/**/*.test.js"` — Expected: FAIL on missing `server.js`.

- [x] **Step 3: Implement `fixtures.js`** — 2 mock projects, ≥6 tickets spanning every stage incl. one conflict and one Needs Human, comments containing realistic handoff headers AND `shipyard-metrics` blocks (reuse the prototype's ticket titles/owners so the UI matches the design mock).

- [x] **Step 4: Implement `server.js`** — `node:http`, hand router (method + `url.pathname` split), helpers `readJsonBody(req)` (reject >1MB), `sendJson(res, code, obj)`. Every route handler wrapped in try/catch → 500 JSON. `main()`: port scan 7433–7453 on `EADDRINUSE`; on listen, print `Shipyard dashboard: http://127.0.0.1:<port>`; `--open` runs `open <url>` (darwin) / `xdg-open` otherwise.

- [x] **Step 5: Run tests** — `node --test "plugins/dashboard/**/*.test.js"` — Expected: PASS (all suites).

- [x] **Step 6: Manual boot check** — Run: `node plugins/dashboard/server/server.js --mock --port 7440 &` then `curl -s http://127.0.0.1:7440/api/health`; Expected: `{"ok":true,...}`; kill the server.

- [x] **Step 7: Commit** — `git commit -m "feat(dashboard): stdlib HTTP server with board API, mock mode, static serving"`.

---

### Task 5: Frontend — table, sidebar, pagination (`web/`)

**Files:**
- Create: `plugins/dashboard/web/index.html`
- Create: `plugins/dashboard/web/app.js`
- Reference (read first, do not modify): `docs/design/dashboard/Shipyard Dashboard.dc.html`, `docs/design/dashboard/README.md`

**Interfaces:**
- Consumes: Task 4 API (`/api/projects`, `/api/tickets`, `/api/health`).
- Produces: global app state object `state = { projects, tickets, activeProjectId: 'all', page: 0, selectedTicket: null, activeDrawerTab: 'Overview', ghOk: true }` and render functions `renderSidebar()`, `renderTable()`, `renderBanner()` (Task 6 adds `renderDrawer()`, `renderAddDialog()` to the same `app.js`).

Port the prototype's markup/classes **exactly** (nav, sidebar rows, table, tags, pagination — classes `.nav`, `.btn-*`, `.tag-*`, `.table` etc. per `docs/design/dashboard/README.md` §Screens): replace its `{{ }}`/`sc-for` templating with plain DOM building (`document.createElement` or template literals + `innerHTML` of escaped strings — write an `esc(s)` HTML-escaper and use it for ALL board-sourced text). Page size 5. Stage cell: neutral tag + pulsing accent dot (CSS keyframe from prototype, 1.6s) when `ticket.running`. Priority cell: `High` accent tag / `Medium` outline / `Low` neutral / `—` plain muted when null. Conflict tickets: stage tag gets title attr `"multiple ship:* labels"`. Poll `/api/tickets` + `/api/health` every 30s preserving `page`/selection; re-render only on changed JSON (stringify compare). `ghOk:false` → full-width banner: `gh not authenticated — run: gh auth login`. "New PRD" nav button and search input: render per design; search filters client-side on title/number; New PRD shows `title` tooltip `"Run /prd in Claude Code"` and is otherwise inert (v1).

- [x] **Step 1: Read the prototype file end-to-end** (`docs/design/dashboard/Shipyard Dashboard.dc.html`) — note exact class usage, spacing, and the three-state layout before writing markup.
- [x] **Step 2: Write `index.html`** — static shell: nav, sidebar container `#sidebar`, main `#main`, banner slot `#banner`, drawer root `#drawer-root`, dialog root `#dialog-root`; links `styles.css` + `app.js`; inline `<style>` only for the few prototype styles not in the design system (pulse keyframe, drawer/track geometry) copied from the prototype.
- [x] **Step 3: Write `app.js`** — state, `esc()`, fetch helpers, the three render functions, polling loop, project click → filter+page reset, pagination clamped, row click stores `selectedTicket` (drawer arrives Task 6 — until then log to console).
- [x] **Step 4: Verify against mock** — Run: `node plugins/dashboard/server/server.js --mock --port 7441 &`; open `http://127.0.0.1:7441` in a browser (or `curl` the HTML and sanity-check markup); confirm: sidebar shows projects + counts, table pages by 5, stage/priority tags styled, running dot pulses, search filters. Kill server.
- [x] **Step 5: Commit** — `git commit -m "feat(dashboard): frontend table, sidebar, pagination against live API"`.

---

### Task 6: Frontend — drawer (Gantt + tabs), add-project dialog, actions

**Files:**
- Modify: `plugins/dashboard/web/app.js`
- Modify: `plugins/dashboard/web/index.html` (only if a container is missing)

**Interfaces:**
- Consumes: Task 4 detail/action endpoints; Task 5 `state` + render conventions; timeline row shape from Task 2 (`{stage,label,startPct,widthPct,stat,state}`).
- Produces: `renderDrawer()`, `renderAddDialog()`.

Drawer (per design README §2): row click → `GET /api/tickets/:project/:number` → slide-over 480px max, backdrop click / × closes (stopPropagation on panel). Header kicker `#<number> · <projectName>` accent 10px uppercase; title 20px bold; meta row owner · updated · priority tag. **Gantt:** 5 rows; 76px label (accent when `state==='current'`, muted otherwise); 14px track `--color-surface`; bar `left:startPct%; width:widthPct%`, accent fill for current, `--color-neutral-400` past; right 130px right-aligned monospace stat. Tabs Overview/Spec/Plan/Logs — active `.btn-secondary`, inactive `.btn-ghost`; Overview = ticket body (escaped, pre-wrap), Spec/Plan = file text or `Not spec'd yet` / `Not planned yet`, Logs = dark `<pre>` (`--color-neutral-900` bg / `--color-neutral-100` text) of `logs` as `[createdAt] header` + body. Footer: primary **Approve** button — enabled only when stage is `Awaiting Review` (label `Approve — close ticket`) or `Needs Human` (label `Approve → Planned`), else disabled with title `Pipeline-owned stage`; secondary **Reassign** → `prompt()` for GitHub login → `POST .../assign`; **no Retry button** (v1 omission per spec). Action success → refetch detail + list; failure → inline error line in footer (escaped message).

Add-project dialog (per design README §3): sidebar `+ Add` → `.dialog-backdrop`/`.dialog`; title `Link a local codebase`; folder input `webkitdirectory` used ONLY to prefill the name field; required text field **Path** (absolute path, helper text `The server validates this folder has a GitHub remote`); name field prefilled/editable; Cancel / `Link project` (disabled until path non-empty) → `POST /api/projects` → success: close, refresh sidebar, select new project; 400 → error line in dialog body.

- [x] **Step 1: Implement `renderDrawer()`** as specified.
- [x] **Step 2: Implement `renderAddDialog()`** as specified.
- [x] **Step 3: Verify against mock** — mock server up; click through: drawer opens with 5-row Gantt and stats (`1h 40m · 420K/38K`-style), tabs switch, Approve enabled only on Awaiting Review / Needs Human mock tickets and mutates the mock store (stage changes on refetch), add-project validation error path renders. 
- [x] **Step 4: Run full test suite** — `node --test "plugins/dashboard/**/*.test.js"` — Expected: PASS.
- [x] **Step 5: Commit** — `git commit -m "feat(dashboard): ticket drawer with Gantt timeline, actions, add-project dialog"`.

---

### Task 7: Stage-plugin metrics instrumentation (docs convention)

**Files:**
- Modify: `plugins/planning/skills/speccing-tickets/SKILL.md` (spec comment step)
- Modify: `plugins/planning/skills/planning-tickets/SKILL.md` (plan comment step)
- Modify: `plugins/dev/skills/implementing-tickets/SKILL.md` (handoff comment step)
- Modify: `plugins/qa/skills/verifying-branches/SKILL.md` (verdict comment step)
- Modify: `plugins/ship/skills/shipping-tickets/SKILL.md` (review-packet step)
- Modify: root `README.md` (one line under the dashboard row's description is enough only if factual changes needed; otherwise hook-stage README unchanged content)

**Interfaces:**
- Consumes: metrics block format from Global Constraints (must match `metrics.js` regex exactly).
- Produces: each listed skill gains the identical convention paragraph at its comment-posting step.

- [x] **Step 1: Locate each comment-posting step** in the five SKILL.md files (verbatim anchors: speccing `:142-150` spec comment template, planning `:132-140` plan comment, dev `:174-194` handoff, qa `:234-260` verdict, ship `:259-279` review packet — line numbers may have drifted; search for the templates).
- [x] **Step 2: Append the convention paragraph** after each template (adjust `"stage"` value per plugin: `spec`, `plan`, `dev`, `qa`, `ship`):

```markdown
**Metrics footer (dashboard integration).** Append this hidden HTML comment as the
last line of the comment body, so the dashboard plugin can build stage timelines.
Record `started` when this stage began work on the ticket (ISO 8601 UTC) and
`finished` as now. `tokens_in`/`tokens_out` are optional — include them only when
the stage runner knows real numbers (e.g. ship fills them for dev/qa rounds from
the subagent usage reported in task notifications); never estimate.

<!-- shipyard-metrics {"stage":"dev","started":"<ISO8601>","finished":"<ISO8601>","tokens_in":<n>,"tokens_out":<n>} -->
```

- [x] **Step 3: Verify parser compatibility** — Run: `node -e "const {parseMetrics}=require('./plugins/dashboard/server/metrics.js'); console.log(parseMetrics([{body:'x\n<!-- shipyard-metrics {\"stage\":\"qa\",\"started\":\"2026-08-10T00:00:00Z\",\"finished\":\"2026-08-10T00:05:00Z\"} -->',createdAt:''}]).length)"` — Expected: `1`.
- [x] **Step 4: Commit** — `git add plugins/planning plugins/dev plugins/qa plugins/ship README.md && git commit -m "feat(pipeline): shipyard-metrics footer convention on stage handoff comments"`.

---

### Task 8: E2E against the shipyard-e2e scratch repo + final review

**Files:**
- Create: none in-repo (E2E artifacts stay out of git)
- Reference: memory note — shipyard-e2e scratch repo + headless recipe exist from dev/qa E2E work

**Interfaces:**
- Consumes: everything.

- [x] **Step 1: Link the scratch repo for real** — locate the shipyard-e2e scratch repo used by prior plugin E2E (check `~/.claude/.../memory` note context or `ls ~/Desktop/Projects` for it; if it no longer exists, create a throwaway GitHub repo with 2 labeled issues: one `ship:awaiting-review`, one `ship:planned`). Start the real server (no `--mock`): `node plugins/dashboard/server/server.js --port 7442`. `POST /api/projects` with the scratch repo path via `curl`.
- [x] **Step 2: Verify reads** — `curl -s 'http://127.0.0.1:7442/api/tickets?project=all'` — Expected: real issues with correct `stage` values from their `ship:*` labels.
> **Deviation, verified 2026-09-08 (H-11).** This step as written approves a
> `ship:awaiting-review` issue, which **closes** it. `Jaxsonman/shipyard-e2e`
> is shared with the ship/dev/qa acceptance runs and its issues must not be
> closed, so the guarded approve was exercised on the OTHER approve branch
> instead — `Needs Human` → `ship:planned`, the documented human recovery
> (design spec Decision 3) — on issue **#1** only:
>
> 1. `gh label create ship:needs-human -R Jaxsonman/shipyard-e2e --color B60205 --force`
> 2. `gh issue edit 1 -R Jaxsonman/shipyard-e2e --add-label ship:needs-human` → `/api/tickets` reports stage `Needs Human`.
> 3. `POST /api/tickets/shipyard-e2e/1/approve` → `{"ok":true}`; `gh issue view 1 --json labels,state` → `[ship:planned]`, `OPEN`.
> 4. `gh issue edit 1 --remove-label ship:planned` → labels `[]`, `OPEN` (back to Backlog).
>
> The refusal path was checked on issue #3 (`Spec'd`):
> `POST …/3/approve` → **409** `approve not available for stage Spec'd`.
> Issues #2–#7 were not modified. The close-on-`Awaiting Review` branch stays
> covered by `board.test.js` against an injected `execFile`.
>
> This step therefore stays **unticked**: the `Awaiting Review` → closed branch
> was never exercised against a real board. What was verified is exactly the
> four numbered items above, and no more.

- [ ] **Step 3: Verify guarded approve on the board** — approve the `ship:awaiting-review` issue via `curl -X POST`; Expected: 200, and `gh issue view <n> --json state` shows `CLOSED`. Approve a mid-pipeline issue; Expected: 409. Reopen/restore the scratch issue afterwards (`gh issue reopen`).
- [x] **Step 4: Full suite + JSON validation** — `node --test "plugins/dashboard/**/*.test.js"` PASS; marketplace/plugin JSON parse check from Task 1 Step 7 `ok`.
- [ ] **Step 5: Adversarial review** — dispatch the `refuter` agent on the full diff (`git diff main...HEAD` if on a branch, else the task commits) with the spec; fix confirmed findings, rerun suite.
- [ ] **Step 6: Final commit / merge** — land remaining fixes; ensure README table, marketplace.json, and all tests are green in the final state.
