# Shipyard Dashboard — Hardening Epic E Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land dashboard v1 against a real board and extend it with a board-wide Timeline (Gantt) view, a pipeline stats strip, dark theme, and keyboard accessibility.

**Architecture:** All comment-trail parsing moves behind **one** server module (`plugins/dashboard/server/trail.js`) so that phase 2 can swap its internals for the vendored `scripts/board-trail.js` without touching any consumer. `server/timeline.js` and `server/stats.js` are pure builders that consume `trail.parseTrail()` output and never see raw comment bodies. `server/metrics.js` keeps only formatting helpers plus the per-ticket drawer Gantt, and delegates its parsing to `trail.js`. The frontend stays vanilla JS; time-scale math lives in `web/timeline-scale.js`, a dual-mode (browser global + CommonJS) module unit-tested under `node:test`. The Modernist design system file `web/styles.css` stays byte-identical to `docs/design/dashboard/styles.css`; every new rule, the dark-theme token swap and the migrated inline styles live in a new `web/app.css`.

**Tech Stack:** Node.js stdlib (CommonJS, zero dependencies), `node:test`, vanilla JS/CSS frontend, `gh` CLI for board I/O.

**Spec:** `docs/superpowers/specs/2026-09-08-hardening-program-design.md` (stories H-11..H-15), `docs/superpowers/specs/2026-08-10-dashboard-design.md`, design system `docs/design/dashboard/README.md` + `styles.css`.

## Global Constraints

- Zero runtime dependencies. Node stdlib only, CommonJS (`'use strict';` + `module.exports`).
- Server binds `127.0.0.1` only; existing CSRF/host guard must keep passing.
- `plugins/dashboard/web/styles.css` must remain byte-identical to `docs/design/dashboard/styles.css` (`diff` them in CI-of-the-mind before every commit).
- Design tokens are the source of truth: mono accent `#ec3013`, `--radius-*: 0px`, Archivo. Do not introduce new hues; use the existing neutral/accent 100–900 ramps.
- Test invocation everywhere (plan, README, command doc): `node --test "plugins/dashboard/**/*.test.js"` — the bare-directory form `node --test plugins/dashboard/server/` fails on Node ≥ 23 (`MODULE_NOT_FOUND`).
- Escalation causes are exactly `cap | static | stage-error | reconcile`, parsed from the header `ship:escalation <cause> round N/M`.
- Metrics block format: `<!-- shipyard-metrics {"stage":"dev","started":"<ISO8601>","finished":"<ISO8601>","tokens_in":<n>,"tokens_out":<n>} -->`; `stage`/`started`/`finished` required. Valid `stage` keys: `spec`, `plan`, `dev`, `qa`, `ship`, `pr`.
- Pre-commit hook `check-readme-updated.sh` fails a commit that stages `plugins/` or `.claude-plugin/` without `README.md`. Every such commit must also stage a real `README.md` change.
- Scratch board for e2e is `Jaxsonman/shipyard-e2e`. Never close an issue. Never modify labels or comments on issues #2–#7.
- One commit per task, conventional subject (`feat(dashboard): …`), tests green at each commit.

---

## File Structure

| File | Responsibility |
|---|---|
| `plugins/dashboard/server/trail.js` (new) | **The only place comment bodies are parsed.** Metrics blocks, stage-handoff headers, escalation headers → one normalized trail. Phase 2 swaps its internals for `scripts/board-trail.js`; its exported signatures are frozen. |
| `plugins/dashboard/server/trail.test.js` (new) | Unit tests for the parsing boundary. |
| `plugins/dashboard/server/metrics.js` (modify) | Formatting helpers (`formatTokens`, `formatDuration`) + the per-ticket drawer Gantt `buildTimeline`. Delegates all parsing to `trail.js`; keeps `parseMetrics` as a thin re-export for back-compat. |
| `plugins/dashboard/server/timeline.js` (new) | Board-wide timeline model: per-ticket stage segments + the global domain. Pure; consumes `trail.parseTrail`. |
| `plugins/dashboard/server/timeline.test.js` (new) | Unit tests for segment building, ordering, grouping, domain. |
| `plugins/dashboard/server/stats.js` (new) | Stats strip model: per-stage counts, median/p90 stage duration, token totals, throughput, escalation-cause tallies. Pure. |
| `plugins/dashboard/server/stats.test.js` (new) | Unit tests incl. percentile edge cases. |
| `plugins/dashboard/server/server.js` (modify) | Adds `GET /api/timeline` and `GET /api/stats` routes; serves `/app.css` and `/timeline-scale.js`. |
| `plugins/dashboard/server/fixtures.js` (modify) | Mock board gains: a ticket with full metrics footers, an estimated-only ticket, a PR-stage ticket, and one ticket per escalation cause. |
| `plugins/dashboard/web/timeline-scale.js` (new) | Pure time-scale math: zoom presets, domain resolution, pan clamping, tick generation, segment → rect projection. Dual-mode module. |
| `plugins/dashboard/web/timeline-scale.test.js` (new) | Node unit tests for the scale math. |
| `plugins/dashboard/web/app.css` (new) | Everything not in the verbatim design system: dark-theme token swap, timeline classes, stats-strip classes, focus rings, and all styles migrated out of `app.js`. |
| `plugins/dashboard/web/app.js` (modify) | View switcher (Tickets ⇄ Timeline), timeline rendering, stats strip, keyboard navigation, focus trap, Escape-to-close. No `style="…"` literals left except CSS custom properties carrying geometry. |
| `plugins/dashboard/web/index.html` (modify) | Links `/app.css`, loads `/timeline-scale.js` before `/app.js`, moves its inline `<style>` block and body inline styles into `app.css`, adds the view-switcher nav and stats-strip mount point. |
| `plugins/dashboard/README.md` (modify) | Corrected test invocation, Timeline/stats/dark-theme docs. |
| `docs/superpowers/plans/2026-08-10-dashboard-plugin.md` (modify) | Corrected test invocation; checkboxes ticked as verified. |

---

### Task 1: Fix the `node --test` invocation (H-11)

**Files:**
- Modify: `plugins/dashboard/README.md`
- Modify: `docs/superpowers/plans/2026-08-10-dashboard-plugin.md`
- Modify: `plugins/dashboard/commands/dashboard.md` (only if it names a test command)

**Interfaces:**
- Consumes: nothing.
- Produces: the canonical test command string `node --test "plugins/dashboard/**/*.test.js"` used by every later task.

- [ ] **Step 1: Reproduce the failure**

Run: `node --test plugins/dashboard/server/`
Expected: FAIL — `Error: Cannot find module '.../plugins/dashboard/server'`, `✖ plugins/dashboard/server`, `fail 1`. (Node ≥ 23 treats a bare directory argument as a module specifier.)

- [ ] **Step 2: Confirm the replacement passes**

Run: `node --test "plugins/dashboard/**/*.test.js"`
Expected: PASS — `tests 12 / pass 12 / fail 0`.

- [ ] **Step 3: Replace every occurrence**

Run: `grep -rn 'node --test' plugins/dashboard docs/superpowers/plans/2026-08-10-dashboard-plugin.md`
Replace each `node --test plugins/dashboard/server/` (and any `node --test plugins/dashboard/server` / `.../server/*.test.js` variant) with `node --test "plugins/dashboard/**/*.test.js"`. The quoted glob is required so Node — not the shell — expands it, which keeps it correct as new test files land under `web/`.

- [ ] **Step 4: Verify no stale form remains**

Run: `grep -rn 'node --test' plugins/dashboard docs/superpowers/plans/2026-08-10-dashboard-plugin.md`
Expected: every hit is the quoted-glob form.

- [ ] **Step 5: Commit**

```bash
git add plugins/dashboard/README.md plugins/dashboard/commands/dashboard.md docs/superpowers/plans/2026-08-10-dashboard-plugin.md
git commit -m "fix(dashboard): correct node --test invocation for Node >= 23"
```

---

### Task 2: `trail.js` — the single comment-parsing boundary (H-11, enables H-12/H-13)

**Files:**
- Create: `plugins/dashboard/server/trail.js`
- Create: `plugins/dashboard/server/trail.test.js`
- Modify: `plugins/dashboard/server/metrics.js`

**Interfaces:**
- Consumes: comment arrays of the shape `{ body: string, createdAt: string }` (what `board.js` returns from `gh issue view --json comments`).
- Produces (frozen for phase 2 — `board-trail.js` will be adapted to these exact names/shapes):

```js
// plugins/dashboard/server/trail.js
module.exports = {
  STAGE_ORDER,          // ['Spec','Plan','Dev','QA','Review','PR']
  STAGE_KEY_TO_LABEL,   // { spec:'Spec', plan:'Plan', dev:'Dev', qa:'QA', ship:'Review', pr:'PR' }
  ESCALATION_CAUSES,    // ['cap','static','stage-error','reconcile']
  parseMetricsBlocks,   // (comments) => [{ stage, started, finished, tokens_in?, tokens_out? }]
  parseStageEvents,     // (comments) => [{ stage, round, at }]   at = epoch ms
  parseEscalations,     // (comments) => [{ cause, round, cap, at }]  cause null if unrecognised
  parseTrail,           // (comments) => Trail
};

// Trail = {
//   segments: [{ stage, round, start, end, tokensIn, tokensOut, estimated }],  // epoch ms; ordered by STAGE_ORDER
//   escalations: [{ cause, round, cap, at }],
//   lastActivity: number|null,   // epoch ms of the newest comment
// }
```

Rules: a segment is `estimated: true` when it was derived from a handoff-comment timestamp rather than a metrics block (then `start === end` and `tokensIn/tokensOut` are `null`). Metrics blocks for the same stage aggregate: earliest `started`, latest `finished`, summed tokens, `round` = highest round seen for that stage. Unknown `stage` keys, unparseable JSON, and blocks missing `stage`/`started`/`finished` are skipped silently.

- [ ] **Step 1: Write the failing tests**

```js
// plugins/dashboard/server/trail.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const trail = require('./trail');

const mk = (body, createdAt) => ({ body, createdAt });
const M = (o) => `<!-- shipyard-metrics ${JSON.stringify(o)} -->`;

test('parseMetricsBlocks skips invalid JSON and blocks missing required fields', () => {
  const out = trail.parseMetricsBlocks([
    mk('ship:dev round 1/3\n' + M({ stage: 'dev', started: '2026-08-10T14:00:00Z', finished: '2026-08-10T15:40:00Z', tokens_in: 420000, tokens_out: 38000 }), '2026-08-10T15:40:00Z'),
    mk('<!-- shipyard-metrics {"stage":"qa","started":"bad json -->', '2026-08-10T16:00:00Z'),
    mk(M({ started: '2026-08-10T16:00:00Z', finished: '2026-08-10T16:10:00Z' }), '2026-08-10T16:10:00Z'),
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].stage, 'dev');
  assert.equal(out[0].tokens_in, 420000);
});

test('parseEscalations reads cause, round and cap from the header', () => {
  const out = trail.parseEscalations([
    mk('ship:escalation cap round 3/3\n\n## What QA keeps finding\nstuff', '2026-08-10T18:00:00Z'),
    mk('ship:escalation stage-error round 1/3\n\nboom', '2026-08-10T19:00:00Z'),
  ]);
  assert.deepEqual(out.map((e) => e.cause), ['cap', 'stage-error']);
  assert.deepEqual(out.map((e) => [e.round, e.cap]), [[3, 3], [1, 3]]);
});

test('parseEscalations returns cause null for an unrecognised escalation header', () => {
  const out = trail.parseEscalations([mk('ship:escalation — dev/QA loop exhausted at round 3', '2026-08-10T18:00:00Z')]);
  assert.equal(out.length, 1);
  assert.equal(out[0].cause, null);
});

test('parseTrail aggregates repeated metrics blocks for one stage', () => {
  const t = trail.parseTrail([
    mk('ship:dev round 1/3\n' + M({ stage: 'dev', started: '2026-08-10T10:00:00Z', finished: '2026-08-10T11:00:00Z', tokens_in: 100, tokens_out: 10 }), '2026-08-10T11:00:00Z'),
    mk('ship:dev round 2/3\n' + M({ stage: 'dev', started: '2026-08-10T12:00:00Z', finished: '2026-08-10T13:00:00Z', tokens_in: 200, tokens_out: 20 }), '2026-08-10T13:00:00Z'),
  ]);
  const dev = t.segments.find((s) => s.stage === 'Dev');
  assert.equal(dev.start, Date.parse('2026-08-10T10:00:00Z'));
  assert.equal(dev.end, Date.parse('2026-08-10T13:00:00Z'));
  assert.equal(dev.tokensIn, 300);
  assert.equal(dev.tokensOut, 30);
  assert.equal(dev.round, 2);
  assert.equal(dev.estimated, false);
});

test('parseTrail falls back to comment timestamps and flags the segment estimated', () => {
  const t = trail.parseTrail([
    mk('📋 Spec approved — see docs/ship/1/spec.md', '2026-08-09T09:00:00Z'),
    mk('ship:qa verdict PASS', '2026-08-10T20:00:00Z'),
  ]);
  const spec = t.segments.find((s) => s.stage === 'Spec');
  assert.equal(spec.estimated, true);
  assert.equal(spec.start, spec.end);
  assert.equal(spec.tokensIn, null);
  assert.ok(t.segments.some((s) => s.stage === 'QA' && s.estimated === true));
});

test('parseTrail orders segments by STAGE_ORDER and reports lastActivity', () => {
  const t = trail.parseTrail([
    mk('ship:review-packet round 1/3', '2026-08-11T09:00:00Z'),
    mk('📋 Spec approved', '2026-08-09T09:00:00Z'),
  ]);
  assert.deepEqual(t.segments.map((s) => s.stage), ['Spec', 'Review']);
  assert.equal(t.lastActivity, Date.parse('2026-08-11T09:00:00Z'));
});

test('parseTrail on an empty trail returns no segments and null lastActivity', () => {
  const t = trail.parseTrail([]);
  assert.deepEqual(t.segments, []);
  assert.deepEqual(t.escalations, []);
  assert.equal(t.lastActivity, null);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test plugins/dashboard/server/trail.test.js`
Expected: FAIL — `Cannot find module './trail'`.

- [ ] **Step 3: Implement `trail.js`**

Move the regexes and stage tables out of `metrics.js` into `trail.js`:

```js
'use strict';

const METRICS_BLOCK_RE = /<!--\s*shipyard-metrics\s+(\{[\s\S]*?\})\s*-->/g;
const STAGE_ORDER = ['Spec', 'Plan', 'Dev', 'QA', 'Review', 'PR'];
const STAGE_KEY_TO_LABEL = { spec: 'Spec', plan: 'Plan', dev: 'Dev', qa: 'QA', ship: 'Review', pr: 'PR' };
const ESCALATION_CAUSES = ['cap', 'static', 'stage-error', 'reconcile'];

const ESCALATION_RE = /^ship:escalation\s+(cap|static|stage-error|reconcile)\s+round\s+(\d+)\s*\/\s*(\d+)/;
const ANY_ESCALATION_RE = /^ship:escalation\b/;

// First matching pattern wins per stage; `round` is null when the header carries none.
const HEADER_PATTERNS = [
  { stage: 'Spec', re: /^📋 Spec approved/ },
  { stage: 'Plan', re: /^🗺️ Plan approved/ },
  { stage: 'Dev', re: /^ship:dev (?:round (\d+)\/(\d+)|standalone|escalation)/ },
  { stage: 'QA', re: /^ship:qa verdict\b/ },
  { stage: 'Review', re: /^ship:review-packet(?: round (\d+)\/(\d+))?/ },
  { stage: 'PR', re: /^ship:pr(?:-open)?\b/ },
];
```

`parseMetricsBlocks` is the current `metrics.parseMetrics` body verbatim. `parseStageEvents` scans the first line of each comment against `HEADER_PATTERNS`, returning `{ stage, round: Number(m[1]) || null, at: Date.parse(comment.createdAt) }` for every match (all matches, not first-per-stage — callers reduce). `parseEscalations` tests the first line: on `ESCALATION_RE` return `{cause: m[1], round: Number(m[2]), cap: Number(m[3]), at}`; else on `ANY_ESCALATION_RE` return `{cause: null, round: null, cap: null, at}`. `parseTrail` composes them: aggregate metrics blocks per label (min start, max end, summed tokens, max round from the co-located stage event), then for labels with no metrics take the earliest matching stage event as a zero-width estimated segment; emit in `STAGE_ORDER` order, skipping labels with neither. Skip `NaN` timestamps everywhere.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test plugins/dashboard/server/trail.test.js`
Expected: PASS — 7 tests.

- [ ] **Step 5: Point `metrics.js` at the boundary**

In `metrics.js`, delete `METRICS_BLOCK_RE`, `STAGE_KEY_TO_LABEL` and `FALLBACK_PATTERNS`; `const trail = require('./trail');`, keep `const STAGE_ORDER = ['Spec','Plan','Dev','QA','Review'];` for the drawer's five-row Gantt (unchanged UI), and rebuild `buildTimeline` on `trail.parseTrail(comments)` instead of its own parsing. Re-export `parseMetrics = trail.parseMetricsBlocks` so `metrics.test.js` and any caller keep working. `formatTokens`/`formatDuration` stay in `metrics.js`.

- [ ] **Step 6: Run the whole suite**

Run: `node --test "plugins/dashboard/**/*.test.js"`
Expected: PASS — all pre-existing 12 tests plus the 7 new ones, `fail 0`.

- [ ] **Step 7: Commit**

```bash
git add plugins/dashboard/server/trail.js plugins/dashboard/server/trail.test.js plugins/dashboard/server/metrics.js plugins/dashboard/README.md
git commit -m "refactor(dashboard): move all comment-trail parsing behind server/trail.js"
```

(Stage a README line documenting `server/trail.js` as the parsing boundary — the pre-commit hook requires a README change alongside `plugins/`.)

---

### Task 3: Extended fixtures for mock mode (H-12, H-13)

**Files:**
- Modify: `plugins/dashboard/server/fixtures.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: a mock board that exercises every timeline and stats code path. After this task the fixture set must contain, at minimum:
  1. one ticket with **full metrics footers** on every stage through Review (non-estimated bars with token numbers),
  2. one **estimated-only** ticket (handoff comments, no metrics blocks → hatched zero-width-grown bars, no token stats),
  3. one ticket in an **active** stage (`ship:in-dev` or `ship:in-qa`) so the running pulse renders,
  4. one ticket per **escalation cause** (`cap`, `static`, `stage-error`, `reconcile`) on `ship:needs-human`,
  5. one **Backlog** ticket (no `ship:*` label) for the "hide backlog" filter,
  6. tickets spread across **at least two projects** with `updatedAt` spanning ≥ 3 weeks so the day/week/month zoom presets differ visibly.

- [ ] **Step 1: Read the current fixture shape**

Run: `sed -n '1,60p' plugins/dashboard/server/fixtures.js`
Note the existing `iso(daysAgo)` helper and ticket object keys; reuse them exactly — do not invent new keys.

- [ ] **Step 2: Fix the malformed escalation fixture**

`fixtures.js:160` currently reads `'ship:escalation — dev/QA loop exhausted at round 3'`, which is not the documented header. Change it to `'ship:escalation cap round 3/3\n\n## What QA keeps finding\n…'` and add three more Needs Human tickets whose headers are `ship:escalation static round 2/3`, `ship:escalation stage-error round 1/3`, `ship:escalation reconcile round 2/3`.

- [ ] **Step 3: Add the estimated-only and PR tickets**

Add one ticket whose comments are handoff headers only (`📋 Spec approved`, `🗺️ Plan approved`, `ship:dev round 1/3`) with **no** `shipyard-metrics` footer, and one ticket carrying a `<!-- shipyard-metrics {"stage":"pr",…} -->` footer plus a `ship:pr-open` header comment.

- [ ] **Step 4: Verify mock mode still serves**

Run: `node plugins/dashboard/server/server.js --mock --port 8899 & sleep 1; curl -s localhost:8899/api/tickets | head -c 400; kill %1`
Expected: JSON ticket list including the new tickets.

- [ ] **Step 5: Run the suite**

Run: `node --test "plugins/dashboard/**/*.test.js"`
Expected: PASS, `fail 0`.

- [ ] **Step 6: Commit**

```bash
git add plugins/dashboard/server/fixtures.js plugins/dashboard/README.md
git commit -m "test(dashboard): fixtures covering metrics, estimated, PR and every escalation cause"
```

---

### Task 4: `timeline.js` + `GET /api/timeline` (H-12 server half)

**Files:**
- Create: `plugins/dashboard/server/timeline.js`
- Create: `plugins/dashboard/server/timeline.test.js`
- Modify: `plugins/dashboard/server/server.js`
- Modify: `plugins/dashboard/server/server.test.js`

**Interfaces:**
- Consumes: `trail.parseTrail(comments)`, `trail.STAGE_ORDER`; `board.stageFromLabels(labels)`; the ticket detail shape from `board.getTicket(repo, number)`.
- Produces:

```js
// plugins/dashboard/server/timeline.js
module.exports = { buildRow, buildBoardTimeline, CURRENT_STAGE_FOR };

// buildRow(ticket, { projectId, projectName, now }) => Row
// Row = {
//   id: `${projectId}#${number}`, project, projectName, number, title, url,
//   stage, conflict, backlog: stage === 'Backlog',
//   escalation: { cause, round, cap } | null,     // newest escalation
//   lastActivity,                                  // epoch ms, falls back to Date.parse(updatedAt)
//   running: boolean,                              // stage is Dev|QA and the newest segment is that stage
//   segments: [{ stage, round, start, end, estimated, state, tokensIn, tokensOut,
//               durationLabel, tokensLabel }],   // labels preformatted server-side
//                                                //   with metrics.formatDuration / formatTokens
//                                                //   so there is exactly one formatter
//   tokensIn, tokensOut,                           // row totals (nulls treated as 0)
// }
// state ∈ 'past' | 'current' | 'future'; 'current' is the segment whose stage
// matches CURRENT_STAGE_FOR[ticket stage]; all earlier STAGE_ORDER entries are
// 'past'. Needs Human ⇒ the newest data-bearing segment is 'current'.

// buildBoardTimeline({ tickets, projects, now }) => {
//   now, domain: { start, end },   // epoch ms; min segment start .. max(now, max segment end)
//   rows,                          // grouped by project (project order = projects order),
//                                  // within a project sorted by lastActivity DESC
//   groups: [{ projectId, projectName, count }],
// }
```

`CURRENT_STAGE_FOR = { "Spec'd": 'Spec', Planned: 'Plan', Dev: 'Dev', QA: 'QA', 'Awaiting Review': 'Review', 'PR Open': 'PR' }`; `Backlog` → none current; `Needs Human` → newest data-bearing segment.

An **active** segment (the current stage of a ticket whose stage is Dev or QA, with no `finished` newer than its `started`) is rendered with `end = now` by the client; the server reports the raw `end` and sets `running: true` so the client can extend it. Do not bake `now` into `end` server-side — it makes the response uncacheable and the tests time-dependent.

- [ ] **Step 1: Write the failing tests**

```js
// plugins/dashboard/server/timeline.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const timeline = require('./timeline');

const NOW = Date.parse('2026-08-12T00:00:00Z');
const M = (o) => `<!-- shipyard-metrics ${JSON.stringify(o)} -->`;
const mk = (body, createdAt) => ({ body, createdAt });

const devTicket = {
  number: 81, title: 'CSV export', url: 'u', updatedAt: '2026-08-11T13:00:00Z',
  labels: [{ name: 'ship:in-dev' }],
  comments: [
    mk('📋 Spec approved\n' + M({ stage: 'spec', started: '2026-08-09T09:00:00Z', finished: '2026-08-09T10:00:00Z', tokens_in: 100, tokens_out: 10 }), '2026-08-09T10:00:00Z'),
    mk('ship:dev round 1/3\n' + M({ stage: 'dev', started: '2026-08-11T12:00:00Z', finished: '2026-08-11T13:00:00Z', tokens_in: 900, tokens_out: 90 }), '2026-08-11T13:00:00Z'),
  ],
};

test('buildRow marks the label stage current and earlier stages past', () => {
  const row = timeline.buildRow(devTicket, { projectId: 'core', projectName: 'Core', now: NOW });
  assert.equal(row.id, 'core#81');
  assert.equal(row.stage, 'Dev');
  assert.equal(row.running, true);
  assert.deepEqual(row.segments.map((s) => [s.stage, s.state]), [['Spec', 'past'], ['Dev', 'current']]);
  assert.equal(row.tokensIn, 1000);
  assert.equal(row.tokensOut, 100);
  assert.equal(row.lastActivity, Date.parse('2026-08-11T13:00:00Z'));
});

test('buildRow surfaces the newest escalation cause for a Needs Human ticket', () => {
  const row = timeline.buildRow({
    number: 88, title: 'stuck', url: 'u', updatedAt: '2026-08-11T13:00:00Z',
    labels: [{ name: 'ship:needs-human' }],
    comments: [
      mk('ship:escalation static round 1/3', '2026-08-10T10:00:00Z'),
      mk('ship:escalation cap round 3/3', '2026-08-11T13:00:00Z'),
    ],
  }, { projectId: 'core', projectName: 'Core', now: NOW });
  assert.equal(row.stage, 'Needs Human');
  assert.deepEqual(row.escalation, { cause: 'cap', round: 3, cap: 3 });
});

test('buildRow flags a Backlog ticket and gives it no current segment', () => {
  const row = timeline.buildRow({ number: 1, title: 'idea', url: 'u', updatedAt: '2026-08-01T00:00:00Z', labels: [], comments: [] },
    { projectId: 'core', projectName: 'Core', now: NOW });
  assert.equal(row.backlog, true);
  assert.deepEqual(row.segments, []);
  assert.equal(row.lastActivity, Date.parse('2026-08-01T00:00:00Z'));
});

test('buildBoardTimeline groups by project and sorts by last activity descending', () => {
  const out = timeline.buildBoardTimeline({
    now: NOW,
    projects: [{ id: 'core', name: 'Core' }, { id: 'reef', name: 'Reef' }],
    tickets: [
      { project: 'reef', ...devTicket, number: 5 },
      { project: 'core', ...devTicket, number: 6, updatedAt: '2026-08-01T00:00:00Z', comments: [] },
      { project: 'core', ...devTicket, number: 7 },
    ],
  });
  assert.deepEqual(out.rows.map((r) => r.id), ['core#7', 'core#6', 'reef#5']);
  assert.deepEqual(out.groups, [{ projectId: 'core', projectName: 'Core', count: 2 }, { projectId: 'reef', projectName: 'Reef', count: 1 }]);
});

test('buildBoardTimeline domain spans the earliest segment to now', () => {
  const out = timeline.buildBoardTimeline({ now: NOW, projects: [{ id: 'core', name: 'Core' }], tickets: [{ project: 'core', ...devTicket }] });
  assert.equal(out.domain.start, Date.parse('2026-08-09T09:00:00Z'));
  assert.equal(out.domain.end, NOW);
});

test('buildBoardTimeline with no segmented tickets still returns a non-zero domain', () => {
  const out = timeline.buildBoardTimeline({ now: NOW, projects: [{ id: 'core', name: 'Core' }], tickets: [{ project: 'core', number: 1, title: 't', url: 'u', updatedAt: '2026-08-11T00:00:00Z', labels: [], comments: [] }] });
  assert.ok(out.domain.end > out.domain.start);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test plugins/dashboard/server/timeline.test.js`
Expected: FAIL — `Cannot find module './timeline'`.

- [ ] **Step 3: Implement `timeline.js`**

Pure functions only, no I/O. `buildRow` calls `board.stageFromLabels(ticket.labels)` and `trail.parseTrail(ticket.comments)`, projects segments into `STAGE_ORDER` positions to assign `state`, sums tokens, picks the newest escalation, and computes `lastActivity = trail.lastActivity ?? Date.parse(ticket.updatedAt)`. `buildBoardTimeline` maps every ticket through `buildRow`, groups in `projects` order (tickets whose project is unknown go last under their own id), sorts each group by `lastActivity` descending, and derives the domain; when no segment exists, fall back to `{ start: now - 7*86400e3, end: now }`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test plugins/dashboard/server/timeline.test.js`
Expected: PASS — 6 tests.

- [ ] **Step 5: Add the route**

In `server.js`, add `GET /api/timeline` → `handleGetTimeline` next to `handleGetTickets` (same `project=<id|all>` query handling and the same board-warning/partial-failure semantics `handleGetTickets` already uses). The handler must fetch **ticket detail** (comments) per ticket — `board.listTickets` does not return comments — so call `board.getTicket(repo, number)` for each listed issue, with a bounded concurrency of 5 (`Promise.all` over chunks) so a large board does not spawn hundreds of `gh` processes. Failures on individual tickets degrade to a row with no segments plus a `warnings[]` entry; they must not fail the whole response. Response body:

```json
{ "now": 1786000000000,
  "domain": { "start": 1785000000000, "end": 1786000000000 },
  "groups": [ { "projectId": "core", "projectName": "Core", "count": 5 } ],
  "rows": [ { "id": "core#81", "project": "core", "number": 81, "title": "CSV export",
              "stage": "Dev", "backlog": false, "running": true, "escalation": null,
              "lastActivity": 1785900000000, "tokensIn": 1000, "tokensOut": 100,
              "segments": [ { "stage": "Spec", "round": null, "start": 1785000000000,
                              "end": 1785003600000, "estimated": false, "state": "past",
                              "tokensIn": 100, "tokensOut": 10,
                              "durationLabel": "1h 0m", "tokensLabel": "100/10" } ] } ],
  "warnings": [] }
```

- [ ] **Step 6: Test the route**

Add to `server.test.js`, following its existing pattern of starting `createApp({ mock: true })` on an ephemeral port:

```js
test('GET /api/timeline returns grouped rows with segments', async () => {
  const { base, close } = await startMockServer();
  try {
    const res = await fetch(`${base}/api/timeline?project=all`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.domain.end > body.domain.start);
    assert.ok(body.rows.length > 0);
    assert.ok(body.rows.some((r) => r.segments.some((s) => s.estimated === false && s.tokensIn > 0)));
    assert.ok(body.rows.some((r) => r.segments.some((s) => s.estimated === true)));
  } finally { await close(); }
});
```

- [ ] **Step 7: Run the whole suite**

Run: `node --test "plugins/dashboard/**/*.test.js"`
Expected: PASS, `fail 0`.

- [ ] **Step 8: Commit**

```bash
git add plugins/dashboard/server/timeline.js plugins/dashboard/server/timeline.test.js plugins/dashboard/server/server.js plugins/dashboard/server/server.test.js plugins/dashboard/README.md
git commit -m "feat(dashboard): board-wide timeline model and GET /api/timeline"
```

---

### Task 5: `stats.js` + `GET /api/stats` (H-13 server half)

**Files:**
- Create: `plugins/dashboard/server/stats.js`
- Create: `plugins/dashboard/server/stats.test.js`
- Modify: `plugins/dashboard/server/server.js`
- Modify: `plugins/dashboard/server/server.test.js`

**Interfaces:**
- Consumes: the `rows` produced by `timeline.buildBoardTimeline` (so stats and timeline never disagree).
- Produces:

```js
// plugins/dashboard/server/stats.js
module.exports = { percentile, buildStats, STAGE_KEYS, THROUGHPUT_WINDOW_DAYS };
// THROUGHPUT_WINDOW_DAYS = 28

// percentile(sortedAscNumbers, p /* 0..1 */) => number
//   Linear interpolation between closest ranks; [] => null; single value => that value.

// buildStats({ rows, now }) => {
//   counts: { "Backlog":n, "Spec'd":n, "Planned":n, "Dev":n, "QA":n,
//             "Awaiting Review":n, "Needs Human":n },   // every key always present
//   stageDuration: { medianMs, p90Ms, samples, medianLabel, p90Label },
//                                                      // null Ms/labels when samples === 0
//   tokens: { in, out, inLabel, outLabel },             // labels via metrics.formatTokens
//   throughput: { perWeek, reached, windowDays },
//   escalations: { cap:n, static:n, "stage-error":n, reconcile:n, unknown:n },
// }
```

Definitions, fixed here so the UI copy matches the maths:
- **stageDuration samples** = every non-estimated segment with `end > start`, across the visible rows. Estimated (zero-width) segments are excluded — they carry no real duration.
- **tokens** = sum of `row.tokensIn` / `row.tokensOut` over the visible rows.
- **throughput** = tickets that *reached* Review — a row with a `Review` or `PR` segment, or whose `stage` is `Awaiting Review` — whose earliest Review segment `start` (or `lastActivity` if the segment is estimated) falls within the last `THROUGHPUT_WINDOW_DAYS` days. `perWeek = round(reached / (windowDays / 7) * 10) / 10`.
- **escalations** counts rows whose `escalation.cause` is set; `null` causes count as `unknown`.

- [ ] **Step 1: Write the failing tests**

```js
// plugins/dashboard/server/stats.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const stats = require('./stats');

const NOW = Date.parse('2026-08-12T00:00:00Z');
const HOUR = 3600e3;
const DAY = 24 * HOUR;

test('percentile interpolates and handles the degenerate cases', () => {
  assert.equal(stats.percentile([], 0.5), null);
  assert.equal(stats.percentile([5], 0.9), 5);
  assert.equal(stats.percentile([1, 2, 3, 4], 0.5), 2.5);
  assert.equal(stats.percentile([10, 20, 30, 40, 50], 0.9), 46);
});

const row = (over) => Object.assign({
  id: 'core#1', project: 'core', stage: 'Dev', backlog: false, escalation: null,
  lastActivity: NOW - DAY, tokensIn: 0, tokensOut: 0, segments: [],
}, over);

test('buildStats counts every stage key even when empty', () => {
  const out = stats.buildStats({ now: NOW, rows: [row({ stage: 'Dev' })] });
  assert.equal(out.counts.Dev, 1);
  assert.equal(out.counts.Backlog, 0);
  assert.equal(out.counts['Needs Human'], 0);
});

test('buildStats ignores estimated segments when timing stages', () => {
  const out = stats.buildStats({ now: NOW, rows: [row({
    segments: [
      { stage: 'Spec', start: NOW - 4 * HOUR, end: NOW - 3 * HOUR, estimated: false, tokensIn: 5, tokensOut: 1 },
      { stage: 'Plan', start: NOW - 2 * HOUR, end: NOW - 2 * HOUR, estimated: true, tokensIn: null, tokensOut: null },
    ], tokensIn: 5, tokensOut: 1 }) ] });
  assert.equal(out.stageDuration.samples, 1);
  assert.equal(out.stageDuration.medianMs, HOUR);
  assert.equal(out.stageDuration.medianLabel, '1h 0m');
  assert.equal(out.tokens.in, 5);
  assert.equal(out.tokens.out, 1);
});

test('buildStats tallies escalation causes, unknown included', () => {
  const out = stats.buildStats({ now: NOW, rows: [
    row({ stage: 'Needs Human', escalation: { cause: 'cap', round: 3, cap: 3 } }),
    row({ stage: 'Needs Human', escalation: { cause: 'cap', round: 2, cap: 3 } }),
    row({ stage: 'Needs Human', escalation: { cause: null, round: null, cap: null } }),
  ] });
  assert.equal(out.escalations.cap, 2);
  assert.equal(out.escalations.unknown, 1);
  assert.equal(out.escalations.static, 0);
});

test('buildStats throughput counts only tickets reaching review inside the window', () => {
  const out = stats.buildStats({ now: NOW, rows: [
    row({ stage: 'Awaiting Review', segments: [{ stage: 'Review', start: NOW - 2 * DAY, end: NOW - 2 * DAY + HOUR, estimated: false, tokensIn: 0, tokensOut: 0 }] }),
    row({ stage: 'Awaiting Review', segments: [{ stage: 'Review', start: NOW - 60 * DAY, end: NOW - 60 * DAY + HOUR, estimated: false, tokensIn: 0, tokensOut: 0 }] }),
  ] });
  assert.equal(out.throughput.reached, 1);
  assert.equal(out.throughput.windowDays, 28);
  assert.equal(out.throughput.perWeek, 0.3);
});

test('buildStats on an empty board returns nulls, not NaN', () => {
  const out = stats.buildStats({ now: NOW, rows: [] });
  assert.equal(out.stageDuration.medianMs, null);
  assert.equal(out.stageDuration.p90Ms, null);
  assert.equal(out.tokens.in, 0);
  assert.equal(out.tokens.out, 0);
  assert.equal(out.throughput.perWeek, 0);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test plugins/dashboard/server/stats.test.js`
Expected: FAIL — `Cannot find module './stats'`.

- [ ] **Step 3: Implement `stats.js`**

```js
function percentile(sorted, p) {
  if (!sorted.length) return null;
  if (sorted.length === 1) return sorted[0];
  const rank = (sorted.length - 1) * p;
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (rank - lo);
}
```

The rest is a single pass over `rows` accumulating the five sections defined above. Keep the stage key list in one exported constant shared with `board.js`'s stage names so a rename cannot silently drop a column.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test plugins/dashboard/server/stats.test.js`
Expected: PASS — 6 tests.

- [ ] **Step 5: Add the route + its test**

`GET /api/stats?project=<id|all>` → `handleGetStats`, which reuses exactly the same row-gathering helper as `handleGetTimeline` (extract it into one internal `gatherRows(projectId)` function so the two endpoints cannot diverge) and returns `buildStats({ rows, now: Date.now() })` plus the same `warnings[]`. Add:

```js
test('GET /api/stats returns counts, durations, tokens and escalation causes', async () => {
  const { base, close } = await startMockServer();
  try {
    const body = await (await fetch(`${base}/api/stats?project=all`)).json();
    assert.ok(Object.prototype.hasOwnProperty.call(body.counts, 'Needs Human'));
    assert.ok(body.stageDuration.samples > 0);
    assert.ok(body.tokens.in > 0);
    assert.ok(body.escalations.cap >= 1);
  } finally { await close(); }
});
```

- [ ] **Step 6: Run the whole suite**

Run: `node --test "plugins/dashboard/**/*.test.js"`
Expected: PASS, `fail 0`.

- [ ] **Step 7: Commit**

```bash
git add plugins/dashboard/server/stats.js plugins/dashboard/server/stats.test.js plugins/dashboard/server/server.js plugins/dashboard/server/server.test.js plugins/dashboard/README.md
git commit -m "feat(dashboard): pipeline stats model and GET /api/stats"
```

---

### Task 6: `timeline-scale.js` — pure time-scale math (H-12)

**Files:**
- Create: `plugins/dashboard/web/timeline-scale.js`
- Create: `plugins/dashboard/web/timeline-scale.test.js`

**Interfaces:**
- Consumes: nothing (pure).
- Produces a dual-mode module — the browser gets `window.TimelineScale`, Node gets `module.exports`:

```js
// tail of plugins/dashboard/web/timeline-scale.js
const TimelineScale = { ZOOM_PRESETS, resolveDomain, clampPan, createScale, ticks, segmentRects, STAGE_ROWS };
if (typeof module !== 'undefined' && module.exports) module.exports = TimelineScale;
if (typeof window !== 'undefined') window.TimelineScale = TimelineScale;
```

```js
// ZOOM_PRESETS = [
//   { id: 'day',   label: 'Day',   spanMs: 86400000 },
//   { id: 'week',  label: 'Week',  spanMs: 604800000 },
//   { id: 'month', label: 'Month', spanMs: 2592000000 },
//   { id: 'all',   label: 'All',   spanMs: null },       // fit the data domain
// ];

// resolveDomain(presetId, { dataStart, dataEnd, now, panMs = 0 })
//   => { start, end }
//   'all'  => { start: dataStart, end: dataEnd } widened by 2% on each side.
//   others => a window of spanMs ending at `now`, shifted by panMs, then clamped
//             by clampPan so it can never leave [dataStart - spanMs/2, dataEnd + spanMs/2].

// clampPan(panMs, spanMs, { dataStart, dataEnd, now }) => clamped panMs

// createScale({ start, end, width }) => { start, end, width, spanMs, pxPerMs, toX(t), toTime(x) }
//   toX clamps nothing — callers clip; width 0 or spanMs 0 ⇒ pxPerMs 0 and toX === 0.

// ticks(start, end, width) => [{ t, label, major }]
//   Chooses the largest step from [1h,3h,6h,12h,1d,2d,7d,14d,1mo(30d)] that yields
//   <= width / 90 gridlines (≈90px minimum spacing), never fewer than 2.
//   `major` is true on day boundaries for sub-day steps, else on the first tick of a month.
//   Labels: sub-day step => "HH:mm", day steps => "D MMM", >= 7d => "D MMM".

// segmentRects(segments, scale, { now, running })
//   => [{ stage, round, estimated, state, x, w, start, end, tokensIn, tokensOut, clipped }]
//   A 'current' segment on a running row is extended to `now`.
//   Zero-duration (estimated) segments get a minimum width of 3px.
//   Segments entirely outside [scale.start, scale.end] are dropped; partially
//   outside ones are clipped and flagged `clipped: true`.

// STAGE_ROWS = ['Spec','Plan','Dev','QA','Review','PR']
```

- [ ] **Step 1: Write the failing tests**

```js
// plugins/dashboard/web/timeline-scale.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const TS = require('./timeline-scale');

const NOW = Date.parse('2026-08-12T00:00:00Z');
const DAY = 86400000;

test('createScale maps the domain ends onto the pixel ends', () => {
  const s = TS.createScale({ start: 0, end: 1000, width: 500 });
  assert.equal(s.toX(0), 0);
  assert.equal(s.toX(1000), 500);
  assert.equal(s.toX(500), 250);
  assert.equal(s.toTime(250), 500);
});

test('createScale degrades safely on a zero-width span', () => {
  const s = TS.createScale({ start: 5, end: 5, width: 500 });
  assert.equal(s.pxPerMs, 0);
  assert.equal(s.toX(5), 0);
});

test("resolveDomain 'all' fits the data with a small margin", () => {
  const d = TS.resolveDomain('all', { dataStart: 0, dataEnd: 1000, now: NOW });
  assert.ok(d.start < 0 && d.end > 1000);
});

test('resolveDomain week ends at now when unpanned', () => {
  const d = TS.resolveDomain('week', { dataStart: NOW - 30 * DAY, dataEnd: NOW, now: NOW });
  assert.equal(d.end, NOW);
  assert.equal(d.end - d.start, 7 * DAY);
});

test('clampPan refuses to scroll past the data plus half a window', () => {
  const span = 7 * DAY;
  const clamped = TS.clampPan(-999 * DAY, span, { dataStart: NOW - 30 * DAY, dataEnd: NOW, now: NOW });
  const d = TS.resolveDomain('week', { dataStart: NOW - 30 * DAY, dataEnd: NOW, now: NOW, panMs: clamped });
  assert.ok(d.start >= NOW - 30 * DAY - span / 2 - 1);
});

test('ticks keeps gridlines at least ~90px apart and always returns at least two', () => {
  const t = TS.ticks(NOW - 7 * DAY, NOW, 700);
  assert.ok(t.length >= 2);
  assert.ok(t.length <= Math.ceil(700 / 90) + 1);
  assert.ok(t.every((x) => typeof x.label === 'string' && x.label.length > 0));
});

test('segmentRects extends the running current segment to now', () => {
  const scale = TS.createScale({ start: NOW - DAY, end: NOW, width: 100 });
  const [r] = TS.segmentRects([{ stage: 'Dev', state: 'current', estimated: false, start: NOW - DAY / 2, end: NOW - DAY / 2 }], scale, { now: NOW, running: true });
  assert.ok(r.w > 40 && r.w <= 50);
});

test('segmentRects clips a segment that starts before the window', () => {
  const scale = TS.createScale({ start: NOW - DAY, end: NOW, width: 100 });
  const [r] = TS.segmentRects([{ stage: 'Spec', state: 'past', estimated: false, start: NOW - 5 * DAY, end: NOW - DAY / 2 }], scale, { now: NOW, running: false });
  assert.equal(r.x, 0);
  assert.equal(r.clipped, true);
});

test('segmentRects drops segments entirely outside the window and floors estimated width', () => {
  const scale = TS.createScale({ start: NOW - DAY, end: NOW, width: 100 });
  const out = TS.segmentRects([
    { stage: 'Spec', state: 'past', estimated: false, start: NOW - 90 * DAY, end: NOW - 89 * DAY },
    { stage: 'Plan', state: 'past', estimated: true, start: NOW - DAY / 2, end: NOW - DAY / 2 },
  ], scale, { now: NOW, running: false });
  assert.equal(out.length, 1);
  assert.equal(out[0].stage, 'Plan');
  assert.ok(out[0].w >= 3);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test plugins/dashboard/web/timeline-scale.test.js`
Expected: FAIL — `Cannot find module './timeline-scale'`.

- [ ] **Step 3: Implement `timeline-scale.js`**

Plain functions, no DOM access anywhere in this file — that is what makes it testable under Node. Use UTC-safe `Date` formatting via `Intl.DateTimeFormat` with an explicit `timeZone: undefined` (local) and short month names; never hand-roll month names.

- [ ] **Step 4: Run to verify pass**

Run: `node --test plugins/dashboard/web/timeline-scale.test.js`
Expected: PASS — 9 tests.

- [ ] **Step 5: Run the whole suite and commit**

```bash
node --test "plugins/dashboard/**/*.test.js"
git add plugins/dashboard/web/timeline-scale.js plugins/dashboard/web/timeline-scale.test.js plugins/dashboard/README.md
git commit -m "feat(dashboard): pure time-scale math module for the timeline view"
```

---

### Task 7: `app.css` — dark theme, migrated inline styles, focus rings (H-14 part 1)

**Files:**
- Create: `plugins/dashboard/web/app.css`
- Modify: `plugins/dashboard/web/index.html`
- Modify: `plugins/dashboard/web/app.js`
- Modify: `plugins/dashboard/server/server.js` (only if `CONTENT_TYPES` lacks `.css` — verify first)

Done before the timeline UI so the timeline can be authored in classes from the start rather than retrofitted.

**Interfaces:**
- Produces the class vocabulary later tasks use: `.app-shell`, `.nav-right`, `.nav-search`, `.sidebar`, `.sidebar-head`, `.proj-row`, `.proj-row.is-active`, `.proj-name`, `.proj-repo`, `.main-col`, `.page-head`, `.page-title`, `.page-sub`, `.page-body`, `.pager`, `.pager-actions`, `.row-click`, `.banner`, `.banner-warn`, `.drawer-err`, `.gantt-grid`, `.gantt-label`, `.gantt-stat`, `.tabs`, `.logs`, `.dialog-field`, `.focusable`.

- [ ] **Step 1: Establish the theme contract**

`app.css` starts with the token swap. `styles.css` (verbatim system) defines the light palette on `:root`; `app.css` **only overrides** the same token names — it must not introduce new color literals outside these blocks:

```css
/* Dark theme: same token names, dark values. Light stays the :root default in
   styles.css. Order matters — the [data-theme] block must come last so an
   explicit choice beats the media query in both directions. */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { /* dark token values */ }
}
:root[data-theme="dark"] { /* the same dark token values */ }
```

Dark values (derived from the existing ramps, mono accent preserved):
`--color-bg: #1a1918; --color-surface: #262423; --color-text: #f3f2f2; --color-divider: color-mix(in srgb, #f3f2f2 32%, transparent);`
neutral ramp inverted (`--color-neutral-100: #2d2b2b` … `--color-neutral-900: #f8f4f4`), accent held at `#ec3013` with `--color-accent-100: #3a1610` … `--color-accent-900: #ffd9d0` inverted likewise, and shadows re-derived per the design system's own comment ("a hairline edge + ambient darkness on a dark one"):
`--shadow-sm: 0 0 0 1px color-mix(in srgb, #f3f2f2 10%, transparent); --shadow-md: 0 0 0 1px color-mix(in srgb, #f3f2f2 12%, transparent), 0 3px 10px rgb(0 0 0 / 0.5); --shadow-lg: 0 0 0 1px color-mix(in srgb, #f3f2f2 14%, transparent), 0 12px 32px rgb(0 0 0 / 0.6);`
Also set `:root { color-scheme: light dark; }` so form controls and scrollbars follow.

- [ ] **Step 2: Move the `<head>` style block and body inline styles**

Cut the whole `<style>…</style>` block out of `index.html` into `app.css` verbatim (`@keyframes pulse`, `.dot-running`, `.gantt-track`, `.gantt-bar`, `.drawer-backdrop`, `.drawer-panel`, `body{margin:0}`), add `<link rel="stylesheet" href="/app.css">` **after** the `/styles.css` link, and replace each `style="…"` in the body with a class: the outer wrapper → `.app-shell`, the nav right group → `.nav-right`, the search input → `.nav-search`, the split → `.app-split`, the sidebar → `.sidebar`, the main column → `.main-col`.

- [ ] **Step 3: Move all 46 inline styles out of `app.js`**

Lines to convert (from the survey): 134, 141, 168, 169, 170, 180, 181, 182, 183, 185, 246, 259, 260, 261, 263, 279, 280, 281, 369, 370, 373, 404, 405, 407, 409, 417, 419, 421, 426, 436, 442, 445, 450, 458, 459, 460, 465, 467, 473, 474, 475, 584, 592, 595, 597, 600.
Static declarations become classes. The genuinely dynamic ones — the drawer Gantt bar geometry at line 407 (`left:${row.startPct}%; width:${row.widthPct}%`) and its `background`/`color` by state — become a class plus CSS custom properties: `class="gantt-bar gantt-bar-${row.state}" style="--bar-left:${row.startPct}%; --bar-width:${row.widthPct}%"`, with `.gantt-bar { left: var(--bar-left); width: var(--bar-width); }` and per-state colors in `app.css`. Colors chosen by JS (`textColor`, `labelColor`) must move into `.is-active` / `.state-past|current|future` modifier classes — no color literals may remain in `app.js`.

- [ ] **Step 4: Add visible focus rings**

```css
:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
.proj-row:focus-visible, .ticket-row:focus-visible, .tl-row:focus-visible { outline-offset: -2px; }
```
Never remove an outline without an equivalent replacement. Also honour reduced motion — the running pulse is the only animation in the app, and it must stop for people who ask it to:

```css
@media (prefers-reduced-motion: reduce) {
  .dot-running, .tl-bar-running { animation: none; }
}
```

- [ ] **Step 5: Verify no inline styles and no design-system drift**

Run: `grep -c 'style="' plugins/dashboard/web/app.js plugins/dashboard/web/index.html`
Expected: only the CSS-custom-property carriers remain (≤ 4 in `app.js`, 0 in `index.html`).
Run: `diff docs/design/dashboard/styles.css plugins/dashboard/web/styles.css`
Expected: no output.

- [ ] **Step 6: Visual check in both themes**

Start `node plugins/dashboard/server/server.js --mock --port 8899`, open `http://127.0.0.1:8899/`, screenshot light and dark (emulate `prefers-color-scheme`), confirm the table, sidebar and drawer are legible in both and nothing lost its border/rule.

- [ ] **Step 7: Run the suite and commit**

```bash
node --test "plugins/dashboard/**/*.test.js"
git add plugins/dashboard/web/app.css plugins/dashboard/web/index.html plugins/dashboard/web/app.js plugins/dashboard/README.md
git commit -m "feat(dashboard): dark theme token swap and inline styles moved to app.css"
```

---

### Task 8: Timeline view UI (H-12 client half)

**Files:**
- Modify: `plugins/dashboard/web/app.js`
- Modify: `plugins/dashboard/web/app.css`
- Modify: `plugins/dashboard/web/index.html`

**Interfaces:**
- Consumes: `GET /api/timeline` (Task 4), `window.TimelineScale` (Task 6), the class vocabulary from Task 7.
- Produces: `state.view` (`'tickets' | 'timeline'`), `state.zoom` (preset id, default `'week'`), `state.panMs`, `state.stageFilter` (Set of stage names, empty = all), `state.hideBacklog` (bool), and `renderTimeline()`.

- [ ] **Step 1: Add the view switcher**

In `index.html`, replace the single `<a href="#" aria-current="page">Tickets</a>` with two buttons in a `role="tablist"`: `#view-tickets` and `#view-timeline`, each `role="tab"` with `aria-selected` reflecting `state.view`. Clicking either sets `state.view` and re-renders `#main`; `renderMain()` dispatches to `renderTable()` or `renderTimeline()`.

- [ ] **Step 2: Render the timeline**

Structure per row, using CSS grid so the label column and the track column line up across all rows and groups:

```html
<div class="tl">
  <div class="tl-axis" id="tl-axis"><!-- tick labels + gridlines --></div>
  <div class="tl-group"><div class="tl-group-head">Core · org/shipyard-core</div>
    <div class="tl-row" tabindex="0" role="button" data-project="core" data-number="81"
         aria-label="CSV export, stage Dev">
      <div class="tl-row-label"><span class="tl-num">#81</span> CSV export</div>
      <div class="tl-track">
        <div class="tl-bar tl-bar-past" style="--x:12px;--w:40px">…</div>
        <div class="tl-bar tl-bar-current tl-bar-running" style="--x:60px;--w:80px"></div>
      </div>
    </div>
  </div>
</div>
```

Bar classes (mono-accent scheme, all colors from the ramps in `app.css`, never in JS):
- `.tl-bar-current` → `background: var(--color-accent)`; add `.tl-bar-running` for the pulse (`animation: pulse 1.6s ease-in-out infinite`, reusing the existing keyframe).
- Past bars use a **neutral ramp by recency**: the newest past stage gets `.tl-bar-past-1` (`--color-neutral-700`), then `-2` (`600`), `-3` (`500`), `-4` (`400`), `-5` (`300`). Assign the index in JS from the segment's position relative to the current one.
- `.tl-bar-est` overlays the hatch and must compose with any of the above:
  `background-image: repeating-linear-gradient(45deg, transparent 0 4px, color-mix(in srgb, var(--color-bg) 55%, transparent) 4px 8px);`

- [ ] **Step 3: Axis, gridlines and the now line**

Gridlines are absolutely positioned 1px `--color-divider` rules inside `.tl-track-layer`, one per `TimelineScale.ticks(...)` entry, `opacity: .35` for minor and `.7` for major. The now line is a single `.tl-now` rule in `--color-accent` at `TimelineScale.createScale(...).toX(now)`, drawn only when `now` is inside the domain. Recompute on `resize` (debounced 100 ms) using the track element's `clientWidth`.

- [ ] **Step 4: Zoom presets and pan**

Render `TimelineScale.ZOOM_PRESETS` as a `.zoom-group` of `.btn.btn-secondary` (active preset) / `.btn.btn-ghost` buttons. Horizontal pan: `wheel` with `deltaX` (or shift+`deltaY`) and pointer drag on `.tl-track-layer` adjust `state.panMs` by `-delta / scale.pxPerMs`, passed through `TimelineScale.clampPan`. `ArrowLeft`/`ArrowRight` on a focused timeline pan by 10% of the span, `Home` resets pan to 0.

- [ ] **Step 5: Tooltip**

One shared `#tl-tip` element (not one per bar). On `mouseenter`/`focus` of a `.tl-bar`, position it above the bar and fill it with: stage name, `round N` when present, `segment.durationLabel`, `segment.tokensLabel` (both preformatted by the server in Task 4 with `metrics.formatDuration`/`formatTokens`, so the codebase has exactly one formatter), and the literal word `estimated` when `segment.estimated`. Hide on `mouseleave`/`blur`. Also set the bar's `title` attribute to the same text so the information survives without JS hover.

- [ ] **Step 6: Filters**

Stage chips: one `.chip` per `TimelineScale.STAGE_ROWS` entry, `aria-pressed` reflecting membership in `state.stageFilter`; filtering hides non-matching **bars**, not rows, and a row with no visible bars is hidden. `#hide-backlog` is a labelled checkbox that drops rows with `backlog: true`. The sidebar project selection filters rows exactly as it filters the table (reuse `state.activeProjectId`).

- [ ] **Step 7: Click opens the drawer**

`.tl-row` click and `Enter`/`Space` call the existing `openDrawer(project, number)`.

- [ ] **Step 8: Verify**

Run the mock server; screenshot the timeline in light and dark; confirm: bars for a metrics ticket, hatched bars for the estimated-only ticket, a pulsing current bar, the now line, gridlines changing with each zoom preset, tooltip content, chips and hide-backlog filtering, and Tab reaching every row.

- [ ] **Step 9: Run the suite and commit**

```bash
node --test "plugins/dashboard/**/*.test.js"
git add plugins/dashboard/web plugins/dashboard/server plugins/dashboard/README.md
git commit -m "feat(dashboard): board-wide timeline view with zoom, pan, filters and tooltips"
```

---

### Task 9: Stats strip (H-13 client half)

**Files:**
- Modify: `plugins/dashboard/web/app.js`, `plugins/dashboard/web/app.css`, `plugins/dashboard/web/index.html`

**Interfaces:**
- Consumes: `GET /api/stats?project=` (Task 5).
- Produces: `renderStats()` mounted at `#stats` **above** the view switcher's content so it shows on both views; `state.stats`, `state.causeFilter` (`null` or one of the four causes).

- [ ] **Step 1: Add the mount point**

`<div id="stats" class="stats-strip"></div>` between `#banner` and the split in `index.html`.

- [ ] **Step 2: Render the tiles**

Five tiles in a `.stats-strip` flex row, each `.stat-tile` with a `.stat-label` (10px uppercase kicker, `--color-neutral-600`) over a `.stat-value` (20px `--font-heading`): **Stages** (one `.tag.tag-neutral` per non-zero stage, `Stage n`), **Median stage**, **p90 stage**, **Tokens** (`in / out` via the server-formatted strings), **Throughput** (`N.N / wk`). Empty/null values render as `—`, never `NaN` or `null`.

- [ ] **Step 3: Escalation cause tags**

Under the tiles, a `.cause-row` of `.chip` buttons — one per cause with a non-zero count, labelled `cap 2`, `static 1`, … Clicking sets `state.causeFilter` (toggles off when re-clicked) and filters **both** views to Needs Human rows with that cause; the active chip gets `aria-pressed="true"`. In the ticket table, the Stage cell of a Needs Human ticket additionally renders its cause as a `.tag.tag-outline` next to the stage tag.

- [ ] **Step 4: Keep it in sync**

`loadStats()` joins the existing `Promise.all` in `boot()` and the `startPolling()` interval; it re-fetches on project change. Reuse the `lastStatsJson` stringify-compare pattern so unchanged data does not re-render.

- [ ] **Step 5: Verify**

Mock server: the strip shows real numbers, cause chips match the fixture escalations, clicking `cap` narrows both views, clicking again restores. Screenshot.

- [ ] **Step 6: Run the suite and commit**

```bash
node --test "plugins/dashboard/**/*.test.js"
git add plugins/dashboard/web plugins/dashboard/README.md
git commit -m "feat(dashboard): stats strip with stage counts, durations, tokens and escalation causes"
```

---

### Task 10: Keyboard navigation and focus management (H-14 part 2)

**Files:**
- Modify: `plugins/dashboard/web/app.js`, `plugins/dashboard/web/app.css`

- [ ] **Step 1: Make rows real controls**

Sidebar project rows, ticket table rows and timeline rows get `tabindex="0"`, `role="button"` (table rows keep `<tr>` semantics — give them `tabindex="0"` and a keydown handler rather than a bogus role), and an `aria-label` naming the ticket and stage. `Enter` and `Space` (with `preventDefault` on Space) activate; `ArrowUp`/`ArrowDown` move focus between sibling rows and wrap at the ends.

- [ ] **Step 2: Drawer focus handling**

On open: remember `document.activeElement` in `lastFocus`, move focus to the drawer's close button, set `aria-modal="true"` and `role="dialog"` on `.drawer-panel`. On close: restore focus to `lastFocus`. `Escape` anywhere closes the drawer. `Tab`/`Shift+Tab` cycle within the panel (focus trap over `panel.querySelectorAll('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])')`).

- [ ] **Step 3: Dialog focus trap**

Same treatment for the add-project dialog: `role="dialog" aria-modal="true"`, focus the first field on open, trap Tab, `Escape` cancels, focus restored to the `+ Add` button.

- [ ] **Step 4: Verify by keyboard only**

With the mock server open, drive the whole app from the keyboard: Tab from the search field through the view tabs, into the sidebar, through table rows, open a drawer with Enter, Tab around inside it, Escape out, confirm focus returned to the row. Confirm every focused element shows a visible ring in light and dark.

- [ ] **Step 5: Run the suite and commit**

```bash
node --test "plugins/dashboard/**/*.test.js"
git add plugins/dashboard/web plugins/dashboard/README.md
git commit -m "feat(dashboard): keyboard navigation, focus trap and visible focus rings"
```

---

### Task 11: E2E against `Jaxsonman/shipyard-e2e` (H-11 plan task 8)

**Files:** none in-repo except the two plan files' checkboxes.

Deviation from the 2026-08-10 plan's Task 8 Step 3 recorded up front: that step approves an `ship:awaiting-review` issue, which **closes** it. The scratch repo must not have issues closed, so the guarded-approve e2e uses the **Needs Human → `ship:planned`** branch on issue **#1** instead. Both branches of `board.approve` are covered — the close branch by `board.test.js`'s injected `execFile`, the label branch for real.

- [ ] **Step 1: Start the real server and link the repo**

```bash
node plugins/dashboard/server/server.js --port 7442 --config /tmp/shipyard-dashboard-e2e.json &
curl -s -X POST localhost:7442/api/projects -H 'Content-Type: application/json' \
  -d '{"name":"shipyard-e2e","path":"/Users/jaxsonmansouri/Desktop/Projects/shipyard-e2e"}'
```
Expected: 200 with `repo: "Jaxsonman/shipyard-e2e"` derived from the git remote. (Use `--config` so the real `~/.claude/shipyard-dashboard.json` is not mutated; add the flag to `parseArgv` if it is not already supported.)

- [ ] **Step 2: Verify reads**

```bash
curl -s 'localhost:7442/api/tickets?project=all' | head -c 800
curl -s 'localhost:7442/api/timeline?project=all' | head -c 800
curl -s 'localhost:7442/api/stats?project=all'
```
Expected: 7 open issues; #7/#6/#5/#4/#2 → `Planned`, #3 → `Spec'd`, #1 → `Backlog`; timeline rows with real bars for #2 and #4 (they have `ship:dev`/`ship:qa` trails, expected `estimated: true` since those trails predate the metrics convention); stats returns non-null counts.

- [ ] **Step 3: Guarded approve on #1**

```bash
gh label create ship:needs-human -R Jaxsonman/shipyard-e2e --color B60205 --force
gh issue edit 1 -R Jaxsonman/shipyard-e2e --add-label ship:needs-human
curl -s 'localhost:7442/api/tickets?project=all' | grep -o '"number":1[^}]*'   # expect stage "Needs Human"
curl -s -X POST localhost:7442/api/tickets/<projectId>/1/approve
gh issue view 1 -R Jaxsonman/shipyard-e2e --json labels        # expect ship:planned, no ship:needs-human
gh issue edit 1 -R Jaxsonman/shipyard-e2e --remove-label ship:planned   # restore Backlog
gh issue view 1 -R Jaxsonman/shipyard-e2e --json labels,state  # expect [] and OPEN
```
Also POST approve on issue #3 (`Spec'd`) and expect **409** with `approve not available for stage Spec'd`. Never touch #2–#7.

- [ ] **Step 4: Render check in the browser**

Point the browser at `http://127.0.0.1:7442/`, confirm the 7 real tickets render in the table and the timeline, and that the drawer opens on a real ticket. Screenshot.

- [ ] **Step 5: Tick the checkboxes**

In `docs/superpowers/plans/2026-08-10-dashboard-plugin.md`, change `- [ ]` to `- [x]` for every step verified in this branch's history (tasks 1–7 by commit, task 8 by this run), and annotate task 8 step 3 with the #1/Needs Human deviation and its reason. Do not tick anything not actually verified.

- [ ] **Step 6: Full suite + JSON validation**

```bash
node --test "plugins/dashboard/**/*.test.js"
node -e "JSON.parse(require('fs').readFileSync('.claude-plugin/marketplace.json','utf8')); JSON.parse(require('fs').readFileSync('plugins/dashboard/.claude-plugin/plugin.json','utf8')); console.log('ok')"
```

- [ ] **Step 7: Commit**

```bash
git add docs/superpowers/plans/2026-08-10-dashboard-plugin.md plugins/dashboard/README.md
git commit -m "docs(dashboard): record e2e verification against shipyard-e2e and tick plan"
```

---

### Task 12: Adversarial review

- [ ] **Step 1: Dispatch the refuter**

Dispatch the `refuter` agent (model `opus`) with `git diff main...HEAD`, the H-11..H-14 acceptance criteria from the program spec, and an explicit instruction to hunt for: timezone/DST bugs in `ticks`, `NaN`/divide-by-zero in the scale and percentile maths, XSS via unescaped ticket titles in the new timeline/stats markup, unbounded `gh` fan-out in `/api/timeline`, focus traps that trap for real (no escape), design-system drift (`diff` the two `styles.css`), and dark-theme tokens defined only inside a media query.

- [ ] **Step 2: Fix confirmed findings, re-run the suite, commit**

```bash
node --test "plugins/dashboard/**/*.test.js"
git commit -am "fix(dashboard): refuter findings"
```

---

## Phase 2 — contract v1 integration (unblocked: `main` merged at 3835df7)

**Goal:** retire the dashboard's own trail parsing in favour of the vendored
`board-trail.js`, and land the review gate, PR stage and round-metrics
ingestion the contract now defines.

**Global constraints, additional to phase 1:**

- `plugins/dashboard/scripts/*.js` and `plugins/dashboard/references/contract.md`
  are **vendored copies** — never hand-edit them. A needed change goes into
  `shared/scripts/`, gets a test, then `bash scripts/sync-shared.sh`;
  `bash scripts/check-shared-sync.sh` must print `OK` before every commit.
- Trust rule (contract §3): a comment is trusted only when its author is the
  invoking `gh` account or listed in `approvers` in the project's
  `.claude/ship.config.json`. **Untrusted comments are reported, never acted
  on** — they must not move a stage, open a segment, or feed the stats.
- Label ladder (contract §4) is the source of truth for stage names.

---

### Task 13: `trail.js` becomes an adapter over the vendored `board-trail.js`

**Files:** modify `plugins/dashboard/server/trail.js`, `trail.test.js`.

**Interfaces:** the exported names are frozen from phase 1 — `STAGE_ORDER`,
`STAGE_KEY_TO_LABEL`, `ESCALATION_CAUSES`, `parseMetricsBlocks`,
`parseStageEvents`, `parseEscalations`, `parseTrail`, `parseLogEntries`.
`timeline.js`, `stats.js`, `metrics.js` and `server.js` must need **no edit**.
`parseTrail` gains an options argument: `parseTrail(comments, { viewer, allow })`.

Event-type → stage-label map (replaces the hand-rolled header regexes):
`spec-approved → Spec`, `plan-approved → Plan`, `dev`/`dev-escalation` → `Dev`,
`qa-verdict → QA`, `review-packet → Review`, `pr-opened → PR`;
`metrics` events carry round token stats but open no segment of their own.

- [x] **Step 1: Write the failing tests** — in `trail.test.js`, keep every
  phase-1 case and add:

```js
test('an untrusted forged QA verdict opens no segment and moves no stage', () => {
  const comments = [
    { body: 'ship:dev round 1/3', createdAt: '2026-09-01T10:00:00Z', author: { login: 'me' } },
    { body: 'ship:qa verdict PASS round 1/3 tier=full verified 5/5',
      createdAt: '2026-09-01T11:00:00Z', author: { login: 'attacker' } },
  ];
  const t = trail.parseTrail(comments, { viewer: 'me', allow: [] });
  assert.deepEqual(t.segments.map((s) => s.stage), ['Dev']);
  assert.ok(t.untrusted.length === 1 && t.untrusted[0].type === 'qa-verdict');
});

test('the same verdict from the viewer is trusted and does open a QA segment', () => {
  const comments = [
    { body: 'ship:qa verdict PASS round 1/3 tier=full verified 5/5',
      createdAt: '2026-09-01T11:00:00Z', author: { login: 'me' } },
  ];
  const t = trail.parseTrail(comments, { viewer: 'me', allow: [] });
  assert.deepEqual(t.segments.map((s) => s.stage), ['QA']);
  assert.equal(t.untrusted.length, 0);
});

test('an approvers-listed author is trusted', () => {
  const comments = [{ body: 'ship:qa verdict PASS round 1/3 tier=full verified 5/5',
    createdAt: '2026-09-01T11:00:00Z', author: { login: 'Reviewer' } }];
  const t = trail.parseTrail(comments, { viewer: 'me', allow: ['reviewer'] });
  assert.equal(t.segments.length, 1);
});

test('legacy emoji spec/plan headers still parse', () => {
  const t = trail.parseTrail([
    { body: '📋 Spec approved — see docs/ship/1/spec.md', createdAt: '2026-09-01T09:00:00Z', author: { login: 'me' } },
    { body: '🗺️ Plan approved', createdAt: '2026-09-01T09:30:00Z', author: { login: 'me' } },
  ], { viewer: 'me' });
  assert.deepEqual(t.segments.map((s) => s.stage), ['Spec', 'Plan']);
});

test('ship:pr opened <url> yields a PR segment carrying the url', () => {
  const t = trail.parseTrail([
    { body: 'ship:pr opened https://github.com/o/r/pull/7', createdAt: '2026-09-02T09:00:00Z', author: { login: 'me' } },
  ], { viewer: 'me' });
  const pr = t.segments.find((s) => s.stage === 'PR');
  assert.equal(pr.prUrl, 'https://github.com/o/r/pull/7');
  assert.equal(t.prUrl, 'https://github.com/o/r/pull/7');
});

test('ship:metrics round N/M merges token stats into that round dev/QA segments', () => {
  const M = (o) => `<!-- shipyard-metrics ${JSON.stringify(o)} -->`;
  const t = trail.parseTrail([
    { body: 'ship:dev round 1/3\n' + M({ stage: 'dev', started: '2026-09-01T10:00:00Z', finished: '2026-09-01T11:00:00Z' }),
      createdAt: '2026-09-01T11:00:00Z', author: { login: 'me' } },
    { body: 'ship:metrics round 1/3\n' + M({ stage: 'dev', started: '2026-09-01T10:00:00Z', finished: '2026-09-01T11:00:00Z', tokens_in: 5000, tokens_out: 700 }),
      createdAt: '2026-09-01T11:05:00Z', author: { login: 'me' } },
  ], { viewer: 'me' });
  const dev = t.segments.find((s) => s.stage === 'Dev');
  assert.equal(dev.tokensIn, 5000);
  assert.equal(dev.tokensOut, 700);
});
```

- [x] **Step 2: Run to verify failure** — `node --test plugins/dashboard/server/trail.test.js`; expect failures on `untrusted`, `prUrl` and the metrics merge.

- [x] **Step 3: Rewrite `trail.js` as an adapter** — delete the local
  `HEADERS`/`ESCALATION_RE`/`METRICS_BLOCK_RE` definitions and delegate:
  `const boardTrail = require('../scripts/board-trail.js');`
  `parseTrail` shapes `{ comments }` into the `issue` object `parseEvents`
  expects, calls `boardTrail.parseEvents(issue, { viewer, allow })`, drops
  events with `trusted !== true` into `untrusted[]`, and folds the rest into
  the existing segment shape. `parseMetricsBlocks` keeps working by reading
  each event's `metrics`. Trail gains `untrusted: []` and `prUrl: string|null`
  alongside `segments` / `escalations` / `lastActivity`.

- [x] **Step 4: Run to verify pass** — `node --test plugins/dashboard/server/trail.test.js`.

- [x] **Step 5: Confirm no consumer changed** — `git diff --stat` must show
  `trail.js` and `trail.test.js` only, and the whole suite green:
  `node --test "plugins/dashboard/**/*.test.js"`.

- [x] **Step 6: Commit** — `refactor(dashboard): trail.js is now an adapter over the vendored board-trail.js`.

---

### Task 14: viewer + approvers plumbing

**Files:** modify `plugins/dashboard/server/board.js`, `server.js`, and their tests.

- [ ] **Step 1** — `board.js` gains `async viewer()` running `gh api user --jq .login`, and `readApprovers(projectPath)` reading `approvers` from `<projectPath>/.claude/ship.config.json` (missing file or key → `[]`; never throw).
- [ ] **Step 2** — `server.js` resolves the viewer **once per process** and caches it (a module-level promise); a failure caches `null`, which per contract §3 makes every non-`approvers` author untrusted. Every `parseTrail` call site passes `{ viewer, allow }`.
- [ ] **Step 3** — tests: viewer is fetched once across two requests (count injected `execFile` calls); a malformed `ship.config.json` yields `[]` rather than a 500.
- [ ] **Step 4: Commit** — `feat(dashboard): resolve the gh viewer and per-project approvers for the trust rule`.

---

### Task 15: H-15 — review gate, Approved and PR Open stages

**Files:** `plugins/dashboard/server/board.js`, `timeline.js`, `stats.js` (via `web/pipeline-stats.js`), `metrics.js`, `server.js`, `web/app.js`, `web/app.css`, and tests.

- [ ] **Step 1: Approve on Awaiting Review swaps labels instead of closing** (program spec Decision 6, contract §4). `board.approve` for `Awaiting Review` becomes `gh issue edit <n> --repo <r> --add-label ship:approved --remove-label ship:awaiting-review`. It must NOT close the issue. Update `board.test.js`'s close-branch assertion to assert the label swap, and add a test asserting `issue close` is never invoked.
- [ ] **Step 2: New stages.** Add to `STAGE_PRECEDENCE` above `ship:awaiting-review`: `ship:pr-open → 'PR Open'`, `ship:approved → 'Approved'`. Add both to `CURRENT_STAGE_FOR` in `timeline.js` (`Approved → 'Review'`, `PR Open → 'PR'`) and to `STAGE_KEYS` in `web/pipeline-stats.js` so the stats strip counts them.
- [x] **Step 3: PR URL.** `parseTrail` already surfaces `trail.prUrl` (Task 13). Thread it onto the timeline row (`row.prUrl`) and the ticket detail payload; render it in the drawer header as a link next to the ticket id, in the Logs tab, and as the PR segment's tooltip link. Escape it with `esc()` and only render `https://` URLs.
- [ ] **Step 4: Drawer Gantt gains the PR row** — `metrics.buildTimeline`'s `STAGE_ORDER` goes from five rows to six (`Spec, Plan, Dev, QA, Review, PR`). Update `metrics.test.js`'s row-count assertions.
- [x] **Step 5: `ship:metrics` merge** — verified by Task 13's test; assert here that the timeline tooltip's `tokensLabel` and the stats strip's token totals include a round whose tokens arrived only via a `ship:metrics` comment. Add a fixture ticket carrying one.
- [x] **Step 6: Approve button copy** — the drawer's primary button reads `Approve → Approved` on Awaiting Review (not "close ticket"), stays `Approve → Planned` on Needs Human, and is disabled elsewhere. `approveEligibility` gains the two new stages as non-approvable.
- [ ] **Step 7: Commit** — `feat(dashboard): review gate sets ship:approved, plus Approved and PR Open stages`.

---

### Task 16: Timeline polish

**Files:** `plugins/dashboard/web/timeline-scale.js`, `timeline-scale.test.js`, `web/app.js`, `web/app.css`.

- [x] **Step 1: "Fit" zoom preset** — a fifth preset `{ id: 'fit', label: 'Fit', spanMs: null }`, whose domain is the **visible rows'** data extent padded 5% each side (distinct from `all`, which fits the whole board's domain). `resolveDomain('fit', { dataStart, dataEnd, now })` behaves like `all` over the extent it is handed; the client passes the visible rows' min/max instead of the payload domain. `fit` is the default `state.zoom` when the board has any segment, falling back to `week` on an empty board. Tests: padding is 5%; a single-instant extent still yields a non-zero span.
- [ ] **Step 2: Minimum bar width** — `MIN_BAR_PX` is already 3; add an explicit test that a one-second segment on a month-wide domain still yields `w >= 3` and that its `x + w` stays inside the track.
- [x] **Step 3: Per-row right label** — a right-aligned column (matching the drawer's `.gantt-stat` monospace style) showing the row's current stage tag and time-in-stage (`now - currentSegment.start`, via the server's `formatDuration`). Rows with no current segment show `—`. The grid becomes `label | track | stat`; the axis row gets a matching spacer so gridlines stay aligned.
- [x] **Step 4: Confirm tooltips on minimum-width bars** — in the browser, hover and focus a 3px bar and confirm `#tl-tip` shows.
- [ ] **Step 5: Commit** — `feat(dashboard): fit zoom preset, per-row stage/duration label, min bar width`.

---

### Task 17: Docs and version

- [ ] **Step 1** — `docs/superpowers/specs/2026-08-10-dashboard-design.md` Decision 3 gains a dated note: approve on Awaiting Review no longer closes the issue; it sets `ship:approved` per the hardening program spec's Decision 6 and contract §4, and the issue closes when the PR merges.
- [ ] **Step 2** — root `README.md` dashboard section: install line, `/dashboard` usage, what Approve does on each stage, and that the dashboard performs board writes only and never launches pipeline runs.
- [ ] **Step 3** — `plugins/dashboard/README.md`: same, plus the Approved/PR Open stages and the trust rule.
- [ ] **Step 4** — `plugins/dashboard/.claude-plugin/plugin.json` version → `1.0.0`.
- [ ] **Step 5: Commit** — `docs(dashboard): review-gate decision note, usage docs, v1.0.0`.

---

### Task 18: Phase 2 adversarial review

- [ ] **Step 1** — dispatch the `refuter` agent (model opus) on the phase 2 diff with the H-11-remainder and H-15 criteria, the contract's trust rule, and an explicit brief to try forging board comments.
- [ ] **Step 2** — fix confirmed findings, re-run `node --test "plugins/dashboard/**/*.test.js"` and `bash scripts/check-shared-sync.sh`, commit.
- [ ] **Step 3** — fresh screenshots (timeline light + dark, drawer showing the PR row) into the scratchpad dashboard folder.
