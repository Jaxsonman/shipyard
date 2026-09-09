const { test } = require('node:test');
const assert = require('node:assert');
const { stageFromLabels, priorityFromLabels, createBoard, repoFromPath } = require('./board.js');

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
  assert.deepStrictEqual(calls[0], ['gh', 'issue', 'close', '42', '--repo', 'o/r']);
  await board.approve('o/r', 42, 'Needs Human');
  assert.ok(calls[1].includes('--add-label') && calls[1].includes('ship:planned'));
  await assert.rejects(() => board.approve('o/r', 42, 'Dev'), /approve not available/);
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
