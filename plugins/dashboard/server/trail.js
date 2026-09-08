'use strict';

// The single boundary where comment bodies are parsed into stage segments,
// escalations, and metrics blocks. Phase 2 swaps these internals for the
// vendored scripts/board-trail.js; the exported signatures below are frozen.

// Matches `<!-- shipyard-metrics {...} -->` comment blocks embedded in ship
// pipeline comment bodies.
const METRICS_BLOCK_RE = /<!--\s*shipyard-metrics\s+(\{[\s\S]*?\})\s*-->/g;

const STAGE_ORDER = ['Spec', 'Plan', 'Dev', 'QA', 'Review', 'PR'];

// Maps a metrics block's `stage` key to its display row label.
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

/**
 * Extracts all valid shipyard-metrics blocks from a list of comments.
 * Invalid JSON or blocks missing required fields (stage, started, finished)
 * are skipped silently. Order matches comment order.
 * @param {Array<{body: string, createdAt: string}>} comments
 * @returns {Array<{stage: string, started: string, finished: string, tokens_in?: number, tokens_out?: number}>}
 */
function parseMetricsBlocks(comments) {
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

/**
 * Scans the first line of each comment against HEADER_PATTERNS, returning
 * every match (not first-per-stage — callers reduce).
 * @param {Array<{body: string, createdAt: string}>} comments
 * @returns {Array<{stage: string, round: number|null, at: number}>}
 */
function parseStageEvents(comments) {
  const out = [];
  for (const comment of comments || []) {
    const body = comment && typeof comment.body === 'string' ? comment.body : '';
    const firstLine = body.split('\n')[0];
    const at = Date.parse(comment && comment.createdAt);
    if (Number.isNaN(at)) continue;
    for (const pattern of HEADER_PATTERNS) {
      const m = firstLine.match(pattern.re);
      if (!m) continue;
      const round = Number(m[1]) || null;
      out.push({ stage: pattern.stage, round, at });
    }
  }
  return out;
}

/**
 * Reads escalation headers from the first line of each comment.
 * @param {Array<{body: string, createdAt: string}>} comments
 * @returns {Array<{cause: string|null, round: number|null, cap: number|null, at: number}>}
 */
function parseEscalations(comments) {
  const out = [];
  for (const comment of comments || []) {
    const body = comment && typeof comment.body === 'string' ? comment.body : '';
    const firstLine = body.split('\n')[0];
    const at = Date.parse(comment && comment.createdAt);
    if (Number.isNaN(at)) continue;
    const m = firstLine.match(ESCALATION_RE);
    if (m) {
      out.push({ cause: m[1], round: Number(m[2]), cap: Number(m[3]), at });
    } else if (ANY_ESCALATION_RE.test(firstLine)) {
      out.push({ cause: null, round: null, cap: null, at });
    }
  }
  return out;
}

/**
 * Composes parseMetricsBlocks/parseStageEvents/parseEscalations into one
 * normalized trail: per-stage segments (ordered by STAGE_ORDER), escalations
 * (comment order), and the newest comment timestamp.
 * @param {Array<{body: string, createdAt: string}>} comments
 * @returns {{segments: Array, escalations: Array, lastActivity: number|null}}
 */
function parseTrail(comments) {
  const list = comments || [];
  const metrics = parseMetricsBlocks(list);
  const stageEvents = parseStageEvents(list);
  const escalations = parseEscalations(list);

  // Aggregate metrics blocks per label: earliest start, latest finish,
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

  // Max round seen per label from co-located stage events.
  const maxRound = {};
  for (const ev of stageEvents) {
    if (ev.round == null) continue;
    if (maxRound[ev.stage] == null || ev.round > maxRound[ev.stage]) maxRound[ev.stage] = ev.round;
  }

  // Fallback stage events: earliest matching event, for labels with no metrics.
  const fallback = {};
  for (const ev of stageEvents) {
    if (fallback[ev.stage] === undefined || ev.at < fallback[ev.stage]) {
      fallback[ev.stage] = ev.at;
    }
  }

  const segments = [];
  for (const label of STAGE_ORDER) {
    if (agg[label]) {
      const a = agg[label];
      segments.push({
        stage: label,
        round: maxRound[label] != null ? maxRound[label] : null,
        start: a.start,
        end: a.end,
        tokensIn: a.hasIn ? a.tokensIn : null,
        tokensOut: a.hasOut ? a.tokensOut : null,
        estimated: false,
      });
    } else if (fallback[label] !== undefined) {
      segments.push({
        stage: label,
        round: maxRound[label] != null ? maxRound[label] : null,
        start: fallback[label],
        end: fallback[label],
        tokensIn: null,
        tokensOut: null,
        estimated: true,
      });
    }
  }

  let lastActivity = null;
  for (const comment of list) {
    const at = Date.parse(comment && comment.createdAt);
    if (Number.isNaN(at)) continue;
    if (lastActivity === null || at > lastActivity) lastActivity = at;
  }

  return { segments, escalations, lastActivity };
}

module.exports = {
  STAGE_ORDER,
  STAGE_KEY_TO_LABEL,
  ESCALATION_CAUSES,
  parseMetricsBlocks,
  parseStageEvents,
  parseEscalations,
  parseTrail,
};
