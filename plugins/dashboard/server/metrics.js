'use strict';

const trail = require('./trail');
// One implementation of the label formatters, shared with the browser: the
// timeline rows, tooltips, drawer stat labels and stats strip must all agree,
// and web/pipeline-stats.js is the dual-mode module the page already loads.
const { formatTokens, formatDuration } = require('../web/pipeline-stats.js');

// The drawer's per-ticket Gantt now mirrors trail.STAGE_ORDER exactly, so the
// PR stage the `pr` plugin opens is visible per ticket, not just board-wide.
const STAGE_ORDER = ['Spec', 'Plan', 'Dev', 'QA', 'Review', 'PR'];

// Display-stage -> row index of the row that is "current" for that stage
// (contract v1 §4 label ladder).
const CURRENT_STAGE_INDEX = {
  "Spec'd": 0,
  Planned: 1,
  Dev: 2,
  QA: 3,
  'Awaiting Review': 4,
  Approved: 4,
  'PR Open': 5,
  closed: 5,
};

// Thin re-export for back-compat: all comment parsing lives in trail.js now.
const parseMetrics = trail.parseMetricsBlocks;

/**
 * Builds the pipeline Gantt timeline: one row per stage in
 * ["Spec","Plan","Dev","QA","Review"] order.
 * @param {Array<{body: string, createdAt: string}>} comments
 * @param {string} currentStage display stage name (e.g. "Dev")
 * @param {{viewer: string|null, allow: string[]}} [trust] contract v1 §3 trust
 *   context. Required in real mode: without it the drawer would draw bars from
 *   comments the timeline view correctly refuses to trust, so a forged verdict
 *   would look like fact in the one place a human inspects a single ticket.
 *   Undefined only in --mock, whose fixtures carry no authorship.
 * @returns {Array<{stage: string, label: string, startPct: number, widthPct: number, stat: string, state: 'past'|'current'|'future'}>}
 */
function buildTimeline(comments, currentStage, trustCtx) {
  const list = comments || [];
  const t = trail.parseTrail(list, trustCtx);

  // Only the drawer's five rows; segments for other stages (e.g. PR) are
  // dropped here since this Gantt has no row for them.
  const rowsData = {};
  for (const label of STAGE_ORDER) {
    const seg = t.segments.find((s) => s.stage === label);
    if (!seg) {
      rowsData[label] = { hasData: false };
      continue;
    }
    rowsData[label] = {
      start: seg.start,
      end: seg.end,
      hasData: true,
      metrics: seg.estimated
        ? undefined
        : { tokensIn: seg.tokensIn || 0, tokensOut: seg.tokensOut || 0, hasIn: seg.tokensIn != null, hasOut: seg.tokensOut != null },
    };
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
