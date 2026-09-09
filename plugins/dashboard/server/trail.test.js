'use strict';
const test = require('node:test');
const assert = require('node:assert');
const trail = require('./trail');

const mk = (body, createdAt) => ({ body, createdAt });
const M = (o) => `<!-- shipyard-metrics ${JSON.stringify(o)} -->`;

test('parseMetricsBlocks skips invalid JSON and blocks missing required fields', () => {
  const out = trail.parseMetricsBlocks([
    mk('ship:dev round 1/3\n' + M({ stage: 'dev', started: '2026-08-10T14:00:00Z', finished: '2026-08-10T15:40:00Z', tokens_in: 420000, tokens_out: 38000 }), '2026-08-10T15:40:00Z'),
    mk('<!-- shipyard-metrics {"stage":"qa","started":"bad json -->', '2026-08-10T16:00:00Z'),
    mk(M({ started: '2026-08-10T16:00:00Z', finished: '2026-08-10T16:10:00Z' }), '2026-08-10T16:10:00Z'),
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].stage, 'dev');
  assert.equal(out[0].tokens_in, 420000);
});

test('parseEscalations reads cause, round and cap from the header', () => {
  const out = trail.parseEscalations([
    mk('ship:escalation cap round 3/3\n\n## What QA keeps finding\nstuff', '2026-08-10T18:00:00Z'),
    mk('ship:escalation stage-error round 1/3\n\nboom', '2026-08-10T19:00:00Z'),
  ]);
  assert.deepEqual(out.map((e) => e.cause), ['cap', 'stage-error']);
  assert.deepEqual(out.map((e) => [e.round, e.cap]), [[3, 3], [1, 3]]);
});

test('parseEscalations returns cause null for an unrecognised escalation header', () => {
  const out = trail.parseEscalations([mk('ship:escalation — dev/QA loop exhausted at round 3', '2026-08-10T18:00:00Z')]);
  assert.equal(out.length, 1);
  assert.equal(out[0].cause, null);
});

test('parseTrail aggregates repeated metrics blocks for one stage', () => {
  const t = trail.parseTrail([
    mk('ship:dev round 1/3\n' + M({ stage: 'dev', started: '2026-08-10T10:00:00Z', finished: '2026-08-10T11:00:00Z', tokens_in: 100, tokens_out: 10 }), '2026-08-10T11:00:00Z'),
    mk('ship:dev round 2/3\n' + M({ stage: 'dev', started: '2026-08-10T12:00:00Z', finished: '2026-08-10T13:00:00Z', tokens_in: 200, tokens_out: 20 }), '2026-08-10T13:00:00Z'),
  ]);
  const dev = t.segments.find((s) => s.stage === 'Dev');
  assert.equal(dev.start, Date.parse('2026-08-10T10:00:00Z'));
  assert.equal(dev.end, Date.parse('2026-08-10T13:00:00Z'));
  assert.equal(dev.tokensIn, 300);
  assert.equal(dev.tokensOut, 30);
  assert.equal(dev.round, 2);
  assert.equal(dev.estimated, false);
});

test('parseTrail falls back to comment timestamps and flags the segment estimated', () => {
  const t = trail.parseTrail([
    mk('📋 Spec approved — see docs/ship/1/spec.md', '2026-08-09T09:00:00Z'),
    mk('ship:qa verdict PASS', '2026-08-10T20:00:00Z'),
  ]);
  const spec = t.segments.find((s) => s.stage === 'Spec');
  assert.equal(spec.estimated, true);
  assert.equal(spec.start, spec.end);
  assert.equal(spec.tokensIn, null);
  assert.ok(t.segments.some((s) => s.stage === 'QA' && s.estimated === true));
});

test('parseTrail orders segments by STAGE_ORDER and reports lastActivity', () => {
  const t = trail.parseTrail([
    mk('ship:review-packet round 1/3', '2026-08-11T09:00:00Z'),
    mk('📋 Spec approved', '2026-08-09T09:00:00Z'),
  ]);
  assert.deepEqual(t.segments.map((s) => s.stage), ['Spec', 'Review']);
  assert.equal(t.lastActivity, Date.parse('2026-08-11T09:00:00Z'));
});

test('parseLogEntries keeps only ship: pipeline headers, splitting header/body and stripping leading blanks', () => {
  const out = trail.parseLogEntries([
    mk('ship:dev round 1/3\n\nDid the thing.', '2026-08-10T15:40:00Z'),
    mk('unrelated human comment', '2026-08-10T16:00:00Z'),
    mk('ship:qa verdict full', '2026-08-10T17:00:00Z'),
    mk('ship:escalation cap round 3/3\n\n## What QA keeps finding\nstuff', '2026-08-10T18:00:00Z'),
  ]);
  assert.equal(out.length, 3);
  assert.equal(out[0].header, 'ship:dev round 1/3');
  assert.equal(out[0].body, 'Did the thing.');
  assert.equal(out[0].at, Date.parse('2026-08-10T15:40:00Z'));
  assert.equal(out[1].header, 'ship:qa verdict full');
  assert.equal(out[1].body, '');
  assert.equal(out[2].header, 'ship:escalation cap round 3/3');
  assert.equal(out[2].body, '## What QA keeps finding\nstuff');
});

test('parseLogEntries returns null at for an unparseable createdAt', () => {
  const out = trail.parseLogEntries([mk('ship:qa verdict full', 'not-a-date')]);
  assert.equal(out.length, 1);
  assert.equal(out[0].at, null);
});

test('parseTrail on an empty trail returns no segments and null lastActivity', () => {
  const t = trail.parseTrail([]);
  assert.deepEqual(t.segments, []);
  assert.deepEqual(t.escalations, []);
  assert.equal(t.lastActivity, null);
});
