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
  assert.strictEqual(rows.length, 6); // Spec, Plan, Dev, QA, Review, PR
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
