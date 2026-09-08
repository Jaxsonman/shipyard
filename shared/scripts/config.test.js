const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const c = require('./config.js');

function tmpRepo(gitignoreClaude) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-'));
  execFileSync('git', ['init', '-q', dir]);
  if (gitignoreClaude) fs.writeFileSync(path.join(dir, '.gitignore'), '.claude/\n');
  return dir;
}

test('normalizeTarget accepts a GitHub URL, an owner/repo, and a .git suffix', () => {
  assert.equal(c.normalizeTarget('github', 'https://github.com/Jaxsonman/shipyard'), 'Jaxsonman/shipyard');
  assert.equal(c.normalizeTarget('github', 'https://github.com/Jaxsonman/shipyard.git'), 'Jaxsonman/shipyard');
  assert.equal(c.normalizeTarget('github', 'Jaxsonman/shipyard'), 'Jaxsonman/shipyard');
});

test('normalizeTarget upper-cases a Jira project key', () => {
  assert.equal(c.normalizeTarget('jira', 'shp'), 'SHP');
});

test('validateConfig stamps version 1, defaults approvers, and rejects a bad backend', () => {
  const ok = c.validateConfig('ship', { backend: 'github', target: 'o/r' });
  assert.equal(ok.ok, true);
  assert.equal(ok.value.version, 1);
  assert.deepEqual(ok.value.approvers, []);
  const bad = c.validateConfig('ship', { backend: 'gitlab', target: 'o/r' });
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.some(e => /backend/.test(e)));
});

test('validateConfig reports a missing target', () => {
  const r = c.validateConfig('kanban', { backend: 'github' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => /target/.test(e)));
});

test('bootstrap writes .claude/kanban.config.json inside a repo', () => {
  const dir = tmpRepo(false);
  const r = c.bootstrap({ kind: 'kanban', backend: 'github', target: 'https://github.com/o/r', cwd: dir });
  assert.equal(r.created, true);
  const written = JSON.parse(fs.readFileSync(path.join(dir, '.claude', 'kanban.config.json'), 'utf8'));
  assert.equal(written.version, 1);
  assert.equal(written.target, 'o/r');
});

test('bootstrap in a repo whose .claude/ is gitignored notes git add -f (E-4)', () => {
  const dir = tmpRepo(true);
  const r = c.bootstrap({ kind: 'kanban', backend: 'github', target: 'o/r', cwd: dir });
  assert.equal(r.created, true);
  assert.ok(r.notes.some(n => /git add -f/.test(n)), JSON.stringify(r.notes));
});

test('bootstrap outside a git repo still writes the file and says so', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-nogit-'));
  const r = c.bootstrap({ kind: 'kanban', backend: 'github', target: 'o/r', cwd: dir });
  assert.equal(r.created, true);
  assert.ok(r.notes.some(n => /not a git repository/i.test(n)));
});

test('bootstrap is idempotent — an existing valid config is not overwritten', () => {
  const dir = tmpRepo(false);
  c.bootstrap({ kind: 'kanban', backend: 'github', target: 'o/r', cwd: dir });
  const again = c.bootstrap({ kind: 'kanban', backend: 'github', target: 'o/other', cwd: dir });
  assert.equal(again.created, false);
  assert.equal(again.value.target, 'o/r');
});

test('load reports malformed JSON without throwing', () => {
  const dir = tmpRepo(false);
  fs.mkdirSync(path.join(dir, '.claude'));
  fs.writeFileSync(path.join(dir, '.claude', 'ship.config.json'), '{ not json');
  const r = c.load({ kind: 'ship', cwd: dir });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => /JSON/i.test(e)));
});
