const { test } = require('node:test');
const assert = require('node:assert');
const { stageFromLabels, priorityFromLabels, createBoard, repoFromPath } = require('./board.js');
const board = require('./board.js');

test('stageFromLabels maps ship labels with precedence and conflict flag', () => {
  assert.deepStrictEqual(stageFromLabels([{ name: 'ship:in-qa' }]), { stage: 'QA', conflict: false });
  assert.deepStrictEqual(stageFromLabels([]), { stage: 'Backlog', conflict: false });
  const r = stageFromLabels([{ name: 'ship:in-dev' }, { name: 'ship:planned' }]);
  assert.strictEqual(r.stage, 'Dev');
  assert.strictEqual(r.conflict, true);
});

test('stageFromLabels maps ship:specced to Spec\'d', () => {
  assert.deepStrictEqual(stageFromLabels([{ name: 'ship:specced' }]), { stage: "Spec'd", conflict: false });
});

test('priorityFromLabels reads optional priority label', () => {
  assert.strictEqual(priorityFromLabels([{ name: 'priority: high' }]), 'High');
  assert.strictEqual(priorityFromLabels([{ name: 'bug' }]), null);
});

test('approve: allowed transitions only', async () => {
  const calls = [];
  const fake = async (cmd, args) => { calls.push([cmd, ...args]); return '{}'; };
  const board = createBoard(fake);
  await board.approve('o/r', 42, 'Awaiting Review');
  // Contract v1 4 / Decision 6: the review gate swaps labels; it never closes.
  assert.deepStrictEqual(calls[0], ['gh', 'issue', 'edit', '42', '--repo', 'o/r',
    '--add-label', 'ship:approved', '--remove-label', 'ship:awaiting-review']);
  await board.approve('o/r', 42, 'Needs Human');
  assert.ok(calls[1].includes('--add-label') && calls[1].includes('ship:planned'));
  await assert.rejects(() => board.approve('o/r', 42, 'Dev'), /approve not available/);
  await assert.rejects(() => board.approve('o/r', 42, 'Approved'), /approve not available/);
  await assert.rejects(() => board.approve('o/r', 42, 'PR Open'), /approve not available/);
  // The dashboard must never close an issue: closing is the PR merge's job.
  assert.ok(!calls.some((c) => c.includes('close')), 'approve must never invoke gh issue close');
});

test('listTickets requests a high explicit limit instead of gh\'s default 30', async () => {
  const calls = [];
  const fake = async (cmd, args) => { calls.push([cmd, ...args]); return '[]'; };
  const board = createBoard(fake);
  await board.listTickets('o/r');
  assert.ok(calls[0].includes('--limit'));
  assert.strictEqual(calls[0][calls[0].indexOf('--limit') + 1], '1000');
});

test('getTicket requests updatedAt in the detail field list', async () => {
  const calls = [];
  const fake = async (cmd, args) => { calls.push([cmd, ...args]); return '{}'; };
  const board = createBoard(fake);
  await board.getTicket('o/r', 42);
  const jsonFlagIdx = calls[0].indexOf('--json');
  const fields = calls[0][jsonFlagIdx + 1].split(',');
  assert.ok(fields.includes('updatedAt'));
});

test('repoFromPath parses ssh and https remotes', async () => {
  assert.strictEqual(await repoFromPath('/x', async () => 'git@github.com:acme/app.git\n'), 'acme/app');
  assert.strictEqual(await repoFromPath('/x', async () => 'https://github.com/acme/app\n'), 'acme/app');
  await assert.rejects(() => repoFromPath('/x', async () => 'https://gitlab.com/a/b\n'), /GitHub/);
});

test('stageFromLabels maps the contract v1 review-gate and PR stages', () => {
  assert.deepStrictEqual(stageFromLabels([{ name: 'ship:approved' }]), { stage: 'Approved', conflict: false });
  assert.deepStrictEqual(stageFromLabels([{ name: 'ship:pr-open' }]), { stage: 'PR Open', conflict: false });
  // Most advanced wins, and the conflict is still reported.
  assert.deepStrictEqual(
    stageFromLabels([{ name: 'ship:approved' }, { name: 'ship:awaiting-review' }]),
    { stage: 'Approved', conflict: true }
  );
});

test('viewer returns the gh login, and null when gh fails', async () => {
  const ok = await board.viewer(async () => 'Jaxsonman\n');
  assert.strictEqual(ok, 'Jaxsonman');
  const bad = await board.viewer(async () => { throw new Error('gh: not logged in'); });
  assert.strictEqual(bad, null, 'a gh failure must fail closed, not throw');
  const empty = await board.viewer(async () => '\n');
  assert.strictEqual(empty, null);
});

test('readApprovers tolerates every broken-config shape without throwing', async () => {
  const os = require('node:os');
  const fs = require('node:fs');
  const path = require('node:path');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dash-approvers-'));
  const write = (body) => {
    fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(root, '.claude', 'ship.config.json'), body);
  };
  assert.deepStrictEqual(board.readApprovers(root), [], 'missing file -> []');
  write('{ not json');
  assert.deepStrictEqual(board.readApprovers(root), [], 'bad JSON -> []');
  write(JSON.stringify({ approvers: 'nope' }));
  assert.deepStrictEqual(board.readApprovers(root), [], 'wrong type -> []');
  write(JSON.stringify({ approvers: ['  reviewer ', '', 7, 'second'] }));
  assert.deepStrictEqual(board.readApprovers(root), ['reviewer', 'second']);
  assert.deepStrictEqual(board.readApprovers(null), []);
  fs.rmSync(root, { recursive: true, force: true });
});
