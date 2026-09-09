'use strict';

// The single boundary where comment bodies are parsed into stage segments,
// escalations, and metrics blocks.
//
// Phase 2: this file is now a thin ADAPTER over the vendored shared parser
// (../scripts/board-trail.js, synced from shared/scripts/board-trail.js —
// never hand-edit the vendored copy; see plugins/dashboard/references/
// contract.md). The dashboard no longer owns its own comment-header
// grammar: every `ship:*`/legacy-emoji header and the `<!-- shipyard-metrics
// {...} -->` footer are recognised by board-trail.js's `parseEvents`, which
// also carries the contract's trust rule (an event's `trusted` flag). This
// file's job is just: shape `{ comments }` into the `issue` object
// `parseEvents` expects, drop untrusted events instead of acting on them,
// and fold the rest into the stage-segment / escalation shapes the rest of
// the dashboard (timeline.js, stats.js, metrics.js, server.js) already
// depends on. Those consumers need no changes — the exports below keep
// their phase-1 names and shapes.
//
// Trust and the no-opts legacy mode
// ----------------------------------
// `parseTrail(comments, opts)` enforces the contract's trust rule (§3): an
// event is trusted only when its author matches `opts.viewer` or appears in
// `opts.allow`. That is a **security boundary** — an untrusted event must
// never open a segment, contribute to an escalation, contribute tokens, or
// bump `lastActivity`.
//
// But `opts` is optional, and calling `parseTrail(comments)` with no second
// argument at all must keep working exactly as it did in phase 1, where
// there was no trust concept and no `author` field on fixture/test
// comments. Enforcing the real trust rule in that case (viewer null, allow
// empty) would make every event untrusted and silently empty every segment
// — breaking every phase-1 caller and fixture. So: **`opts` being
// absent/undefined is a legacy/no-trust-context mode that trusts every
// event.** Passing an explicit `{ viewer }` and/or `{ allow }` (even `{}`)
// opts into the real trust rule. Task 14 threads the real `viewer`/`allow`
// through every call site; until then, every existing call in this repo
// (timeline.js, stats.js, metrics.js, server.js) calls `parseTrail(list)`
// with no opts and keeps behaving as before.

const boardTrail = require('../scripts/board-trail.js');

const STAGE_ORDER = ['Spec', 'Plan', 'Dev', 'QA', 'Review', 'PR'];

// Maps a metrics footer's `stage` key to its display row label.
const STAGE_KEY_TO_LABEL = { spec: 'Spec', plan: 'Plan', dev: 'Dev', qa: 'QA', ship: 'Review', pr: 'PR' };

const ESCALATION_CAUSES = ['cap', 'static', 'stage-error', 'reconcile'];

// Maps a board-trail event `type` to the stage segment it opens. `metrics`
// events open no segment of their own — their token/timing numbers merge
// into whichever segment matches their own footer's `stage` key (see the
// `agg` loop in parseTrail below).
const EVENT_TYPE_TO_STAGE = {
  'spec-approved': 'Spec',
  'plan-approved': 'Plan',
  dev: 'Dev',
  'dev-escalation': 'Dev',
  'qa-verdict': 'QA',
  'review-packet': 'Review',
  'pr-opened': 'PR',
};

// The subset of event types that populate the ticket drawer's Logs tab —
// matches phase 1's `LOG_HEADER_RE = /^ship:(dev|qa|review-packet|escalation)/`.
// `dev-escalation` ("ship:dev escalation") satisfied that regex's `dev`
// alternative, so it's included here too; `metrics`, `pr-opened`,
// `spec-approved` and `plan-approved` were never matched by it.
const LOG_EVENT_TYPES = new Set(['dev', 'dev-escalation', 'qa-verdict', 'review-packet', 'escalation']);

function toIssue(comments) {
  return { comments: comments || [] };
}

/**
 * Extracts all valid shipyard-metrics footers from a list of comments, keyed
 * by whichever comment carries a recognised pipeline header (board-trail.js
 * ignores comments whose first line matches no header at all — same net
 * effect as phase 1 silently skipping non-conforming blocks). Invalid JSON
 * or footers missing required fields (stage, started, finished) are skipped.
 * @param {Array<{body: string, createdAt: string}>} comments
 * @returns {Array<{stage: string, started: string, finished: string, tokens_in?: number, tokens_out?: number}>}
 */
function parseMetricsBlocks(comments) {
  const events = boardTrail.parseEvents(toIssue(comments), {});
  const out = [];
  for (const ev of events) {
    const m = ev.metrics;
    if (!m || !m.stage || !m.started || !m.finished) continue;
    const entry = { stage: m.stage, started: m.started, finished: m.finished };
    if (typeof m.tokensIn === 'number') entry.tokens_in = m.tokensIn;
    if (typeof m.tokensOut === 'number') entry.tokens_out = m.tokensOut;
    out.push(entry);
  }
  return out;
}

/**
 * Every event that maps to a pipeline stage, one row per matched comment
 * (not first-per-stage — callers reduce).
 * @param {Array<{body: string, createdAt: string}>} comments
 * @returns {Array<{stage: string, round: number|null, at: number}>}
 */
function parseStageEvents(comments) {
  const events = boardTrail.parseEvents(toIssue(comments), {});
  const out = [];
  for (const ev of events) {
    const stage = EVENT_TYPE_TO_STAGE[ev.type];
    if (!stage) continue;
    const at = Date.parse(ev.createdAt);
    if (Number.isNaN(at)) continue;
    out.push({ stage, round: typeof ev.round === 'number' ? ev.round : null, at });
  }
  return out;
}

/**
 * Reads `ship:escalation` events (not `ship:dev escalation` — dev-escalation
 * feeds the Dev stage, matching phase 1's ESCALATION_RE which only matched
 * the `ship:escalation` prefix).
 * @param {Array<{body: string, createdAt: string}>} comments
 * @returns {Array<{cause: string|null, round: number|null, cap: number|null, at: number}>}
 */
function parseEscalations(comments) {
  const events = boardTrail.parseEvents(toIssue(comments), {});
  const out = [];
  for (const ev of events) {
    if (ev.type !== 'escalation') continue;
    const at = Date.parse(ev.createdAt);
    if (Number.isNaN(at)) continue;
    out.push({ cause: ev.cause, round: ev.round, cap: ev.cap, at });
  }
  return out;
}

/**
 * Composes board-trail.js's parseEvents into one normalized trail: per-stage
 * segments (ordered by STAGE_ORDER), escalations (comment order), the
 * newest trusted comment's timestamp, the dropped untrusted events, and the
 * newest trusted PR url.
 *
 * Trust is the security boundary: an event with `trusted !== true` is
 * dropped into `untrusted[]` and never opens a segment, feeds an
 * escalation, contributes tokens, or bumps `lastActivity`. See the
 * "no-opts legacy mode" note at the top of this file for what happens when
 * `opts` is omitted entirely.
 *
 * @param {Array<{body: string, createdAt: string, author?: {login: string}, url?: string}>} comments
 * @param {{viewer?: string|null, allow?: string[]}} [opts]
 * @returns {{segments: Array, escalations: Array, lastActivity: number|null, untrusted: Array, prUrl: string|null}}
 */
function parseTrail(comments, opts) {
  const list = comments || [];
  const legacyTrustAll = opts === undefined;
  const viewer = (opts && opts.viewer) || null;
  const allow = (opts && opts.allow) || [];

  const events = boardTrail.parseEvents(toIssue(list), { viewer, allow });
  if (legacyTrustAll) {
    for (const ev of events) ev.trusted = true;
  }

  const untrusted = events.filter((e) => e.trusted !== true);
  const usable = events.filter((e) => e.trusted === true);

  // Metrics aggregation: any trusted event carrying a footer (a stage
  // handoff comment with its own footer, or a standalone `ship:metrics`
  // comment) merges into the segment for the footer's own `stage` key —
  // earliest start, latest finish, summed tokens. Independent of whether
  // the event's own header fully conformed (a stage segment can still be
  // "known" from a loosely-matching header; see the fallback loop below).
  const agg = {};
  for (const ev of usable) {
    const m = ev.metrics;
    if (!m || !m.stage) continue;
    const label = STAGE_KEY_TO_LABEL[m.stage];
    if (!label) continue;
    const startedTime = Date.parse(m.started);
    const finishedTime = Date.parse(m.finished);
    if (Number.isNaN(startedTime) || Number.isNaN(finishedTime)) continue;
    if (!agg[label]) {
      agg[label] = { start: startedTime, end: finishedTime, tokensIn: 0, tokensOut: 0, hasIn: false, hasOut: false };
    }
    const a = agg[label];
    a.start = Math.min(a.start, startedTime);
    a.end = Math.max(a.end, finishedTime);
    if (typeof m.tokensIn === 'number') {
      a.tokensIn += m.tokensIn;
      a.hasIn = true;
    }
    if (typeof m.tokensOut === 'number') {
      a.tokensOut += m.tokensOut;
      a.hasOut = true;
    }
  }

  // Max round seen per label, and the earliest matching event (fallback for
  // labels with no metrics), from trusted events that map to a stage.
  const maxRound = {};
  const fallback = {};
  for (const ev of usable) {
    const label = EVENT_TYPE_TO_STAGE[ev.type];
    if (!label) continue;
    if (typeof ev.round === 'number') {
      if (maxRound[label] == null || ev.round > maxRound[label]) maxRound[label] = ev.round;
    }
    const at = Date.parse(ev.createdAt);
    if (Number.isNaN(at)) continue;
    if (fallback[label] === undefined || at < fallback[label]) fallback[label] = at;
  }

  // Newest trusted pr-opened event wins, consistent with board-trail's own
  // reconcile() latest-wins rule.
  let prUrl = null;
  let prAt = -Infinity;
  for (const ev of usable) {
    if (ev.type !== 'pr-opened' || !ev.prUrl) continue;
    const at = Date.parse(ev.createdAt);
    if (Number.isNaN(at)) continue;
    if (at >= prAt) {
      prAt = at;
      prUrl = ev.prUrl;
    }
  }

  const segments = [];
  for (const label of STAGE_ORDER) {
    let seg = null;
    if (agg[label]) {
      const a = agg[label];
      seg = {
        stage: label,
        round: maxRound[label] != null ? maxRound[label] : null,
        start: a.start,
        end: a.end,
        tokensIn: a.hasIn ? a.tokensIn : null,
        tokensOut: a.hasOut ? a.tokensOut : null,
        estimated: false,
      };
    } else if (fallback[label] !== undefined) {
      seg = {
        stage: label,
        round: maxRound[label] != null ? maxRound[label] : null,
        start: fallback[label],
        end: fallback[label],
        tokensIn: null,
        tokensOut: null,
        estimated: true,
      };
    }
    if (seg) {
      if (label === 'PR') seg.prUrl = prUrl;
      segments.push(seg);
    }
  }

  const escalations = [];
  for (const ev of usable) {
    if (ev.type !== 'escalation') continue;
    const at = Date.parse(ev.createdAt);
    if (Number.isNaN(at)) continue;
    escalations.push({ cause: ev.cause, round: ev.round, cap: ev.cap, at });
  }

  let lastActivity = null;
  for (const ev of usable) {
    const at = Date.parse(ev.createdAt);
    if (Number.isNaN(at)) continue;
    if (lastActivity === null || at > lastActivity) lastActivity = at;
  }

  return { segments, escalations, lastActivity, untrusted, prUrl };
}

/**
 * Extracts pipeline-log entries (the ticket drawer's Logs tab) from a list of
 * comments: only comments whose first line matches a ship: pipeline header
 * (dev/dev-escalation/qa/review-packet/escalation) are included. Derived
 * from board-trail.js's parsed events — `header` is the event's own `raw`
 * (its trimmed first line).
 *
 * `parseLogEntries` takes no trust-context opts (its signature is frozen
 * from phase 1), so — same as the no-opts legacy mode documented on
 * `parseTrail` above — every entry is produced as if trusted; the `trusted`
 * field is included so a future trust-aware caller (once this signature
 * grows an opts arg) has somewhere to put a real answer.
 * @param {Array<{body: string, createdAt: string}>} comments
 * @returns {Array<{header: string, body: string, at: number|null, trusted: boolean}>}
 */
function parseLogEntries(comments) {
  const list = comments || [];
  const events = boardTrail.parseEvents(toIssue(list), {});

  // Events are produced in comment order, skipping comments whose first
  // line matches no header at all — recompute that same filter over `list`
  // to zip each event back to its source comment for the body text (an
  // event only carries its raw first line, not the rest of the body).
  const matched = list.filter((c) => {
    const body = c && typeof c.body === 'string' ? c.body : '';
    const first = body.split('\n')[0].replace(/\r$/, '').trimEnd();
    return boardTrail.HEADERS.some((h) => h.re.test(first));
  });

  const out = [];
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    if (!LOG_EVENT_TYPES.has(ev.type)) continue;
    const comment = matched[i];
    const body = comment && typeof comment.body === 'string' ? comment.body : '';
    const firstNewline = body.indexOf('\n');
    const rest = firstNewline === -1 ? '' : body.slice(firstNewline + 1).replace(/^\n+/, '');
    const at = Date.parse(comment && comment.createdAt);
    out.push({ header: ev.raw, body: rest, at: Number.isNaN(at) ? null : at, trusted: true });
  }
  return out;
}

module.exports = {
  STAGE_ORDER,
  STAGE_KEY_TO_LABEL,
  ESCALATION_CAUSES,
  parseMetricsBlocks,
  parseStageEvents,
  parseEscalations,
  parseTrail,
  parseLogEntries,
};
