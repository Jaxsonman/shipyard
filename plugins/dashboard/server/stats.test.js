'use strict';
const test = require('node:test');
const assert = require('node:assert');
const stats = require('./stats');

const NOW = Date.parse('2026-08-12T00:00:00Z');
const HOUR = 3600e3;
const DAY = 24 * HOUR;

test('percentile interpolates and handles the degenerate cases', () => {
  assert.equal(stats.percentile([], 0.5), null);
  assert.equal(stats.percentile([5], 0.9), 5);
  assert.equal(stats.percentile([1, 2, 3, 4], 0.5), 2.5);
  assert.equal(stats.percentile([10, 20, 30, 40, 50], 0.9), 46);
});

const row = (over) => Object.assign({
  id: 'core#1', project: 'core', stage: 'Dev', backlog: false, escalation: null,
  lastActivity: NOW - DAY, tokensIn: 0, tokensOut: 0, segments: [],
}, over);

test('buildStats counts every stage key even when empty', () => {
  const out = stats.buildStats({ now: NOW, rows: [row({ stage: 'Dev' })] });
  assert.equal(out.counts.Dev, 1);
  assert.equal(out.counts.Backlog, 0);
  assert.equal(out.counts['Needs Human'], 0);
  assert.equal(out.counts["Spec'd"], 0);
});

test('buildStats ignores estimated segments when timing stages', () => {
  const out = stats.buildStats({ now: NOW, rows: [row({
    segments: [
      { stage: 'Spec', start: NOW - 4 * HOUR, end: NOW - 3 * HOUR, estimated: false, tokensIn: 5, tokensOut: 1 },
      { stage: 'Plan', start: NOW - 2 * HOUR, end: NOW - 2 * HOUR, estimated: true, tokensIn: null, tokensOut: null },
    ], tokensIn: 5, tokensOut: 1 }) ] });
  assert.equal(out.stageDuration.samples, 1);
  assert.equal(out.stageDuration.medianMs, HOUR);
  assert.equal(out.stageDuration.medianLabel, '1h 0m');
  assert.equal(out.tokens.in, 5);
  assert.equal(out.tokens.out, 1);
});

test('buildStats tallies escalation causes, unknown included', () => {
  const out = stats.buildStats({ now: NOW, rows: [
    row({ stage: 'Needs Human', escalation: { cause: 'cap', round: 3, cap: 3 } }),
    row({ stage: 'Needs Human', escalation: { cause: 'cap', round: 2, cap: 3 } }),
    row({ stage: 'Needs Human', escalation: { cause: null, round: null, cap: null } }),
  ] });
  assert.equal(out.escalations.cap, 2);
  assert.equal(out.escalations.unknown, 1);
  assert.equal(out.escalations.static, 0);
  assert.equal(out.escalations['stage-error'], 0);
  assert.equal(out.escalations.reconcile, 0);
});

test('buildStats throughput counts only tickets reaching review inside the window', () => {
  const out = stats.buildStats({ now: NOW, rows: [
    row({ stage: 'Awaiting Review', segments: [{ stage: 'Review', start: NOW - 2 * DAY, end: NOW - 2 * DAY + HOUR, estimated: false, tokensIn: 0, tokensOut: 0 }] }),
    row({ stage: 'Awaiting Review', segments: [{ stage: 'Review', start: NOW - 60 * DAY, end: NOW - 60 * DAY + HOUR, estimated: false, tokensIn: 0, tokensOut: 0 }] }),
  ] });
  assert.equal(out.throughput.reached, 1);
  assert.equal(out.throughput.windowDays, 28);
  assert.equal(out.throughput.perWeek, 0.3);
});

test('buildStats does not count a stale Review segment just because the row got a recent comment', () => {
  // The Review segment itself is 130 days old — well outside the 28-day
  // throughput window — but the row's lastActivity is 1 day old (some
  // unrelated recent comment). Throughput must key off the segment's own
  // start, never substitute row.lastActivity for it.
  const out = stats.buildStats({ now: NOW, rows: [
    row({
      stage: 'Awaiting Review',
      lastActivity: NOW - DAY,
      segments: [{ stage: 'Review', start: NOW - 130 * DAY, end: NOW - 130 * DAY + HOUR, estimated: false, tokensIn: 0, tokensOut: 0 }],
    }),
  ] });
  assert.equal(out.throughput.reached, 0);
});

test('buildStats counts an Awaiting Review ticket with no Review segment as reached', () => {
  const out = stats.buildStats({ now: NOW, rows: [row({ stage: 'Awaiting Review', lastActivity: NOW - DAY })] });
  assert.equal(out.throughput.reached, 1);
});

test('buildStats on an empty board returns nulls, not NaN', () => {
  const out = stats.buildStats({ now: NOW, rows: [] });
  assert.equal(out.stageDuration.medianMs, null);
  assert.equal(out.stageDuration.p90Ms, null);
  assert.equal(out.stageDuration.medianLabel, null);
  assert.equal(out.tokens.in, 0);
  assert.equal(out.tokens.out, 0);
  assert.equal(out.throughput.perWeek, 0);
});
