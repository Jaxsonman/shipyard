'use strict';

// Pure time-scale math for the board-wide timeline. No DOM access lives here —
// that is what makes it unit-testable under `node --test`. The browser gets
// `window.TimelineScale`; Node gets `module.exports`.

var HOUR = 3600000;
var DAY = 24 * HOUR;

var STAGE_ROWS = ['Spec', 'Plan', 'Dev', 'QA', 'Review', 'PR'];

var ZOOM_PRESETS = [
  { id: 'day', label: 'Day', spanMs: DAY },
  { id: 'week', label: 'Week', spanMs: 7 * DAY },
  { id: 'month', label: 'Month', spanMs: 30 * DAY },
  { id: 'all', label: 'All', spanMs: null },
];

// Minimum gridline spacing in px. Steps are chosen so no two ticks sit closer.
var MIN_TICK_PX = 90;
var TICK_STEPS = [HOUR, 3 * HOUR, 6 * HOUR, 12 * HOUR, DAY, 2 * DAY, 7 * DAY, 14 * DAY,
  30 * DAY, 60 * DAY, 90 * DAY, 180 * DAY, 365 * DAY];

// Zero-duration (estimated) bars still need to be visible and hoverable.
var MIN_BAR_PX = 3;

function presetById(id) {
  for (var i = 0; i < ZOOM_PRESETS.length; i++) {
    if (ZOOM_PRESETS[i].id === id) return ZOOM_PRESETS[i];
  }
  return null;
}

/**
 * Clamps a pan offset so the visible window can never drift more than half a
 * window past either end of the data.
 */
function clampPan(panMs, spanMs, opts) {
  var o = opts || {};
  var now = typeof o.now === 'number' ? o.now : Date.now();
  var dataStart = typeof o.dataStart === 'number' ? o.dataStart : now - spanMs;
  var dataEnd = typeof o.dataEnd === 'number' ? o.dataEnd : now;
  if (!(spanMs > 0)) return 0;
  // Unpanned window is [now - spanMs, now]; panning shifts both ends by panMs.
  var minStart = dataStart - spanMs / 2;
  var maxEnd = Math.max(dataEnd, now) + spanMs / 2;
  var minPan = minStart - (now - spanMs);
  var maxPan = maxEnd - now;
  if (minPan > maxPan) return 0;
  if (panMs < minPan) return minPan;
  if (panMs > maxPan) return maxPan;
  return panMs;
}

/**
 * Resolves a zoom preset id plus a pan offset into a concrete [start, end]
 * domain. 'all' fits the data with a 2% margin on each side.
 */
function resolveDomain(presetId, opts) {
  var o = opts || {};
  var now = typeof o.now === 'number' ? o.now : Date.now();
  var dataStart = typeof o.dataStart === 'number' ? o.dataStart : now - 7 * DAY;
  var dataEnd = typeof o.dataEnd === 'number' ? o.dataEnd : now;
  var preset = presetById(presetId) || presetById('week');

  if (preset.spanMs === null) {
    var span = dataEnd - dataStart;
    if (!(span > 0)) span = DAY;
    var margin = span * 0.02;
    return { start: dataStart - margin, end: dataEnd + margin };
  }

  var panMs = clampPan(typeof o.panMs === 'number' ? o.panMs : 0, preset.spanMs, {
    now: now, dataStart: dataStart, dataEnd: dataEnd,
  });
  return { start: now - preset.spanMs + panMs, end: now + panMs };
}

/** Linear time -> pixel projection over a fixed track width. */
function createScale(opts) {
  var o = opts || {};
  var start = o.start;
  var end = o.end;
  var width = o.width || 0;
  var spanMs = end - start;
  var pxPerMs = spanMs > 0 && width > 0 ? width / spanMs : 0;
  return {
    start: start,
    end: end,
    width: width,
    spanMs: spanMs,
    pxPerMs: pxPerMs,
    toX: function (t) { return pxPerMs === 0 ? 0 : (t - start) * pxPerMs; },
    toTime: function (x) { return pxPerMs === 0 ? start : start + x / pxPerMs; },
  };
}

function fmtTime(t) {
  return new Date(t).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
}

function fmtDay(t) {
  return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function fmtMonth(t) {
  return new Date(t).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

function labelFor(t, step) {
  if (step < DAY) return fmtTime(t);
  if (step >= 60 * DAY) return fmtMonth(t);
  return fmtDay(t);
}

/**
 * Gridline positions across [start, end]. Picks the coarsest step that keeps
 * ticks at least MIN_TICK_PX apart, and always returns at least two.
 */
function ticks(start, end, width) {
  var span = end - start;
  if (!(span > 0) || !(width > 0)) {
    return [
      { t: start, label: fmtDay(start), major: true },
      { t: end, label: fmtDay(end), major: true },
    ];
  }
  var maxTicks = Math.max(2, Math.floor(width / MIN_TICK_PX));
  var step = 0;
  for (var i = 0; i < TICK_STEPS.length; i++) {
    if (span / TICK_STEPS[i] <= maxTicks) { step = TICK_STEPS[i]; break; }
  }
  if (step === 0) {
    // Span outruns the ladder — round the coarsest step up to a whole multiple.
    var coarsest = TICK_STEPS[TICK_STEPS.length - 1];
    step = coarsest * Math.ceil(span / maxTicks / coarsest);
  }
  var subDay = step < DAY;
  var out = [];
  // Align to the step grid in local time so day steps land on midnight.
  var offset = new Date(start).getTimezoneOffset() * 60000;
  var first = Math.ceil((start - offset) / step) * step + offset;
  for (var t = first; t <= end; t += step) {
    var d = new Date(t);
    var major = subDay ? d.getHours() === 0 : d.getDate() === 1;
    out.push({ t: t, label: labelFor(t, step), major: major });
  }
  if (out.length < 2) {
    out = [
      { t: start, label: labelFor(start, step), major: true },
      { t: end, label: labelFor(end, step), major: true },
    ];
  }
  return out;
}

/**
 * Projects stage segments onto pixel rects, clipping to the visible window.
 * The current segment of a running row is extended to `now`.
 */
function segmentRects(segments, scale, opts) {
  var o = opts || {};
  var now = typeof o.now === 'number' ? o.now : Date.now();
  var running = !!o.running;
  var out = [];
  var list = segments || [];

  for (var i = 0; i < list.length; i++) {
    var seg = list[i];
    var start = seg.start;
    var end = seg.end;
    if (typeof start !== 'number' || typeof end !== 'number') continue;
    if (running && seg.state === 'current' && now > end) end = now;
    if (end < start) end = start;

    if (end < scale.start || start > scale.end) continue;

    var clipped = start < scale.start || end > scale.end;
    var vStart = Math.max(start, scale.start);
    var vEnd = Math.min(end, scale.end);
    var x = scale.toX(vStart);
    var w = scale.toX(vEnd) - x;
    if (w < MIN_BAR_PX) w = MIN_BAR_PX;
    if (x + w > scale.width) x = Math.max(0, scale.width - w);

    out.push({
      stage: seg.stage,
      round: seg.round === undefined ? null : seg.round,
      estimated: !!seg.estimated,
      state: seg.state,
      x: x,
      w: w,
      start: seg.start,
      end: end,
      tokensIn: seg.tokensIn === undefined ? null : seg.tokensIn,
      tokensOut: seg.tokensOut === undefined ? null : seg.tokensOut,
      durationLabel: seg.durationLabel || null,
      tokensLabel: seg.tokensLabel || null,
      clipped: clipped,
    });
  }
  return out;
}

var TimelineScale = {
  ZOOM_PRESETS: ZOOM_PRESETS,
  STAGE_ROWS: STAGE_ROWS,
  MIN_BAR_PX: MIN_BAR_PX,
  resolveDomain: resolveDomain,
  clampPan: clampPan,
  createScale: createScale,
  ticks: ticks,
  segmentRects: segmentRects,
};

if (typeof module !== 'undefined' && module.exports) module.exports = TimelineScale;
if (typeof window !== 'undefined') window.TimelineScale = TimelineScale;
