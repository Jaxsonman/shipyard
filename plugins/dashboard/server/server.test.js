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

test('tickets list, detail, and guarded approve', async () => {
  const { tickets } = await (await fetch(`${base}/api/tickets?project=all`)).json();
  assert.ok(tickets.length >= 5);
  const t = tickets.find(x => x.stage === 'Awaiting Review');
  const detail = await (await fetch(`${base}/api/tickets/${t.project}/${t.number}`)).json();
  assert.strictEqual(detail.ticket.timeline.length, 5);
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
