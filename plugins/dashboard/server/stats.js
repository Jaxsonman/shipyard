'use strict';

// Pipeline stats for the strip above both views. Pure: it consumes the rows
// timeline.buildBoardTimeline() already produced, so the strip and the
// timeline can never disagree about what is on the board.

const trail = require('./trail');
const metrics = require('./metrics');

// Every display stage board.js can produce, in pipeline order. Kept here as
// one list so a rename cannot silently drop a column from the strip.
const STAGE_KEYS = ['Backlog', "Spec'd", 'Planned', 'Dev', 'QA', 'Awaiting Review', 'Needs Human'];

const THROUGHPUT_WINDOW_DAYS = 28;
const DAY_MS = 24 * 3600 * 1000;

/**
 * Linear-interpolated percentile over an ascending-sorted array.
 * @param {number[]} sorted ascending
 * @param {number} p 0..1
 * @returns {number|null} null for an empty sample
 */
function percentile(sorted, p) {
  if (!sorted || !sorted.length) return null;
  if (sorted.length === 1) return sorted[0];
  const rank = (sorted.length - 1) * p;
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (rank - lo);
}

/** Earliest moment a row can be said to have reached Awaiting Review, or null. */
function reachedReviewAt(row) {
  let at = null;
  for (const s of row.segments || []) {
    if (s.stage !== 'Review' && s.stage !== 'PR') continue;
    const t = s.estimated ? row.lastActivity : s.start;
    if (typeof t !== 'number') continue;
    if (at === null || t < at) at = t;
  }
  if (at === null && row.stage === 'Awaiting Review') at = row.lastActivity;
  return at;
}

/**
 * @param {{rows: Array, now: number}} input
 */
function buildStats(input) {
  const now = typeof input.now === 'number' ? input.now : Date.now();
  const rows = input.rows || [];

  const counts = {};
  for (const key of STAGE_KEYS) counts[key] = 0;

  const escalations = { unknown: 0 };
  for (const cause of trail.ESCALATION_CAUSES) escalations[cause] = 0;

  const durations = [];
  let tokensIn = 0;
  let tokensOut = 0;
  let reached = 0;
  const windowStart = now - THROUGHPUT_WINDOW_DAYS * DAY_MS;

  for (const row of rows) {
    if (Object.prototype.hasOwnProperty.call(counts, row.stage)) counts[row.stage] += 1;
    else counts[row.stage] = (counts[row.stage] || 0) + 1;

    if (row.escalation) {
      const cause = row.escalation.cause;
      if (cause && Object.prototype.hasOwnProperty.call(escalations, cause)) escalations[cause] += 1;
      else escalations.unknown += 1;
    }

    for (const s of row.segments || []) {
      // Estimated segments are zero-width markers, not measured durations.
      if (s.estimated) continue;
      const d = s.end - s.start;
      if (d > 0) durations.push(d);
    }

    tokensIn += row.tokensIn || 0;
    tokensOut += row.tokensOut || 0;

    const at = reachedReviewAt(row);
    if (at !== null && at >= windowStart && at <= now) reached += 1;
  }

  durations.sort((a, b) => a - b);
  const medianMs = percentile(durations, 0.5);
  const p90Ms = percentile(durations, 0.9);
  const perWeek = Math.round((reached / (THROUGHPUT_WINDOW_DAYS / 7)) * 10) / 10;

  return {
    counts,
    stageDuration: {
      medianMs,
      p90Ms,
      samples: durations.length,
      medianLabel: medianMs === null ? null : metrics.formatDuration(medianMs),
      p90Label: p90Ms === null ? null : metrics.formatDuration(p90Ms),
    },
    tokens: {
      in: tokensIn,
      out: tokensOut,
      inLabel: metrics.formatTokens(tokensIn),
      outLabel: metrics.formatTokens(tokensOut),
    },
    throughput: { perWeek, reached, windowDays: THROUGHPUT_WINDOW_DAYS },
    escalations,
  };
}

module.exports = { percentile, buildStats, STAGE_KEYS, THROUGHPUT_WINDOW_DAYS };
