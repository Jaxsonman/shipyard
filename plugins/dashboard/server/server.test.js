const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { setTimeout: sleep } = require('node:timers/promises');
const { createApp } = require('./server.js');

let server, base;
before(async () => {
  server = createApp({ mock: true });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

test('GET /api/projects returns mock projects with counts', async () => {
  const r = await fetch(`${base}/api/projects`);
  const j = await r.json();
  assert.ok(j.projects.length >= 2);
  assert.ok(typeof j.projects[0].openCount === 'number');
});

test('GET /api/timeline returns grouped rows with segments', async () => {
  const res = await fetch(`${base}/api/timeline?project=all`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.domain.end > body.domain.start);
  assert.ok(body.rows.length > 0);
  assert.ok(body.rows.some((r) => r.segments.some((s) => s.estimated === false && s.tokensIn > 0)));
  assert.ok(body.rows.some((r) => r.segments.some((s) => s.estimated === true)));
  assert.ok(body.rows.some((r) => r.running === true));
  assert.ok(body.groups.length >= 2);
});

test('GET /api/timeline filters rows to the requested project', async () => {
  const res = await fetch(`${base}/api/timeline?project=core`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.rows.length > 0);
  assert.ok(body.rows.every((r) => r.project === 'core'));
});

test('GET /api/stats returns counts, durations, tokens and escalation causes', async () => {
  const res = await fetch(`${base}/api/stats?project=all`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Object.prototype.hasOwnProperty.call(body.counts, 'Needs Human'));
  assert.ok(body.stageDuration.samples > 0);
  assert.ok(body.tokens.in > 0);
  assert.ok(body.escalations.cap >= 1);
});

test('tickets list, detail, and guarded approve', async () => {
  const { tickets } = await (await fetch(`${base}/api/tickets?project=all`)).json();
  assert.ok(tickets.length >= 5);
  const t = tickets.find(x => x.stage === 'Awaiting Review');
  const detail = await (await fetch(`${base}/api/tickets/${t.project}/${t.number}`)).json();
  assert.strictEqual(detail.ticket.timeline.length, 5);
  assert.ok(typeof detail.ticket.spec === 'string' && detail.ticket.spec.length > 0);
  const ok = await fetch(`${base}/api/tickets/${t.project}/${t.number}/approve`, { method: 'POST' });
  assert.strictEqual(ok.status, 200);
  const dev = tickets.find(x => x.stage === 'Dev');
  const blocked = await fetch(`${base}/api/tickets/${dev.project}/${dev.number}/approve`, { method: 'POST' });
  assert.strictEqual(blocked.status, 409);
});

test('static serving and traversal guard', async () => {
  assert.strictEqual((await fetch(`${base}/`)).status, 200);
  assert.strictEqual((await fetch(`${base}/../../etc/passwd`)).status, 404);
});

test('/api/timeline and /api/stats share one gh fan-out per project via gatherRows caching', async () => {
  const configPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dash-cache-')), 'config.json');
  fs.writeFileSync(configPath, JSON.stringify({
    projects: [{ id: 'core', name: 'Core', path: '/mock/core', repo: 'o/r' }],
  }));

  let listCalls = 0;
  let viewCalls = 0;
  const fakeExecFile = async (cmd, args) => {
    if (args[0] === 'issue' && args[1] === 'list') {
      listCalls += 1;
      return JSON.stringify([
        { number: 1, title: 't', labels: [], assignees: [], updatedAt: '2026-08-11T13:00:00Z', url: 'u' },
      ]);
    }
    if (args[0] === 'issue' && args[1] === 'view') {
      viewCalls += 1;
      return JSON.stringify({
        number: 1, title: 't', body: 'b', labels: [], state: 'open', url: 'u', assignees: [], comments: [],
      });
    }
    throw new Error(`unexpected gh call: ${args.join(' ')}`);
  };

  const cacheServer = createApp({ mock: false, configPath, execFile: fakeExecFile });
  await new Promise((r) => cacheServer.listen(0, '127.0.0.1', r));
  const cacheBase = `http://127.0.0.1:${cacheServer.address().port}`;

  try {
    const r1 = await fetch(`${cacheBase}/api/timeline?project=core`);
    assert.equal(r1.status, 200);
    const r2 = await fetch(`${cacheBase}/api/stats?project=core`);
    assert.equal(r2.status, 200);

    // Two back-to-back calls (timeline then stats) for the same project must
    // share one fan-out: one issue-list call and one issue-detail call, not
    // two of each.
    assert.equal(listCalls, 1);
    assert.equal(viewCalls, 1);

    // Cache expires after its TTL: a call made after the TTL must fan out again.
    await sleep(3100);
    const r3 = await fetch(`${cacheBase}/api/timeline?project=core`);
    assert.equal(r3.status, 200);
    assert.equal(listCalls, 2);
    assert.equal(viewCalls, 2);
  } finally {
    cacheServer.close();
  }
});

test('cross-origin POST is rejected, same-origin/no-origin requests still work', async () => {
  const { tickets } = await (await fetch(`${base}/api/tickets?project=all`)).json();
  const t = tickets.find((x) => x.stage === 'Needs Human');

  const evil = await fetch(`${base}/api/tickets/${t.project}/${t.number}/approve`, {
    method: 'POST',
    headers: { Origin: 'https://evil.example' },
  });
  assert.strictEqual(evil.status, 403);
  assert.strictEqual((await evil.json()).error, 'cross-origin request rejected');

  const sameOrigin = await fetch(`${base}/api/tickets/${t.project}/${t.number}/approve`, {
    method: 'POST',
    headers: { Origin: base },
  });
  assert.strictEqual(sameOrigin.status, 200);

  const noOrigin = await fetch(`${base}/api/health`);
  assert.strictEqual(noOrigin.status, 200);
});
