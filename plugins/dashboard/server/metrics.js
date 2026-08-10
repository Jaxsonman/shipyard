'use strict';

// Matches `<!-- shipyard-metrics {...} -->` comment blocks embedded in ship
// pipeline comment bodies.
const METRICS_BLOCK_RE = /<!--\s*shipyard-metrics\s+(\{[\s\S]*?\})\s*-->/g;

const STAGE_ORDER = ['Spec', 'Plan', 'Dev', 'QA', 'Review'];

// Maps a metrics block's `stage` key to its display row label.
const STAGE_KEY_TO_LABEL = { spec: 'Spec', plan: 'Plan', dev: 'Dev', qa: 'QA', ship: 'Review' };

// Display-stage -> row index of the row that is "current" for that stage.
const CURRENT_STAGE_INDEX = {
  "Spec'd": 0,
  Planned: 1,
  Dev: 2,
  QA: 3,
  'Awaiting Review': 4,
  closed: 4,
};

// Fallback header patterns, checked against each comment body in order.
const FALLBACK_PATTERNS = [
  { label: 'Spec', test: (body) => body.startsWith('📋 Spec approved') },
  { label: 'Plan', test: (body) => body.startsWith('🗺️ Plan approved') },
  { label: 'Dev', test: (body) => /^ship:dev (round|standalone)/.test(body.split('\n')[0]) },
  { label: 'QA', test: (body) => /^ship:qa verdict /.test(body.split('\n')[0]) },
  { label: 'Review', test: (body) => /^ship:review-packet /.test(body.split('\n')[0]) },
];

/**
 * Extracts all valid shipyard-metrics blocks from a list of comments.
 * Invalid JSON or blocks missing required fields (stage, started, finished)
 * are skipped silently. Order matches comment order.
 * @param {Array<{body: string, createdAt: string}>} comments
 * @returns {Array<{stage: string, started: string, finished: string, tokens_in?: number, tokens_out?: number}>}
 */
function parseMetrics(comments) {
  const out = [];
  for (const comment of comments || []) {
    const body = comment && typeof comment.body === 'string' ? comment.body : '';
    let match;
    METRICS_BLOCK_RE.lastIndex = 0;
    while ((match = METRICS_BLOCK_RE.exec(body)) !== null) {
      let parsed;
      try {
        parsed = JSON.parse(match[1]);
      } catch (err) {
        continue;
      }
      if (!parsed || !parsed.stage || !parsed.started || !parsed.finished) continue;
      const entry = { stage: parsed.stage, started: parsed.started, finished: parsed.finished };
      if (typeof parsed.tokens_in === 'number') entry.tokens_in = parsed.tokens_in;
      if (typeof parsed.tokens_out === 'number') entry.tokens_out = parsed.tokens_out;
      out.push(entry);
    }
  }
  return out;
}

/** 420000 -> "420K", 1500000 -> "1.5M", below 1000 verbatim. */
function formatTokens(n) {
  if (n >= 1000000) {
    const v = n / 1000000;
    return (Number.isInteger(v) ? String(v) : v.toFixed(1)) + 'M';
  }
  if (n >= 1000) {
    const v = n / 1000;
    return (Number.isInteger(v) ? String(v) : v.toFixed(1)) + 'K';
  }
  return String(n);
}

/** ms -> "Xh Ym", "Ym" under an hour, "<1m" under a minute. */
function formatDuration(ms) {
  const totalMinutes = Math.floor(ms / 60000);
  if (totalMinutes < 1) return '<1m';
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours < 1) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

/**
 * Builds the pipeline Gantt timeline: one row per stage in
 * ["Spec","Plan","Dev","QA","Review"] order.
 * @param {Array<{body: string, createdAt: string}>} comments
 * @param {string} currentStage display stage name (e.g. "Dev")
 * @returns {Array<{stage: string, label: string, startPct: number, widthPct: number, stat: string, state: 'past'|'current'|'future'}>}
 */
function buildTimeline(comments, currentStage) {
  const list = comments || [];
  const metrics = parseMetrics(list);

  // Aggregate metrics blocks per row label: earliest start, latest finish,
  // summed tokens.
  const agg = {};
  for (const m of metrics) {
    const label = STAGE_KEY_TO_LABEL[m.stage];
    if (!label) continue; // unknown stage key
    const startedTime = Date.parse(m.started);
    const finishedTime = Date.parse(m.finished);
    if (Number.isNaN(startedTime) || Number.isNaN(finishedTime)) continue;
    if (!agg[label]) {
      agg[label] = { start: startedTime, end: finishedTime, tokensIn: 0, tokensOut: 0, hasIn: false, hasOut: false };
    }
    const a = agg[label];
    a.start = Math.min(a.start, startedTime);
    a.end = Math.max(a.end, finishedTime);
    if (typeof m.tokens_in === 'number') {
      a.tokensIn += m.tokens_in;
      a.hasIn = true;
    }
    if (typeof m.tokens_out === 'number') {
      a.tokensOut += m.tokens_out;
      a.hasOut = true;
    }
  }

  // Fallback from comment header timestamps: only for rows without metrics
  // data, first matching comment wins (comments are processed in order).
  const fallback = {};
  for (const comment of list) {
    const body = comment && typeof comment.body === 'string' ? comment.body : '';
    for (const pattern of FALLBACK_PATTERNS) {
      if (agg[pattern.label] || fallback[pattern.label] !== undefined) continue;
      if (pattern.test(body)) {
        const t = Date.parse(comment.createdAt);
        if (!Number.isNaN(t)) fallback[pattern.label] = t;
      }
    }
  }

  // Resolve per-row data: {start, end, hasData, metrics?}
  const rowsData = {};
  for (const label of STAGE_ORDER) {
    if (agg[label]) {
      rowsData[label] = { start: agg[label].start, end: agg[label].end, hasData: true, metrics: agg[label] };
    } else if (fallback[label] !== undefined) {
      rowsData[label] = { start: fallback[label], end: fallback[label], hasData: true };
    } else {
      rowsData[label] = { hasData: false };
    }
  }

  // Resolve current-row index.
  let currentIndex;
  if (currentStage === 'Backlog') {
    currentIndex = -1;
  } else if (currentStage === 'Needs Human') {
    currentIndex = -1;
    for (let i = STAGE_ORDER.length - 1; i >= 0; i--) {
      if (rowsData[STAGE_ORDER[i]].hasData) {
        currentIndex = i;
        break;
      }
    }
  } else if (Object.prototype.hasOwnProperty.call(CURRENT_STAGE_INDEX, currentStage)) {
    currentIndex = CURRENT_STAGE_INDEX[currentStage];
  } else {
    currentIndex = -1;
  }

  // Global window: min start / max end across all rows with data.
  let windowStart = 0;
  let windowEnd = 0;
  let first = true;
  for (const label of STAGE_ORDER) {
    const rd = rowsData[label];
    if (!rd.hasData) continue;
    if (first) {
      windowStart = rd.start;
      windowEnd = rd.end;
      first = false;
    } else {
      windowStart = Math.min(windowStart, rd.start);
      windowEnd = Math.max(windowEnd, rd.end);
    }
  }
  const windowDuration = windowEnd - windowStart;

  return STAGE_ORDER.map((label, idx) => {
    const state = idx < currentIndex ? 'past' : idx === currentIndex ? 'current' : 'future';
    const rd = rowsData[label];
    let startPct = 0;
    let widthPct = 0;
    let stat = '';

    if (rd.hasData) {
      if (windowDuration === 0) {
        startPct = 0;
        widthPct = 100;
      } else {
        startPct = ((rd.start - windowStart) / windowDuration) * 100;
        widthPct = ((rd.end - rd.start) / windowDuration) * 100;
        if (rd.end === rd.start) widthPct = Math.max(widthPct, 2);
      }
      if (rd.metrics) {
        stat = formatDuration(rd.end - rd.start);
        if (rd.metrics.hasIn || rd.metrics.hasOut) {
          stat += ` · ${formatTokens(rd.metrics.tokensIn)}/${formatTokens(rd.metrics.tokensOut)}`;
        }
      }
    }

    return { stage: label, label, startPct, widthPct, stat, state };
  });
}

module.exports = { parseMetrics, buildTimeline, formatTokens, formatDuration };
