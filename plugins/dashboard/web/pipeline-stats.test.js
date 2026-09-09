'use strict';
const test = require('node:test');
const assert = require('node:assert');
const P = require('./pipeline-stats');

const MIN = 60000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// formatDuration is the single label helper behind the timeline row labels,
// bar tooltips, the drawer's stat column and the stats strip. Stage durations
// range from a two-minute spec approval to a ticket parked in QA for weeks, so
// it bands rather than showing "502h 30m".

test('formatDuration: under an hour shows whole minutes', () => {
  assert.equal(P.formatDuration(42 * MIN), '42m');
  assert.equal(P.formatDuration(MIN), '1m');
  assert.equal(P.formatDuration(59 * MIN + 59000), '59m');
});

test('formatDuration: an hour to a day shows hours and minutes', () => {
  assert.equal(P.formatDuration(HOUR), '1h 0m');
  assert.equal(P.formatDuration(3 * HOUR + 5 * MIN), '3h 5m');
  assert.equal(P.formatDuration(23 * HOUR + 59 * MIN), '23h 59m');
});

test('formatDuration: a day or more shows days and hours, dropping minutes', () => {
  assert.equal(P.formatDuration(DAY), '1d 0h');
  assert.equal(P.formatDuration(DAY + 30 * MIN), '1d 0h', 'minutes are noise at day scale');
  // The two labels that prompted this: 502h 30m and 254h 40m.
  assert.equal(P.formatDuration(502 * HOUR + 30 * MIN), '20d 22h');
  assert.equal(P.formatDuration(254 * HOUR + 40 * MIN), '10d 14h');
});

test('formatDuration: sub-minute and boundary values', () => {
  assert.equal(P.formatDuration(0), '<1m');
  assert.equal(P.formatDuration(30000), '<1m');
  // Exactly on each band edge.
  assert.equal(P.formatDuration(HOUR - 1), '59m');
  assert.equal(P.formatDuration(DAY - 1), '23h 59m');
});

test('formatTokens abbreviates at thousand and million scale', () => {
  assert.equal(P.formatTokens(999), '999');
  assert.equal(P.formatTokens(1000), '1K');
  assert.equal(P.formatTokens(420000), '420K');
  assert.equal(P.formatTokens(1500000), '1.5M');
});

test('the server and the browser share one formatter implementation', () => {
  // server/metrics.js re-exports these rather than keeping its own copy, so a
  // change here cannot leave the drawer's labels disagreeing with the strip's.
  const metrics = require('../server/metrics.js');
  assert.strictEqual(metrics.formatDuration, P.formatDuration);
  assert.strictEqual(metrics.formatTokens, P.formatTokens);
});
