const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { preflight } = require('./preflight.js');

const fakeExec = (map) => (cmd, args) => {
  const key = [cmd, ...args].join(' ');
  for (const [pat, res] of Object.entries(map)) if (key.startsWith(pat)) return res;
  return { code: 0, stdout: '', stderr: '' };
};

test('a non-git directory reports instead of crashing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-nogit-'));
  const r = preflight({ stage: 'prd', cwd: dir, exec: fakeExec({}) });
  assert.equal(r.ok, false);
  assert.ok(r.checks.find(c => c.id === 'git-repo' && c.ok === false));
  assert.ok(r.reasons.some(s => /git repository/i.test(s)));
});

test('multiple feat/<id>-* branches is an error naming every match (L-7)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-'));
  execFileSync('git', ['init', '-q', dir]);
  const r = preflight({ stage: 'ship', ticket: 42, cwd: dir, exec: fakeExec({
    'git branch': { code: 0, stdout: 'feat/42-login\nfeat/42-login-v2\n', stderr: '' }
  }) });
  const c = r.checks.find(c => c.id === 'branch-match');
  assert.equal(c.ok, false);
  assert.match(c.message, /feat\/42-login/);
  assert.match(c.message, /feat\/42-login-v2/);
});

test('a branch checked out in another worktree is named (L-3)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-'));
  execFileSync('git', ['init', '-q', dir]);
  const r = preflight({ stage: 'dev', ticket: 42, cwd: dir, exec: fakeExec({
    'git branch': { code: 0, stdout: 'feat/42-login\n', stderr: '' },
    'git worktree list': { code: 0, stdout: 'worktree /tmp/other-wt\nHEAD abc\nbranch refs/heads/feat/42-login\n', stderr: '' }
  }) });
  const c = r.checks.find(c => c.id === 'worktree-elsewhere');
  assert.equal(c.ok, false);
  assert.match(c.message, /\/tmp\/other-wt/);
});

test('gh auth failure is an error with the gh message', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-'));
  execFileSync('git', ['init', '-q', dir]);
  const r = preflight({ stage: 'kanban', cwd: dir, exec: fakeExec({
    'gh auth status': { code: 1, stdout: '', stderr: 'You are not logged into any GitHub hosts' }
  }) });
  assert.equal(r.ok, false);
  assert.ok(r.reasons.some(s => /not logged into/.test(s)));
});

test('an unknown stage is a usage error', () => {
  assert.throws(() => preflight({ stage: 'nope' }), /stage/);
});

test('stage=ship reads backend/target from kanban.config.json and baseBranch/loopCap/approvers/qa from ship.config.json (contract §12, fixture-based)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-splitcfg-'));
  execFileSync('git', ['init', '-q', dir]);
  fs.mkdirSync(path.join(dir, '.claude'));
  fs.writeFileSync(path.join(dir, '.claude', 'kanban.config.json'), JSON.stringify({
    version: 1, backend: 'github', target: 'owner/repo',
  }, null, 2));
  // A ship config written exactly as contract §12.2 shows — no backend/target.
  fs.writeFileSync(path.join(dir, '.claude', 'ship.config.json'), JSON.stringify({
    version: 1, baseBranch: 'main', loopCap: 3, approvers: [],
  }, null, 2));

  const r = preflight({ stage: 'ship', ticket: 1, cwd: dir, exec: fakeExec({
    'gh --version': { code: 0, stdout: 'gh version 2.0.0\n', stderr: '' },
    'gh auth status': { code: 0, stdout: '', stderr: '' },
    'gh repo view': { code: 0, stdout: '', stderr: '' },
  }) });

  const configCheck = r.checks.find(c => c.id === 'config');
  assert.equal(configCheck.ok, true, JSON.stringify(configCheck));
  assert.match(configCheck.message, /backend=github/);
  assert.match(configCheck.message, /target=owner\/repo/);
});

test('the report is JSON-serialisable and lists reasons for every failed error check', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-nogit2-'));
  const r = preflight({ stage: 'qa', ticket: 7, cwd: dir, exec: fakeExec({}) });
  JSON.parse(JSON.stringify(r));
  const failed = r.checks.filter(c => c.ok === false && c.level === 'error');
  assert.equal(r.reasons.length, failed.length);
});
