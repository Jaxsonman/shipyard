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

test("resolveDomain 'all' still returns a non-zero span for a single instant", () => {
  const d = TS.resolveDomain('all', { dataStart: NOW, dataEnd: NOW, now: NOW });
  assert.ok(d.end > d.start);
});

test('resolveDomain week ends at now when unpanned', () => {
  const d = TS.resolveDomain('week', { dataStart: NOW - 30 * DAY, dataEnd: NOW, now: NOW });
  assert.equal(d.end, NOW);
  assert.equal(d.end - d.start, 7 * DAY);
});

test('resolveDomain falls back to the week preset for an unknown id', () => {
  const d = TS.resolveDomain('nonsense', { dataStart: NOW - 30 * DAY, dataEnd: NOW, now: NOW });
  assert.equal(d.end - d.start, 7 * DAY);
});

test('clampPan refuses to scroll past the data plus half a window', () => {
  const span = 7 * DAY;
  const clamped = TS.clampPan(-999 * DAY, span, { dataStart: NOW - 30 * DAY, dataEnd: NOW, now: NOW });
  const d = TS.resolveDomain('week', { dataStart: NOW - 30 * DAY, dataEnd: NOW, now: NOW, panMs: clamped });
  assert.ok(d.start >= NOW - 30 * DAY - span / 2 - 1);
});

test('clampPan leaves an in-range pan untouched and rejects a zero span', () => {
  assert.equal(TS.clampPan(-DAY, 7 * DAY, { dataStart: NOW - 30 * DAY, dataEnd: NOW, now: NOW }), -DAY);
  assert.equal(TS.clampPan(-DAY, 0, { dataStart: NOW - 30 * DAY, dataEnd: NOW, now: NOW }), 0);
});

test('ticks keeps gridlines at least ~90px apart and always returns at least two', () => {
  const t = TS.ticks(NOW - 7 * DAY, NOW, 700);
  assert.ok(t.length >= 2);
  assert.ok(t.length <= Math.ceil(700 / 90) + 1);
  assert.ok(t.every((x) => typeof x.label === 'string' && x.label.length > 0));
});

test('ticks coarsens the step as the span grows', () => {
  const dayTicks = TS.ticks(NOW - DAY, NOW, 700);
  const yearTicks = TS.ticks(NOW - 365 * DAY, NOW, 700);
  assert.ok(dayTicks.length >= 2 && yearTicks.length >= 2);
  assert.ok(yearTicks.length <= Math.ceil(700 / 90) + 1);
  const daySpacing = dayTicks[1].t - dayTicks[0].t;
  const yearSpacing = yearTicks[1].t - yearTicks[0].t;
  assert.ok(yearSpacing > daySpacing);
});

test('ticks survives a degenerate domain or zero width', () => {
  assert.equal(TS.ticks(NOW, NOW, 700).length, 2);
  assert.equal(TS.ticks(NOW - DAY, NOW, 0).length, 2);
});

test('segmentRects extends the running current segment to now', () => {
  const scale = TS.createScale({ start: NOW - DAY, end: NOW, width: 100 });
  const [r] = TS.segmentRects([{ stage: 'Dev', state: 'current', estimated: false, start: NOW - DAY / 2, end: NOW - DAY / 2 }], scale, { now: NOW, running: true });
  assert.ok(r.w > 40 && r.w <= 50);
});

test('segmentRects does not extend a non-running current segment', () => {
  const scale = TS.createScale({ start: NOW - DAY, end: NOW, width: 100 });
  const [r] = TS.segmentRects([{ stage: 'Dev', state: 'current', estimated: false, start: NOW - DAY / 2, end: NOW - DAY / 2 }], scale, { now: NOW, running: false });
  assert.equal(r.w, TS.MIN_BAR_PX);
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
  assert.ok(out[0].w >= TS.MIN_BAR_PX);
});

test('segmentRects keeps a min-width bar inside the track at the right edge', () => {
  const scale = TS.createScale({ start: NOW - DAY, end: NOW, width: 100 });
  const [r] = TS.segmentRects([{ stage: 'QA', state: 'past', estimated: true, start: NOW, end: NOW }], scale, { now: NOW, running: false });
  assert.ok(r.x + r.w <= 100 + 0.001);
});

test('segmentRects ignores segments with non-numeric timestamps', () => {
  const scale = TS.createScale({ start: NOW - DAY, end: NOW, width: 100 });
  const out = TS.segmentRects([{ stage: 'Spec', state: 'past', start: null, end: null }], scale, { now: NOW, running: false });
  assert.deepEqual(out, []);
});

test('segmentRects never stretches an estimated current segment to now', () => {
  // Regression: the estimated-only ticket rendered one hatched bar spanning the
  // whole window, because a zero-duration marker was being grown to `now`.
  const scale = TS.createScale({ start: NOW - DAY, end: NOW, width: 100 });
  const [r] = TS.segmentRects(
    [{ stage: 'Dev', state: 'current', estimated: true, start: NOW - DAY / 2, end: NOW - DAY / 2 }],
    scale, { now: NOW, running: true });
  assert.equal(r.w, TS.MIN_BAR_PX);
  assert.equal(r.clipped, false);
});

test('segmentRects output is self-describing so callers need not index back into the input', () => {
  const scale = TS.createScale({ start: NOW - DAY, end: NOW, width: 100 });
  const out = TS.segmentRects([
    { stage: 'Spec', state: 'past', estimated: false, start: NOW - 90 * DAY, end: NOW - 89 * DAY, round: null, durationLabel: '1h 0m', tokensLabel: '5/1' },
    { stage: 'Dev', state: 'current', estimated: false, start: NOW - DAY / 2, end: NOW - DAY / 4, round: 2, durationLabel: '6h 0m', tokensLabel: '9/2' },
  ], scale, { now: NOW, running: false });
  // The first segment is outside the window and dropped, so index 0 of the
  // result is the Dev segment — it must carry its own labels.
  assert.equal(out.length, 1);
  assert.equal(out[0].stage, 'Dev');
  assert.equal(out[0].round, 2);
  assert.equal(out[0].durationLabel, '6h 0m');
  assert.equal(out[0].tokensLabel, '9/2');
  assert.equal(out[0].state, 'current');
});

// --- DST: gridlines must stay on the LOCAL grid across a transition. ---
// These only mean anything in a zone that observes DST; the suite pins TZ so
// the assertions are deterministic wherever it runs.
const dstTest = (name, fn) => test(name, () => {
  const prev = process.env.TZ;
  process.env.TZ = 'America/New_York';
  try { fn(); } finally {
    if (prev === undefined) delete process.env.TZ; else process.env.TZ = prev;
  }
});

dstTest('ticks keep day steps on local midnight across spring-forward', () => {
  const a = Date.parse('2026-03-05T12:00:00-05:00');
  const b = Date.parse('2026-03-12T12:00:00-04:00');
  // Guard against a vacuous pass: this only tests anything if the process
  // really is in a zone whose offset changes inside the window.
  assert.notEqual(new Date(a).getTimezoneOffset(), new Date(b).getTimezoneOffset(),
    'TZ override did not take effect — the DST assertions would be vacuous');
  const out = TS.ticks(a, b, 900);
  assert.ok(out.length >= 5);
  for (const tick of out) {
    const d = new Date(tick.t);
    assert.equal(d.getHours(), 0, `tick ${d.toString()} is not local midnight`);
    assert.equal(d.getMinutes(), 0);
  }
});

dstTest('ticks keep day steps on local midnight across fall-back', () => {
  const a = Date.parse('2026-10-29T12:00:00-04:00');
  const b = Date.parse('2026-11-05T12:00:00-05:00');
  const out = TS.ticks(a, b, 900);
  assert.ok(out.length >= 5);
  for (const tick of out) {
    assert.equal(new Date(tick.t).getHours(), 0, 'tick is not local midnight');
  }
});

dstTest('sub-day steps still mark every local midnight major across a transition', () => {
  const a = Date.parse('2026-03-07T12:00:00-05:00');
  const b = Date.parse('2026-03-09T12:00:00-04:00');
  const out = TS.ticks(a, b, 900);
  const majors = out.filter((t) => t.major).map((t) => new Date(t.t).getDate());
  // Both Mar 8 (the transition day) and Mar 9 must get their midnight rule.
  assert.deepEqual(majors, [8, 9]);
  for (const tick of out) assert.equal(new Date(tick.t).getMinutes(), 0);
});

dstTest('ticks terminates on a huge span without runaway iteration', () => {
  const out = TS.ticks(0, Date.UTC(2100, 0, 1), 900);
  assert.ok(out.length >= 2 && out.length <= 1000);
});

// --- Fit preset (phase 2 polish) ---

test("resolveDomain 'fit' pads the handed extent by 5% each side", () => {
  const d = TS.resolveDomain('fit', { dataStart: 0, dataEnd: 1000, now: NOW });
  assert.equal(d.start, -50);
  assert.equal(d.end, 1050);
});

test("'fit' pads more than 'all' over the same extent", () => {
  const fit = TS.resolveDomain('fit', { dataStart: 0, dataEnd: 1000, now: NOW });
  const all = TS.resolveDomain('all', { dataStart: 0, dataEnd: 1000, now: NOW });
  assert.ok((fit.end - fit.start) > (all.end - all.start));
});

test("'fit' over a single-instant extent still yields a non-zero span", () => {
  const d = TS.resolveDomain('fit', { dataStart: NOW, dataEnd: NOW, now: NOW });
  assert.ok(d.end > d.start);
});

test("'fit' ignores pan, like 'all' — both always fit their extent", () => {
  const a = TS.resolveDomain('fit', { dataStart: 0, dataEnd: 1000, now: NOW, panMs: 0 });
  const b = TS.resolveDomain('fit', { dataStart: 0, dataEnd: 1000, now: NOW, panMs: 99 * DAY });
  assert.deepEqual(a, b);
});

test('the preset list exposes fit first and names the empty-board fallback', () => {
  assert.equal(TS.ZOOM_PRESETS[0].id, 'fit');
  assert.equal(TS.DEFAULT_PRESET_ID, 'fit');
  assert.equal(TS.EMPTY_BOARD_PRESET_ID, 'week');
  assert.ok(TS.ZOOM_PRESETS.some((p) => p.id === TS.EMPTY_BOARD_PRESET_ID));
});

// --- Minimum bar width: a short stage must stay visible and clickable ---

test('a one-second segment on a month-wide domain still renders at least 3px, inside the track', () => {
  const scale = TS.createScale({ start: NOW - 30 * DAY, end: NOW, width: 900 });
  const [r] = TS.segmentRects(
    [{ stage: 'QA', state: 'past', estimated: false, start: NOW - 15 * DAY, end: NOW - 15 * DAY + 1000 }],
    scale, { now: NOW, running: false });
  assert.ok(r.w >= 3, `expected >= 3px, got ${r.w}`);
  assert.ok(r.x >= 0);
  assert.ok(r.x + r.w <= 900 + 0.001, 'bar escaped the right edge of the track');
});

test('a min-width bar at the very end of the domain is pulled inside the track', () => {
  const scale = TS.createScale({ start: NOW - 30 * DAY, end: NOW, width: 900 });
  const [r] = TS.segmentRects(
    [{ stage: 'PR', state: 'past', estimated: false, start: NOW, end: NOW }],
    scale, { now: NOW, running: false });
  assert.equal(r.w, TS.MIN_BAR_PX);
  assert.ok(r.x + r.w <= 900 + 0.001);
});
