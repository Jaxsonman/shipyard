'use strict';

// Pipeline stats for the strip above both views. Pure: it consumes the rows
// timeline.buildBoardTimeline() already produced, so the strip and the
// timeline can never disagree about what is on the board.
//
// Dual-mode like timeline-scale.js: no `require` of server modules, so the
// browser can load this file directly. `server/stats.js` re-exports it
// unchanged so server code and the browser share one implementation.

// Duplicated from server/trail.js (ESCALATION_CAUSES) and server/metrics.js
// (formatTokens/formatDuration) — small, stable, and the alternative is the
// browser loading server code, which this module intentionally avoids.
var ESCALATION_CAUSES = ['cap', 'static', 'stage-error', 'reconcile'];

// Every display stage board.js can produce, in pipeline order. Kept here as
// one list so a rename cannot silently drop a column from the strip.
var STAGE_KEYS = ['Backlog', "Spec'd", 'Planned', 'Dev', 'QA', 'Awaiting Review', 'Approved', 'PR Open', 'Needs Human'];

var THROUGHPUT_WINDOW_DAYS = 28;
var DAY_MS = 24 * 3600 * 1000;

/** 420000 -> "420K", 1500000 -> "1.5M", below 1000 verbatim. */
function formatTokens(n) {
  if (n >= 1000000) {
    var v = n / 1000000;
    return (Number.isInteger(v) ? String(v) : v.toFixed(1)) + 'M';
  }
  if (n >= 1000) {
    var v2 = n / 1000;
    return (Number.isInteger(v2) ? String(v2) : v2.toFixed(1)) + 'K';
  }
  return String(n);
}

/**
 * ms -> a human duration in three bands. Stage durations span minutes (a spec
 * approval) to weeks (a ticket parked in QA), and "502h 30m" is unreadable at
 * the top of that range — so at a day or more we switch to days plus hours and
 * drop minutes, which are noise at that scale.
 *   >= 24h -> "20d 22h"   >= 1h -> "3h 5m"   < 1h -> "42m"   < 1m -> "<1m"
 */
function formatDuration(ms) {
  var totalMinutes = Math.floor(ms / 60000);
  if (totalMinutes < 1) return '<1m';
  var totalHours = Math.floor(totalMinutes / 60);
  if (totalHours >= 24) {
    var days = Math.floor(totalHours / 24);
    return days + 'd ' + (totalHours % 24) + 'h';
  }
  if (totalHours < 1) return totalMinutes + 'm';
  return totalHours + 'h ' + (totalMinutes % 60) + 'm';
}

/**
 * Linear-interpolated percentile over an ascending-sorted array.
 * @param {number[]} sorted ascending
 * @param {number} p 0..1
 * @returns {number|null} null for an empty sample
 */
function percentile(sorted, p) {
  if (!sorted || !sorted.length) return null;
  if (sorted.length === 1) return sorted[0];
  var rank = (sorted.length - 1) * p;
  var lo = Math.floor(rank);
  var hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (rank - lo);
}

/**
 * Earliest moment a row can be said to have reached Awaiting Review, or
 * null. Always uses the segment's own `start` — never a substitute like
 * `row.lastActivity` — so a stale review packet that merely got a recent
 * comment does not count as freshly reached.
 */
function reachedReviewAt(row) {
  var at = null;
  var segments = row.segments || [];
  for (var i = 0; i < segments.length; i++) {
    var s = segments[i];
    if (s.stage !== 'Review' && s.stage !== 'PR') continue;
    var t = s.start;
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
  var now = typeof input.now === 'number' ? input.now : Date.now();
  var rows = input.rows || [];

  var counts = {};
  for (var i = 0; i < STAGE_KEYS.length; i++) counts[STAGE_KEYS[i]] = 0;

  var escalations = { unknown: 0 };
  for (var j = 0; j < ESCALATION_CAUSES.length; j++) escalations[ESCALATION_CAUSES[j]] = 0;

  var durations = [];
  var tokensIn = 0;
  var tokensOut = 0;
  var reached = 0;
  var windowStart = now - THROUGHPUT_WINDOW_DAYS * DAY_MS;

  for (var k = 0; k < rows.length; k++) {
    var row = rows[k];
    if (Object.prototype.hasOwnProperty.call(counts, row.stage)) counts[row.stage] += 1;
    else counts[row.stage] = (counts[row.stage] || 0) + 1;

    if (row.escalation) {
      var cause = row.escalation.cause;
      if (cause && Object.prototype.hasOwnProperty.call(escalations, cause)) escalations[cause] += 1;
      else escalations.unknown += 1;
    }

    var segments = row.segments || [];
    for (var m = 0; m < segments.length; m++) {
      var s = segments[m];
      // Estimated segments are zero-width markers, not measured durations.
      if (s.estimated) continue;
      var d = s.end - s.start;
      if (d > 0) durations.push(d);
    }

    tokensIn += row.tokensIn || 0;
    tokensOut += row.tokensOut || 0;

    var at = reachedReviewAt(row);
    if (at !== null && at >= windowStart && at <= now) reached += 1;
  }

  durations.sort(function (a, b) { return a - b; });
  var medianMs = percentile(durations, 0.5);
  var p90Ms = percentile(durations, 0.9);
  var perWeek = Math.round((reached / (THROUGHPUT_WINDOW_DAYS / 7)) * 10) / 10;

  return {
    counts: counts,
    stageDuration: {
      medianMs: medianMs,
      p90Ms: p90Ms,
      samples: durations.length,
      medianLabel: medianMs === null ? null : formatDuration(medianMs),
      p90Label: p90Ms === null ? null : formatDuration(p90Ms),
    },
    tokens: {
      in: tokensIn,
      out: tokensOut,
      inLabel: formatTokens(tokensIn),
      outLabel: formatTokens(tokensOut),
    },
    throughput: { perWeek: perWeek, reached: reached, windowDays: THROUGHPUT_WINDOW_DAYS },
    escalations: escalations,
  };
}

var PipelineStats = {
  ESCALATION_CAUSES: ESCALATION_CAUSES,
  STAGE_KEYS: STAGE_KEYS,
  THROUGHPUT_WINDOW_DAYS: THROUGHPUT_WINDOW_DAYS,
  formatTokens: formatTokens,
  formatDuration: formatDuration,
  percentile: percentile,
  buildStats: buildStats,
};

if (typeof module !== 'undefined' && module.exports) module.exports = PipelineStats;
if (typeof window !== 'undefined') window.PipelineStats = PipelineStats;
