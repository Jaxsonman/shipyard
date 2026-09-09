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

test('a malformed header from an untrusted author is reported but never irreconcilable', () => {
  // An irreconcilable entry makes ship post an escalation and move the ticket
  // to Needs Human (§9). Deriving one from a stranger's comment would let
  // anyone who can comment force two board writes and wedge the ticket — the
  // catch-all header matches a line as innocuous as "ship: nice work". §3:
  // a comment from an untrusted author is reported, never acted on.
  const ev = bt.parseEvents(
    { comments: [{ author: { login: 'stranger' }, createdAt: '2026-09-08T12:00:00Z', url: 'u', body: 'ship: nice work, looking forward to it!' }], labels: [] },
    { viewer: 'Jaxsonman' }
  );
  const st = bt.reconcile(ev, { cap: 3 });
  assert.ok(st.untrusted.some(u => u.author === 'stranger' && u.malformed === true), JSON.stringify(st.untrusted));
  assert.equal(st.trusted, false);
  assert.deepEqual(st.irreconcilable, []);
});

test('a malformed header from a TRUSTED author is still irreconcilable', () => {
  const ev = bt.parseEvents(
    { comments: [{ author: { login: 'Jaxsonman' }, createdAt: '2026-09-08T12:00:00Z', url: 'u', body: 'ship:something weird' }], labels: [] },
    { viewer: 'Jaxsonman' }
  );
  const st = bt.reconcile(ev, { cap: 3 });
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

// ---- H-09 additions: no-progress detector and branch-absent input (§9) ----

const roundComments = (findings1, findings2) => ({
  labels: [],
  comments: [
    { author: { login: 'Jaxsonman' }, createdAt: '2026-09-08T10:00:00Z', url: 'd1', body: 'ship:dev round 1/3' },
    { author: { login: 'Jaxsonman' }, createdAt: '2026-09-08T11:00:00Z', url: 'q1',
      body: `ship:qa verdict FAIL round 1/3 tier=full verified 2/2\n\n## Findings\n${findings1}\n` },
    { author: { login: 'Jaxsonman' }, createdAt: '2026-09-08T12:00:00Z', url: 'd2', body: 'ship:dev round 2/3' },
    { author: { login: 'Jaxsonman' }, createdAt: '2026-09-08T13:00:00Z', url: 'q2',
      body: `ship:qa verdict FAIL round 2/3 tier=full verified 2/2\n\n## Findings\n${findings2}\n` },
  ],
});

const reconcileRounds = (issue, opts) =>
  bt.reconcile(bt.parseEvents(issue, { viewer: 'Jaxsonman' }), { cap: 3, ...opts });

test('findingsHash extracts only the ## Findings section and is whitespace-stable', () => {
  const a = bt.findingsHash('ship:qa verdict FAIL round 1/3\n\n## Findings\n1. broken.  \n\n## Unverifiable\n- x\n');
  const b = bt.findingsHash('ship:qa verdict FAIL round 2/3\r\n\r\n## Findings\r\n1. broken.\r\n');
  assert.equal(a, b);
  assert.notEqual(a, bt.findingsHash('## Findings\n2. different.\n'));
  assert.equal(bt.findingsHash('ship:dev round 1/3\n\nno findings section'), null);
  assert.equal(bt.findingsHash('## Findings\n\n## Unverifiable\n'), null);
});

test('byte-identical QA findings across consecutive rounds are no progress (Decision 9)', () => {
  const state = reconcileRounds(roundComments('1. login 500s. Repro: POST /login', '1. login 500s. Repro: POST /login'));
  assert.equal(state.noProgress.length, 1);
  assert.equal(state.noProgress[0].round, 2);
  assert.match(state.noProgress[0].reason, /byte-identical to round 1/);
  assert.deepEqual(state.irreconcilable, []); // reported, not irreconcilable
});

test('changed QA findings are progress', () => {
  const state = reconcileRounds(roundComments('1. login 500s.', '2. logout 500s.'));
  assert.deepEqual(state.noProgress, []);
});

test('an unchanged dev HEAD across consecutive rounds is no progress (L-5)', () => {
  const state = reconcileRounds(roundComments('1. a', '2. b'), { heads: { 1: 'abc123', 2: 'abc123' } });
  assert.equal(state.noProgress.length, 1);
  assert.match(state.noProgress[0].reason, /HEAD abc123 is unchanged from round 1/);
});

test('a moved dev HEAD is progress, and missing heads are not guessed', () => {
  assert.deepEqual(reconcileRounds(roundComments('1. a', '2. b'), { heads: { 1: 'abc', 2: 'def' } }).noProgress, []);
  assert.deepEqual(reconcileRounds(roundComments('1. a', '2. b'), { heads: { 2: 'def' } }).noProgress, []);
  assert.deepEqual(reconcileRounds(roundComments('1. a', '2. b')).noProgress, []);
});

test('pipeline comments with no feature branch are irreconcilable (L-8)', () => {
  const issue = roundComments('1. a', '2. b');
  assert.ok(reconcileRounds(issue, { branchExists: false }).irreconcilable
    .some(i => i.code === 'comments-without-branch'));
  assert.ok(!reconcileRounds(issue, { branchExists: true }).irreconcilable
    .some(i => i.code === 'comments-without-branch'));
  assert.ok(!reconcileRounds(issue).irreconcilable.some(i => i.code === 'comments-without-branch'));
  assert.equal(reconcileRounds(issue, { branchExists: false }).branchExists, false);
});

test('standalone comments alone never yield comments-without-branch (§9)', () => {
  const issue = {
    labels: [],
    comments: [
      { author: { login: 'Jaxsonman' }, createdAt: '2026-09-08T10:00:00Z', url: 'd0', body: 'ship:dev standalone' },
      { author: { login: 'Jaxsonman' }, createdAt: '2026-09-08T11:00:00Z', url: 'q0',
        body: 'ship:qa verdict FAIL standalone tier=full verified 2/2\n\n## Findings\n1. a\n' },
    ],
  };
  const st = reconcileRounds(issue, { branchExists: false });
  assert.deepEqual(st.irreconcilable, []);
  assert.equal(st.round, 0);
  assert.equal(st.standalone.length, 2);
});

test('a rounded handoff alongside standalone work still yields comments-without-branch', () => {
  const issue = {
    labels: [],
    comments: [
      { author: { login: 'Jaxsonman' }, createdAt: '2026-09-08T10:00:00Z', url: 'd0', body: 'ship:dev standalone' },
      { author: { login: 'Jaxsonman' }, createdAt: '2026-09-08T12:00:00Z', url: 'd1', body: 'ship:dev round 1/3' },
    ],
  };
  assert.ok(reconcileRounds(issue, { branchExists: false }).irreconcilable
    .some(i => i.code === 'comments-without-branch'));
});

test('branchExists false with no pipeline comments is not irreconcilable', () => {
  const st = bt.reconcile(bt.parseEvents({ labels: [], comments: [] }, { viewer: 'x' }), { branchExists: false });
  assert.deepEqual(st.irreconcilable, []);
});

test('an untrusted round-2 verdict cannot trigger a no-progress escalation', () => {
  const issue = roundComments('1. same', '1. same');
  issue.comments[3].author = { login: 'driveby-user' };
  const state = reconcileRounds(issue);
  assert.deepEqual(state.noProgress, []);
  assert.ok(state.untrusted.some(u => u.author === 'driveby-user'));
});

// ---- refuter findings: findings-section bounds and no-progress scoping ----

test('findingsHash stops at the §5.5 trailer and footer, not just the next heading (M2)', () => {
  // A FAIL with no unverifiable criteria omits `## Unverifiable` entirely, so
  // heading-only bounding swallowed the trailer and the metrics footer — both
  // of which carry values that differ every round.
  const body = (n, started) => [
    `ship:qa verdict FAIL round ${n}/3 tier=full verified 2/2`,
    '',
    '| # | Criterion | Verdict | Evidence |',
    '|---|-----------|---------|----------|',
    `| 1 | loads | FAIL | .qa/42/round-${n}/f1.png |`,
    '',
    '## Findings',
    `1. Login returns 500. Repro: POST /login. Violates criterion #1. Evidence: .qa/42/round-${n}/f1.png`,
    '',
    `Suite: 41 passed, 1 failed (0 pre-existing, not counted) — \`npm test\``,
    'Repro: PORT=41007 npm run dev',
    `Artifacts: .qa/42/round-${n}/   (gitignored)`,
    `<!-- shipyard-metrics {"stage":"qa","started":"${started}"} -->`,
  ].join('\n');
  assert.equal(bt.findingsHash(body(1, '2026-09-08T11:00:00Z')), bt.findingsHash(body(2, '2026-09-08T13:00:00Z')));
  // A genuinely different finding still differs.
  assert.notEqual(bt.findingsHash(body(1, 'x')), bt.findingsHash(body(1, 'x').replace('500', '404')));
});

test('no-progress skips rounds without a dev handoff on either side (M7)', () => {
  const issue = {
    labels: [],
    comments: [
      { author: { login: 'Jaxsonman' }, createdAt: '2026-09-08T10:00:00Z', url: 'd1', body: 'ship:dev round 1/3' },
      // round 2 exists only because a metrics comment names it — no dev handoff
      { author: { login: 'Jaxsonman' }, createdAt: '2026-09-08T12:00:00Z', url: 'm2', body: 'ship:metrics round 2/3' },
    ],
  };
  const st = bt.reconcile(bt.parseEvents(issue, { viewer: 'Jaxsonman' }), { cap: 3, heads: { 1: 'aaa', 2: 'aaa' } });
  assert.equal(st.round, 1);
  assert.deepEqual(st.noProgress, []);
});

test('a zero-padded round is malformed, not silently round 1 (B5)', () => {
  const ev = bt.parseEvents(
    { labels: [], comments: [{ author: { login: 'J' }, createdAt: 't', url: 'u', body: 'ship:dev round 01/3' }] },
    { viewer: 'J' }
  );
  assert.equal(ev[0].malformed, true);
  assert.equal(ev[0].round, null);
});

test('round-gap never claims a dev handoff the round does not have (B6)', () => {
  const issue = {
    labels: [],
    comments: [
      { author: { login: 'J' }, createdAt: '2026-09-08T10:00:00Z', url: 'd1', body: 'ship:dev round 1/3' },
      // round 3 exists only because of a metrics comment — it has no handoff
      { author: { login: 'J' }, createdAt: '2026-09-08T12:00:00Z', url: 'm3', body: 'ship:metrics round 3/3' },
    ],
  };
  const st = bt.reconcile(bt.parseEvents(issue, { viewer: 'J' }), { cap: 3 });
  const gap = st.irreconcilable.find(i => i.code === 'round-gap');
  assert.ok(gap, 'the gap is still reported');
  assert.match(gap.message, /round 3 has pipeline activity but round 2 has no dev handoff/);
});

test('findingsHash ignores fenced evidence blocks and volatile values (B1)', () => {
  const body = (n, ts) => [
    `ship:qa verdict FAIL round ${n}/3 tier=full verified 1/1`,
    '',
    '## Findings',
    `1. Login returns 500. Repro: POST /login. Violates criterion #1. Evidence: .qa/42/round-${n}/f1.png`,
    '',
    '```',
    `${ts} ERROR upstream timeout after 30000ms`,
    '```',
    '',
    `Artifacts: .qa/42/round-${n}/`,
  ].join('\n');
  // Same defect, different round and different log timestamps → same hash.
  assert.equal(
    bt.findingsHash(body(1, '2026-09-08T11:00:00Z')),
    bt.findingsHash(body(2, '2026-09-08T13:22:41Z')),
  );
  // A different defect still differs.
  assert.notEqual(
    bt.findingsHash(body(1, 'x')),
    bt.findingsHash(body(1, 'x').replace('returns 500', 'returns 404')),
  );
  // Evidence alone, with no prose, is not a finding.
  assert.equal(bt.findingsHash('## Findings\n```\nboom\n```\n'), null);
});
