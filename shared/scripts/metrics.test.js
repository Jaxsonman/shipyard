const test = require('node:test');
const assert = require('node:assert/strict');
const m = require('./metrics.js');

test('now returns second-precision ISO-8601 UTC', () => {
  assert.match(m.now(), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
});

test('footer emits fixed key order and omits unknown fields', () => {
  assert.equal(
    m.footer({ stage: 'dev', started: '2026-09-08T12:00:00Z' }),
    '<!-- shipyard-metrics {"stage":"dev","started":"2026-09-08T12:00:00Z"} -->'
  );
  assert.equal(
    m.footer({ stage: 'qa', started: '2026-09-08T12:00:00Z', finished: '2026-09-08T12:34:56Z', tokensIn: 12345, tokensOut: 6789 }),
    '<!-- shipyard-metrics {"stage":"qa","started":"2026-09-08T12:00:00Z","finished":"2026-09-08T12:34:56Z","tokens_in":12345,"tokens_out":6789} -->'
  );
});

test('footer marks a repost', () => {
  assert.match(m.footer({ stage: 'qa', started: '2026-09-08T12:00:00Z', reposted: true }), /"reposted":true\} -->$/);
});

test('the emitted footer is accepted by the dashboard parser regex', () => {
  const DASH = /<!--\s*shipyard-metrics\s+(\{[\s\S]*?\})\s*-->/g;
  const line = m.footer({ stage: 'dev', started: '2026-09-08T12:00:00Z', finished: '2026-09-08T12:34:56Z', tokensIn: 1, tokensOut: 2 });
  const hit = DASH.exec(line);
  assert.ok(hit);
  const j = JSON.parse(hit[1]);
  assert.equal(j.stage, 'dev');
  assert.equal(j.tokens_in, 1);
});

test('parseFooter round-trips and finds the footer inside a comment body', () => {
  const body = 'ship:qa verdict PASS round 1/3\n\nsome text\n' +
    m.footer({ stage: 'qa', started: '2026-09-08T12:00:00Z', finished: '2026-09-08T12:34:56Z', tokensIn: 1, tokensOut: 2 });
  const p = m.parseFooter(body);
  assert.equal(p.stage, 'qa');
  assert.equal(p.tokensIn, 1);
  assert.equal(p.tokensOut, 2);
  assert.equal(p.reposted, false);
});

test('parseFooter returns null when there is no footer', () => {
  assert.equal(m.parseFooter('no footer here'), null);
});

test('parseFooter tolerates reordered keys and a missing finished', () => {
  const p = m.parseFooter('<!-- shipyard-metrics {"tokens_out":9,"stage":"ship","started":"2026-09-08T12:00:00Z"} -->');
  assert.equal(p.stage, 'ship');
  assert.equal(p.tokensOut, 9);
  assert.equal(p.finished, null);
});

test('parseFooter returns null on malformed JSON rather than throwing', () => {
  assert.equal(m.parseFooter('<!-- shipyard-metrics {not json} -->'), null);
});

test('footer rejects an invalid stage and a non-ISO timestamp', () => {
  assert.throws(() => m.footer({ stage: 'nope', started: '2026-09-08T12:00:00Z' }));
  assert.throws(() => m.footer({ stage: 'dev', started: 'yesterday' }));
});

test('footer rejects non-integer or negative tokensIn/tokensOut', () => {
  assert.throws(() => m.footer({ stage: 'dev', started: '2026-09-08T12:00:00Z', tokensIn: -5 }));
  assert.throws(() => m.footer({ stage: 'dev', started: '2026-09-08T12:00:00Z', tokensIn: 1.5 }));
  assert.throws(() => m.footer({ stage: 'dev', started: '2026-09-08T12:00:00Z', tokensOut: NaN }));
});

test('CLI: --tokens-in / --tokens-out reject "abc", "-5", "1.5" — exit 2, nothing on stdout', () => {
  const { execFileSync } = require('node:child_process');
  const path = require('node:path');
  for (const bad of ['abc', '-5', '1.5']) {
    let threw = false;
    let stdout = '';
    let stderr = '';
    try {
      stdout = execFileSync(
        process.execPath,
        [path.join(__dirname, 'metrics.js'), 'footer', '--stage', 'dev', '--started', '2026-09-08T12:00:00Z', '--tokens-in', bad],
        { stdio: ['ignore', 'pipe', 'pipe'] }
      ).toString();
    } catch (e) {
      threw = true;
      stderr = String(e.stderr);
      assert.equal(e.status, 2, bad);
      stdout = String(e.stdout || '');
    }
    assert.ok(threw, `expected --tokens-in ${bad} to fail`);
    assert.equal(stdout, '', `expected nothing on stdout for --tokens-in ${bad}`);
    assert.ok(stderr.length > 0, bad);
  }
});
