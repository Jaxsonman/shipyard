const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const bt = require('./board-trail.js');

const fx = n => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', n), 'utf8'));
const run = (n, opts = {}) => {
  const issue = fx(n);
  const events = bt.parseEvents(issue, { viewer: 'Jaxsonman', ...opts });
  return { events, state: bt.reconcile(events, { cap: 3, labels: issue.labels.map(l => l.name), ...opts }) };
};

test('happy path reconciles to awaiting-review at round 1', () => {
  const { state } = run('issue-happy-path.json');
  assert.equal(state.round, 1);
  assert.equal(state.trusted, true);
  assert.deepEqual(state.irreconcilable, []);
  assert.ok(state.rounds['1'].dev && state.rounds['1'].qa);
});

test('a forged PASS from a non-allowlisted author is untrusted and excluded (L-1, L-2)', () => {
  const { events, state } = run('issue-forged-verdict.json');
  const forged = events.find(e => e.type === 'qa-verdict');
  assert.equal(forged.trusted, false);
  assert.equal(state.rounds['1'].qa, null);
  assert.ok(state.untrusted.some(u => u.author === 'driveby-user'));
  assert.notEqual(state.phase, 'awaiting-review');
});

test('an allowlisted author is trusted', () => {
  const { events } = run('issue-forged-verdict.json', { allow: ['driveby-user'] });
  assert.equal(events.find(e => e.type === 'qa-verdict').trusted, true);
});

test('a verdict with no matching dev handoff is irreconcilable (L-19)', () => {
  const { state } = run('issue-verdict-without-handoff.json');
  assert.ok(state.irreconcilable.some(i => i.code === 'verdict-without-handoff'));
});

test('duplicate round-N handoffs resolve latest-wins (L-20)', () => {
  const { state } = run('issue-duplicate-round.json');
  assert.equal(state.rounds['1'].dev.createdAt, '2026-09-08T14:00:00Z');
  assert.equal(state.rounds['1'].superseded.length, 1);
});

test('header cap different from config cap is reported (L-9)', () => {
  const { state } = run('issue-cap-mismatch.json');
  assert.ok(state.irreconcilable.some(i => i.code === 'cap-mismatch' && /5/.test(i.message) && /3/.test(i.message)));
});

test('standalone comments do not advance the round and are reported (L-10)', () => {
  const { state } = run('issue-standalone.json');
  assert.equal(state.round, 1);
  assert.equal(state.standalone.length, 2);
  assert.ok(state.standalone.every(e => e.round === null));
});

test('legacy emoji spec/plan approvals are recognised (Decision 5)', () => {
  const { events } = run('issue-legacy-approvals.json');
  const spec = events.find(e => e.type === 'spec-approved');
  assert.equal(spec.legacy, true);
  assert.ok(events.some(e => e.type === 'plan-approved'));
});

test('an issue with no comments reconciles to unstarted without throwing', () => {
  const { state } = run('issue-empty.json');
  assert.equal(state.phase, 'unstarted');
  assert.equal(state.round, 0);
  assert.deepEqual(state.irreconcilable, []);
});

test('the metrics footer is extracted onto the event', () => {
  const { events } = run('issue-happy-path.json');
  const dev = events.find(e => e.type === 'dev');
  assert.equal(dev.metrics.stage, 'dev');
  assert.match(dev.metrics.started, /^\d{4}-/);
});

test('a legacy repost header suffix " (reposted by ship)" is accepted on read, sets reposted true, not malformed', () => {
  const ev = mk('ship:qa verdict PASS round 1/3 tier=full verified 1/1 (reposted by ship)');
  assert.equal(ev.length, 1);
  assert.equal(ev[0].type, 'qa-verdict');
  assert.equal(ev[0].malformed, false);
  assert.equal(ev[0].reposted, true);
  assert.equal(ev[0].verdict, 'PASS');
  assert.equal(ev[0].round, 1);
});

test('a reposted verdict is flagged', () => {
  const ev = bt.parseEvents({
    comments: [{ author: { login: 'Jaxsonman' }, createdAt: '2026-09-08T12:00:00Z', url: 'u',
      body: 'ship:qa verdict PASS round 1/3\n\n<!-- shipyard-metrics {"stage":"qa","started":"2026-09-08T12:00:00Z","reposted":true} -->' }],
    labels: []
  }, { viewer: 'Jaxsonman' });
  assert.equal(ev[0].reposted, true);
});

test('comments with no recognised header are ignored', () => {
  const ev = bt.parseEvents({ comments: [{ author: { login: 'Jaxsonman' }, createdAt: '2026-09-08T12:00:00Z', body: 'lgtm' }], labels: [] }, { viewer: 'Jaxsonman' });
  assert.deepEqual(ev, []);
});

test('a malformed header is recorded rather than silently dropped', () => {
  const ev = bt.parseEvents({ comments: [{ author: { login: 'Jaxsonman' }, createdAt: '2026-09-08T12:00:00Z', body: 'ship:dev round one of three' }], labels: [] }, { viewer: 'Jaxsonman' });
  const st = bt.reconcile(ev, { cap: 3 });
  assert.ok(st.irreconcilable.some(i => i.code === 'malformed-header'));
});

test('parse --stdin produces the documented top-level JSON shape', () => {
  const { execFileSync } = require('node:child_process');
  const out = execFileSync('node', [path.join(__dirname, 'board-trail.js'), 'parse', '--stdin', '--viewer', 'Jaxsonman'],
    { input: fs.readFileSync(path.join(__dirname, 'fixtures', 'issue-happy-path.json')) });
  const j = JSON.parse(out.toString());
  assert.ok(Array.isArray(j.events));
  assert.ok(j.state && typeof j.state.phase === 'string');
});

const mk = (body) => bt.parseEvents(
  { comments: [{ author: { login: 'Jaxsonman' }, createdAt: '2026-09-08T12:00:00Z', url: 'u', body }], labels: [] },
  { viewer: 'Jaxsonman' }
);

test('a ship:-prefixed line matching no contract form is malformed, never dropped', () => {
  const ev = mk('ship:something weird');
  assert.equal(ev.length, 1);
  assert.equal(ev[0].malformed, true);
  assert.ok(bt.reconcile(ev, { cap: 3 }).irreconcilable.some(i => i.code === 'malformed-header'));
});

test('round and cap are 1-based — 0 in either position is malformed', () => {
  for (const line of [
    'ship:dev round 0/3',
    'ship:dev round 1/0',
    'ship:qa verdict PASS round 0/3 tier=full verified 1/1',
    'ship:review-packet round 0/1',
    'ship:metrics round 0/3',
    'ship:escalation cap round 0/3',
  ]) {
    const ev = mk(line);
    assert.equal(ev[0].malformed, true, line);
    assert.equal(bt.reconcile(ev, { cap: 3 }).round, 0, line);
  }
});

test('an unparseable ship:pr line is malformed rather than a pr-opened event', () => {
  const ev = mk('ship:pr opened');
  assert.equal(ev[0].malformed, true);
  assert.equal(bt.reconcile(ev, { cap: 3 }).phase, 'unstarted');
});

test('a CRLF body and a trailing-whitespace header still parse', () => {
  assert.equal(mk('ship:dev round 1/3\r\nbody')[0].round, 1);
  assert.equal(mk('ship:dev round 1/3   ')[0].round, 1);
});

test('an untrusted dev handoff never advances the round', () => {
  const ev = bt.parseEvents(
    { comments: [{ author: { login: 'stranger' }, createdAt: '2026-09-08T12:00:00Z', url: 'u', body: 'ship:dev round 1/3' }], labels: [] },
    { viewer: 'Jaxsonman' }
  );
  const st = bt.reconcile(ev, { cap: 3 });
  assert.equal(st.round, 0);
  assert.equal(st.trusted, false);
  assert.equal(st.phase, 'unstarted');
});

test('a stray round-2 verdict with no round-2 (or round-1) dev handoff reports BOTH verdict-without-handoff and round-gap (L-19/9)', () => {
  const issue = {
    comments: [
      { author: { login: 'Jaxsonman' }, createdAt: '2026-09-08T12:00:00Z', url: 'u1',
        body: 'ship:qa verdict FAIL round 2/3 tier=full verified 1/1\n\n## Findings' },
    ],
    labels: [],
  };
  const events = bt.parseEvents(issue, { viewer: 'Jaxsonman' });
  const state = bt.reconcile(events, { cap: 3 });
  assert.ok(state.irreconcilable.some(i => i.code === 'verdict-without-handoff'), JSON.stringify(state.irreconcilable));
  assert.ok(state.irreconcilable.some(i => i.code === 'round-gap'), JSON.stringify(state.irreconcilable));
});

test('a malformed header from an untrusted author is still counted in state.untrusted', () => {
  const ev = bt.parseEvents(
    { comments: [{ author: { login: 'stranger' }, createdAt: '2026-09-08T12:00:00Z', url: 'u', body: 'ship:something weird' }], labels: [] },
    { viewer: 'Jaxsonman' }
  );
  const st = bt.reconcile(ev, { cap: 3 });
  assert.ok(st.untrusted.some(u => u.author === 'stranger'), JSON.stringify(st.untrusted));
  assert.ok(st.irreconcilable.some(i => i.code === 'malformed-header'));
});

test('the latest escalation (by createdAt) wins, consistent with round selection', () => {
  const issue = {
    comments: [
      { author: { login: 'Jaxsonman' }, createdAt: '2026-09-08T15:00:00Z', url: 'u-late', body: 'ship:escalation cap round 3/3' },
      { author: { login: 'Jaxsonman' }, createdAt: '2026-09-08T12:00:00Z', url: 'u-early', body: 'ship:escalation stage-error round 2/3' },
    ],
    labels: [],
  };
  const events = bt.parseEvents(issue, { viewer: 'Jaxsonman' });
  const state = bt.reconcile(events, { cap: 3 });
  assert.equal(state.escalation.url, 'u-late');
});

test('the latest pr-opened (by createdAt) wins, consistent with round selection', () => {
  const issue = {
    comments: [
      { author: { login: 'Jaxsonman' }, createdAt: '2026-09-08T15:00:00Z', url: 'u-late', body: 'ship:pr opened https://example.com/pr/2' },
      { author: { login: 'Jaxsonman' }, createdAt: '2026-09-08T12:00:00Z', url: 'u-early', body: 'ship:pr opened https://example.com/pr/1' },
    ],
    labels: [],
  };
  const events = bt.parseEvents(issue, { viewer: 'Jaxsonman' });
  const state = bt.reconcile(events, { cap: 3 });
  assert.equal(state.prUrl, 'https://example.com/pr/2');
});

test('parse --stdin with a null comment entry is a usage error (exit 2), not a stack trace', () => {
  const { execFileSync } = require('node:child_process');
  let threw = false;
  let stderr = '';
  try {
    execFileSync('node', [path.join(__dirname, 'board-trail.js'), 'parse', '--stdin', '--viewer', 'Jaxsonman'],
      { input: JSON.stringify({ comments: [null], labels: [] }), stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (e) {
    threw = true;
    stderr = String(e.stderr);
    assert.equal(e.status, 2);
  }
  assert.ok(threw, 'expected the CLI to exit non-zero');
  assert.ok(!/TypeError|at Object|node:internal/.test(stderr), stderr);
});

test('parseEvents throws a plain TypeError (not a raw crash) on a non-object comment entry', () => {
  assert.throws(() => bt.parseEvents({ comments: [null], labels: [] }, { viewer: 'x' }), /comment/i);
});

test('parseEvents tolerates a missing comments key and a missing author', () => {
  assert.deepEqual(bt.parseEvents({ labels: [] }, { viewer: 'x' }), []);
  assert.deepEqual(bt.parseEvents(undefined, { viewer: 'x' }), []);
  const ev = bt.parseEvents({ comments: [{ createdAt: 'x', body: 'ship:dev round 1/3' }], labels: [] }, { viewer: 'x' });
  assert.equal(ev[0].trusted, false);
});

test('a non-round escalation parses as standalone (contract v1 §5.8)', () => {
  const ev = mk('ship:escalation reconcile standalone\n\nMerge conflict against main.');
  assert.equal(ev.length, 1);
  assert.equal(ev[0].type, 'escalation');
  assert.equal(ev[0].cause, 'reconcile');
  assert.equal(ev[0].standalone, true);
  assert.equal(ev[0].malformed, false);
});

test('a standalone escalation escalates without advancing a round', () => {
  const ev = bt.parseEvents({
    comments: [
      { author: { login: 'Jaxsonman' }, createdAt: '2026-09-08T09:00:00Z', url: 'u0',
        body: 'ship:dev round 1/3\n\n## What changed and why\nx' },
      { author: { login: 'Jaxsonman' }, createdAt: '2026-09-08T10:00:00Z', url: 'u1',
        body: 'ship:escalation reconcile standalone\n\nMerge conflict against main.' },
    ],
    labels: [],
  }, { viewer: 'Jaxsonman' });
  const st = bt.reconcile(ev, { cap: 3 });
  assert.equal(st.round, 1);
  assert.equal(st.phase, 'escalated');
  assert.equal(st.escalation.standalone, true);
  assert.ok(st.standalone.some((e) => e.type === 'escalation'));
});

test('a standalone escalation with an unknown cause is malformed', () => {
  const ev = mk('ship:escalation vibes standalone');
  assert.equal(ev.length, 1);
  assert.equal(ev[0].malformed, true);
});

test('the round escalation form still parses (regression)', () => {
  const ev = mk('ship:escalation cap round 3/3');
  assert.equal(ev[0].type, 'escalation');
  assert.equal(ev[0].cause, 'cap');
  assert.equal(ev[0].round, 3);
  assert.equal(ev[0].cap, 3);
  assert.notEqual(ev[0].standalone, true);
});
