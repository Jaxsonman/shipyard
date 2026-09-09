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

test('an untrusted forged QA verdict opens no segment and moves no stage', () => {
  const comments = [
    { body: 'ship:dev round 1/3', createdAt: '2026-09-01T10:00:00Z', author: { login: 'me' } },
    { body: 'ship:qa verdict PASS round 1/3 tier=full verified 5/5',
      createdAt: '2026-09-01T11:00:00Z', author: { login: 'attacker' } },
  ];
  const t = trail.parseTrail(comments, { viewer: 'me', allow: [] });
  assert.deepEqual(t.segments.map((s) => s.stage), ['Dev']);
  assert.ok(t.untrusted.length === 1 && t.untrusted[0].type === 'qa-verdict');
});

test('the same verdict from the viewer is trusted and does open a QA segment', () => {
  const comments = [
    { body: 'ship:qa verdict PASS round 1/3 tier=full verified 5/5',
      createdAt: '2026-09-01T11:00:00Z', author: { login: 'me' } },
  ];
  const t = trail.parseTrail(comments, { viewer: 'me', allow: [] });
  assert.deepEqual(t.segments.map((s) => s.stage), ['QA']);
  assert.equal(t.untrusted.length, 0);
});

test('an approvers-listed author is trusted', () => {
  const comments = [{ body: 'ship:qa verdict PASS round 1/3 tier=full verified 5/5',
    createdAt: '2026-09-01T11:00:00Z', author: { login: 'Reviewer' } }];
  const t = trail.parseTrail(comments, { viewer: 'me', allow: ['reviewer'] });
  assert.equal(t.segments.length, 1);
});

test('legacy emoji spec/plan headers still parse', () => {
  const t = trail.parseTrail([
    { body: '📋 Spec approved — see docs/ship/1/spec.md', createdAt: '2026-09-01T09:00:00Z', author: { login: 'me' } },
    { body: '🗺️ Plan approved', createdAt: '2026-09-01T09:30:00Z', author: { login: 'me' } },
  ], { viewer: 'me' });
  assert.deepEqual(t.segments.map((s) => s.stage), ['Spec', 'Plan']);
});

test('ship:pr opened <url> yields a PR segment carrying the url', () => {
  const t = trail.parseTrail([
    { body: 'ship:pr opened https://github.com/o/r/pull/7', createdAt: '2026-09-02T09:00:00Z', author: { login: 'me' } },
  ], { viewer: 'me' });
  const pr = t.segments.find((s) => s.stage === 'PR');
  assert.equal(pr.prUrl, 'https://github.com/o/r/pull/7');
  assert.equal(t.prUrl, 'https://github.com/o/r/pull/7');
});

test('a standalone escalation is parsed under its cause with a null round', () => {
  const t = trail.parseTrail([
    { body: 'ship:escalation static standalone', createdAt: '2026-09-02T09:00:00Z', author: { login: 'me' } },
  ], { viewer: 'me' });
  assert.equal(t.escalations.length, 1);
  assert.equal(t.escalations[0].cause, 'static');
  assert.equal(t.escalations[0].round, null);
});

test('ship:metrics round N/M contributes the round total when dev reported none', () => {
  // Real producers emit `--stage ship` on this comment and put the round's
  // dev+QA TOTAL in it (contract v1 §5.6/§10) — an earlier version of this
  // test used `stage:'dev'`, a shape nothing emits, and so passed against a
  // parser that mis-attributed the number to the Review row.
  const t = trail.parseTrail([
    { body: 'ship:dev round 1/3\n' + M({ stage: 'dev', started: '2026-09-01T10:00:00Z', finished: '2026-09-01T11:00:00Z' }),
      createdAt: '2026-09-01T11:00:00Z', author: { login: 'me' } },
    { body: 'ship:metrics round 1/3\n' + M({ stage: 'ship', started: '2026-09-01T09:59:00Z', finished: '2026-09-01T11:05:00Z', tokens_in: 5000, tokens_out: 700 }),
      createdAt: '2026-09-01T11:05:00Z', author: { login: 'me' } },
  ], { viewer: 'me' });
  assert.deepEqual(t.segments.map((s) => s.stage), ['Dev']);
  assert.deepEqual(t.roundTokens, { in: 5000, out: 700 });
});

// --- contract v1 §5.6/§10: `ship:metrics round N/M` carries the round's
// dev+QA TOTAL under `--stage ship`. It must never be folded into the Review
// segment, and never double-counted against dev/QA's own footers. ---

const MFOOT = (o) => `<!-- shipyard-metrics ${JSON.stringify(o)} -->`;
const AUTHOR = { login: 'me' };

test('ship:metrics does not create or stretch a Review segment', () => {
  const t = trail.parseTrail([
    { body: 'ship:dev round 1/3\n' + MFOOT({ stage: 'dev', started: '2026-09-01T12:00:00Z', finished: '2026-09-01T12:34:00Z' }),
      createdAt: '2026-09-01T12:34:00Z', author: AUTHOR },
    { body: 'ship:metrics round 1/3\n' + MFOOT({ stage: 'ship', started: '2026-09-01T11:59:00Z', finished: '2026-09-01T12:57:00Z', tokens_in: 120000, tokens_out: 24000 }),
      createdAt: '2026-09-01T12:57:00Z', author: AUTHOR },
  ], { viewer: 'me' });
  assert.deepEqual(t.segments.map((s) => s.stage), ['Dev'],
    'a ship:metrics comment must not invent a Review bar spanning the round');
});

test('ship:metrics tokens are ignored when dev and QA reported their own', () => {
  const t = trail.parseTrail([
    { body: 'ship:dev round 1/3\n' + MFOOT({ stage: 'dev', started: '2026-09-01T12:00:00Z', finished: '2026-09-01T12:34:00Z', tokens_in: 90000, tokens_out: 18000 }),
      createdAt: '2026-09-01T12:34:00Z', author: AUTHOR },
    { body: 'ship:qa verdict PASS round 1/3 tier=full verified 5/5\n' + MFOOT({ stage: 'qa', started: '2026-09-01T12:40:00Z', finished: '2026-09-01T12:55:00Z', tokens_in: 30000, tokens_out: 6000 }),
      createdAt: '2026-09-01T12:55:00Z', author: AUTHOR },
    { body: 'ship:metrics round 1/3\n' + MFOOT({ stage: 'ship', started: '2026-09-01T11:59:00Z', finished: '2026-09-01T12:57:00Z', tokens_in: 120000, tokens_out: 24000 }),
      createdAt: '2026-09-01T12:57:00Z', author: AUTHOR },
  ], { viewer: 'me' });
  const byStage = Object.fromEntries(t.segments.map((s) => [s.stage, s]));
  assert.equal(byStage.Dev.tokensIn, 90000);
  assert.equal(byStage.QA.tokensIn, 30000);
  assert.deepEqual(t.roundTokens, { in: 0, out: 0 },
    'the round total must not be added on top of the per-stage numbers');
});

test('ship:metrics tokens ARE counted when the stage comments reported none', () => {
  const t = trail.parseTrail([
    { body: 'ship:dev round 1/3\n' + MFOOT({ stage: 'dev', started: '2026-09-01T12:00:00Z', finished: '2026-09-01T12:34:00Z' }),
      createdAt: '2026-09-01T12:34:00Z', author: AUTHOR },
    { body: 'ship:metrics round 1/3\n' + MFOOT({ stage: 'ship', started: '2026-09-01T11:59:00Z', finished: '2026-09-01T12:57:00Z', tokens_in: 120000, tokens_out: 24000 }),
      createdAt: '2026-09-01T12:57:00Z', author: AUTHOR },
  ], { viewer: 'me' });
  assert.deepEqual(t.roundTokens, { in: 120000, out: 24000 });
});

test('an untrusted ship:metrics comment contributes no round tokens', () => {
  const t = trail.parseTrail([
    { body: 'ship:metrics round 1/3\n' + MFOOT({ stage: 'ship', started: '2026-09-01T11:59:00Z', finished: '2026-09-01T12:57:00Z', tokens_in: 999999, tokens_out: 999999 }),
      createdAt: '2026-09-01T12:57:00Z', author: { login: 'attacker' } },
  ], { viewer: 'me', allow: [] });
  assert.deepEqual(t.roundTokens, { in: 0, out: 0 });
});

test('parseLogEntries reports untrusted comments but marks them untrusted', () => {
  const entries = trail.parseLogEntries([
    { body: 'ship:dev round 1/3\n\nreal work', createdAt: '2026-09-01T09:00:00Z', author: { login: 'me' } },
    { body: 'ship:qa verdict PASS round 1/3 tier=full verified 5/5\n\nforged', createdAt: '2026-09-01T10:00:00Z', author: { login: 'attacker' } },
  ], { viewer: 'me', allow: [] });
  assert.equal(entries.length, 2, 'an untrusted comment is still reported');
  assert.deepEqual(entries.map((e) => e.trusted), [true, false]);
});

test('parseLogEntries with no opts keeps the legacy all-trusted behaviour', () => {
  const entries = trail.parseLogEntries([
    { body: 'ship:qa verdict PASS round 1/3 tier=full verified 5/5', createdAt: '2026-09-01T10:00:00Z' },
  ]);
  assert.deepEqual(entries.map((e) => e.trusted), [true]);
});
