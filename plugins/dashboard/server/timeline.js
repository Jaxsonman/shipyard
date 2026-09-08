'use strict';

// Board-wide timeline model. Pure: no I/O, no `gh`, no clock reads beyond the
// `now` handed in. All comment parsing comes from ./trail — this module never
// looks at a comment body.

const trail = require('./trail');
const board = require('./board');
const metrics = require('./metrics');

// Display stage (from board labels) -> the timeline row that is "current".
const CURRENT_STAGE_FOR = {
  "Spec'd": 'Spec',
  Planned: 'Plan',
  Dev: 'Dev',
  QA: 'QA',
  'Awaiting Review': 'Review',
  'PR Open': 'PR',
};

const RUNNING_STAGES = new Set(['Dev', 'QA']);

const DEFAULT_DOMAIN_MS = 7 * 24 * 3600 * 1000;

function labelsOf(ticket) {
  return Array.isArray(ticket.labels) ? ticket.labels : [];
}

function newestEscalation(escalations) {
  if (!escalations || !escalations.length) return null;
  let best = escalations[0];
  for (const e of escalations) {
    if (e.at >= best.at) best = e;
  }
  return { cause: best.cause, round: best.round, cap: best.cap };
}

/**
 * Builds one timeline row for a ticket.
 * @param {object} ticket board ticket detail (labels + comments + updatedAt)
 * @param {{projectId: string, projectName: string, now: number}} ctx
 */
function buildRow(ticket, ctx) {
  const projectId = ctx.projectId;
  const projectName = ctx.projectName;
  const stageInfo = board.stageFromLabels(labelsOf(ticket));
  const stage = stageInfo.stage;
  const t = trail.parseTrail(ticket.comments);

  // Which segment is "current"?
  let currentStage = CURRENT_STAGE_FOR[stage] || null;
  if (stage === 'Needs Human') {
    // The newest data-bearing segment is where the ticket stalled.
    currentStage = t.segments.length ? t.segments[t.segments.length - 1].stage : null;
  }
  const currentIndex = currentStage ? trail.STAGE_ORDER.indexOf(currentStage) : -1;

  let tokensIn = 0;
  let tokensOut = 0;
  const segments = t.segments.map((s) => {
    const idx = trail.STAGE_ORDER.indexOf(s.stage);
    let state = 'future';
    if (currentIndex >= 0) {
      if (idx < currentIndex) state = 'past';
      else if (idx === currentIndex) state = 'current';
    }
    if (typeof s.tokensIn === 'number') tokensIn += s.tokensIn;
    if (typeof s.tokensOut === 'number') tokensOut += s.tokensOut;
    const hasTokens = typeof s.tokensIn === 'number' || typeof s.tokensOut === 'number';
    return {
      stage: s.stage,
      round: s.round,
      start: s.start,
      end: s.end,
      estimated: s.estimated,
      state,
      tokensIn: s.tokensIn,
      tokensOut: s.tokensOut,
      durationLabel: s.estimated ? null : metrics.formatDuration(s.end - s.start),
      tokensLabel: hasTokens
        ? `${metrics.formatTokens(s.tokensIn || 0)}/${metrics.formatTokens(s.tokensOut || 0)}`
        : null,
    };
  });

  const running = RUNNING_STAGES.has(stage)
    && segments.length > 0
    && segments[segments.length - 1].stage === stage
    && segments[segments.length - 1].state === 'current';

  const updatedAt = Date.parse(ticket.updatedAt);
  const lastActivity = t.lastActivity !== null
    ? t.lastActivity
    : (Number.isNaN(updatedAt) ? ctx.now : updatedAt);

  return {
    id: `${projectId}#${ticket.number}`,
    project: projectId,
    projectName,
    number: ticket.number,
    title: ticket.title,
    url: ticket.url || null,
    assignee: Array.isArray(ticket.assignees) && ticket.assignees.length ? ticket.assignees[0].login : null,
    stage,
    conflict: !!stageInfo.conflict,
    backlog: stage === 'Backlog',
    // Only surfaced for Needs Human: a recovered ticket's old escalation is
    // history, and counting it would inflate the stats strip's cause tallies.
    escalation: stage === 'Needs Human' ? newestEscalation(t.escalations) : null,
    running,
    lastActivity,
    tokensIn,
    tokensOut,
    segments,
  };
}

/**
 * Builds the whole board timeline: rows grouped by project (in `projects`
 * order), each group sorted by last activity descending, plus the global
 * time domain.
 * @param {{tickets: Array, projects: Array, now: number}} input
 */
function buildBoardTimeline(input) {
  const now = typeof input.now === 'number' ? input.now : Date.now();
  const projects = input.projects || [];
  const tickets = input.tickets || [];

  const byId = new Map();
  for (const p of projects) byId.set(p.id, p);

  const rows = tickets.map((ticket) => {
    const projectId = ticket.project;
    const p = byId.get(projectId);
    return buildRow(ticket, {
      projectId,
      projectName: p ? p.name : projectId,
      now,
    });
  });

  // Group in `projects` order; unknown projects trail in first-seen order.
  const order = [];
  const seen = new Set();
  for (const p of projects) { order.push(p.id); seen.add(p.id); }
  for (const r of rows) {
    if (!seen.has(r.project)) { order.push(r.project); seen.add(r.project); }
  }

  const grouped = [];
  const groups = [];
  for (const pid of order) {
    const inGroup = rows.filter((r) => r.project === pid);
    if (!inGroup.length) continue;
    inGroup.sort((a, b) => b.lastActivity - a.lastActivity);
    const p = byId.get(pid);
    groups.push({ projectId: pid, projectName: p ? p.name : pid, count: inGroup.length });
    for (const r of inGroup) grouped.push(r);
  }

  let start = null;
  let end = null;
  for (const r of grouped) {
    for (const s of r.segments) {
      if (start === null || s.start < start) start = s.start;
      if (end === null || s.end > end) end = s.end;
    }
  }
  if (start === null) {
    start = now - DEFAULT_DOMAIN_MS;
    end = now;
  } else {
    end = Math.max(end, now);
    if (end === start) end = start + DEFAULT_DOMAIN_MS;
  }

  return { now, domain: { start, end }, groups, rows: grouped };
}

module.exports = { buildRow, buildBoardTimeline, CURRENT_STAGE_FOR };
