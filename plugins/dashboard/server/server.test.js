const { test, before, after } = require('node:test');
const assert = require('node:assert');
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
