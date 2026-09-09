# Wave 0 — Epic A (Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lock Shipyard's inter-plugin wire protocol into one versioned contract document, implement it as six zero-dependency Node scripts with `node:test` coverage, and vendor + verify all of it through a sync script, a pre-commit hook, and CI.

**Architecture:** Repo-root `shared/` is the single source of truth (`shared/scripts/*.js`, `shared/scripts/*.test.js`, `shared/scripts/fixtures/`, `shared/references/contract.md`). `scripts/sync-shared.sh` copies scripts into `plugins/<x>/scripts/` and the contract into `plugins/<x>/references/contract.md` and into `docs/contract.md`, iterating `plugins/*/` dynamically so new plugins are picked up automatically. `scripts/check-shared-sync.sh` re-runs the copy into a temp tree and diffs, exiting non-zero on drift. A pre-commit hook and `.github/workflows/ci.yml` run the check, the tests, and `claude plugin validate .`.

**Tech Stack:** Node ≥ 18, CommonJS, zero runtime dependencies, `node:test` + `node:assert/strict`. Bash for the two repo-maintenance scripts and the hook. GitHub Actions for CI.

**Spec:** `docs/superpowers/specs/2026-09-08-hardening-program-design.md` (Decisions 1–5, 7, 11; "Shared scripts" table; stories H-01, H-02, H-03).

## Global Constraints

- Runtime: **Node ≥ 18**, **CommonJS** (`require`/`module.exports`), **zero dependencies**, tests with **`node:test`**.
- Run tests as `node --test shared/scripts/*.test.js` — the directory form (`node --test shared/`) fails on Node 25. README and CI must use the glob form.
- Every script is usable **both** as a CLI (`node shared/scripts/<name>.js …`) and as a module (`require('./board-trail.js')`). CLI entry guarded by `if (require.main === module)`.
- Every script supports `--help` / `-h` on stdout and exits 0.
- Exit-code convention across all scripts: **0** = success/check passed, **1** = check failed / contract violation, **2** = usage error (bad or missing flags).
- Machine output goes to **stdout as JSON**; human-readable reasons go to **stderr**.
- No script may crash on a missing file, a non-git directory, or malformed JSON — it reports instead.
- Contract strings are **copied verbatim** from the current plugin files. Never invent or re-word a string a plugin parses.
- Source of truth for the contract is `shared/references/contract.md`. `docs/contract.md` and `plugins/<x>/references/contract.md` are **generated copies** and must never be hand-edited.
- Never push. Never use bare `git stash`. All work happens in the worktree `/Users/jaxsonmansouri/Desktop/Projects/shipyard/.claude/worktrees/foundation` on branch `feat/foundation`.
- The existing pre-commit hook (`.claude/hooks/check-readme-updated.sh`) **denies `git commit`** when anything under `plugins/` or `.claude-plugin/` is staged without `README.md` staged in the same commit. Any task that stages a file under `plugins/` MUST also stage `README.md` in that same commit.
- Do **not** modify plugin `SKILL.md` files — that is Epics B and C. Do **not** create `plugins/dashboard` (it lives on another branch).

---

## File Structure

**Created:**

| Path | Responsibility |
|---|---|
| `shared/scripts/metrics.js` | ISO-8601 timestamps + metrics footer emission/parsing |
| `shared/scripts/redact.js` | Secret stripping for log excerpts (stdin→stdout) |
| `shared/scripts/config.js` | Bootstrap/validate/normalize `kanban.config.json` + `ship.config.json` |
| `shared/scripts/validate-artifact.js` | Required-section enforcement for `spec.md` / `plan.md` |
| `shared/scripts/board-trail.js` | Comment→typed-event parsing, authorship trust, state reconciliation |
| `shared/scripts/preflight.js` | Stage-agnostic env/repo checks |
| `shared/scripts/*.test.js` | One `node:test` file per script |
| `shared/scripts/fixtures/*.json` | Real `gh issue view --json …` shapes |
| `shared/references/contract.md` | Contract v1 — the single source of truth |
| `docs/contract.md` | Synced copy of the contract |
| `plugins/<x>/scripts/*.js` | Vendored copies (generated) |
| `plugins/<x>/references/contract.md` | Vendored copy (generated) |
| `scripts/sync-shared.sh` | Copy shared → plugins + docs |
| `scripts/check-shared-sync.sh` | Fail on vendored drift |
| `.claude/hooks/check-shared-and-validate.sh` | Pre-commit sibling hook |
| `.github/workflows/ci.yml` | tests + sync-check + plugin validate |

**Modified:** `.gitignore`, `.claude/settings.json`, `README.md`, every `plugins/*/.claude-plugin/plugin.json`.

---

### Task 1: Repo scaffolding — gitignore and shared tree

**Files:**
- Modify: `.gitignore`
- Create: `shared/scripts/.gitkeep` (removed again once real files land)

- [ ] **Step 1: Add the worktree directory to `.gitignore`**

```
.superpowers/
.claude/worktrees/
```

- [ ] **Step 2: Verify it is ignored**

Run: `git -C <worktree> status --porcelain`
Expected: no `?? .claude/worktrees/` line.

- [ ] **Step 3: Commit**

```bash
git add .gitignore
git commit -m "chore: ignore .claude/worktrees/"
```

---

### Task 2: `metrics.js` — timestamps and footer grammar

**Files:**
- Create: `shared/scripts/metrics.js`
- Test: `shared/scripts/metrics.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `now(): string` — ISO-8601 UTC, second precision, `Z` suffix (`2026-09-08T12:34:56Z`).
  - `footer(opts: {stage, started, finished?, tokensIn?, tokensOut?, reposted?}): string` — one line.
  - `parseFooter(text: string): object|null` — inverse of `footer`, returns `{stage, started, finished, tokensIn, tokensOut, reposted}` with absent numeric fields as `null`.
  - `FOOTER_RE: RegExp`.

**Footer grammar (contract v1) — byte-compatible with the dashboard's existing `plugins/dashboard/server/metrics.js` parser, whose regex is `/<!--\s*shipyard-metrics\s+(\{[\s\S]*?\})\s*-->/g`:**

```
<!-- shipyard-metrics {"stage":"dev","started":"2026-09-08T12:00:00Z","finished":"2026-09-08T12:34:56Z","tokens_in":12345,"tokens_out":6789} -->
```

The payload is a single JSON object on one line. Key order is fixed: `stage`, `started`, `finished`, `tokens_in`, `tokens_out`, `reposted`. `finished`, `tokens_in`, `tokens_out` and `reposted` are **omitted entirely** when unknown — never emitted as placeholders or nulls. The parser accepts keys in any order and extra whitespace, and returns `null` when no block is present. The dashboard's parser requires `stage`, `started` and `finished`, so a footer emitted at stage start (no `finished`) is correctly ignored by it rather than mis-parsed.

- [ ] **Step 1: Write the failing tests**

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test shared/scripts/metrics.test.js`
Expected: FAIL — `Cannot find module './metrics.js'`.

- [ ] **Step 3: Implement `metrics.js`**

Export `now`, `footer`, `parseFooter`, `FOOTER_RE`, `STAGES` (`['prd','kanban','spec','plan','dev','qa','ship','pr']`). CLI:

```
Usage: node metrics.js <command> [options]

Commands:
  now                          Print the current time as ISO-8601 UTC (second precision).
  footer --stage <s> --started <iso> [--finished <iso>]
         [--tokens-in <n>] [--tokens-out <n>] [--reposted]
                               Print the contract v1 metrics footer line.
  parse-footer                 Read a comment body on stdin, print the parsed footer as JSON.

Exit codes: 0 ok, 1 no footer found (parse-footer), 2 usage error.
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test shared/scripts/metrics.test.js`
Expected: all pass.

- [ ] **Step 5: Verify the CLI by hand**

Run: `node shared/scripts/metrics.js footer --stage dev --started 2026-09-08T12:00:00Z --tokens-in 5 --tokens-out 6`
Expected: `<!-- shipyard-metrics {"stage":"dev","started":"2026-09-08T12:00:00Z","tokens_in":5,"tokens_out":6} -->`

- [ ] **Step 6: Commit**

```bash
git add shared/scripts/metrics.js shared/scripts/metrics.test.js
git commit -m "feat(shared): metrics.js — ISO timestamps and contract v1 footer"
```

---

### Task 3: `redact.js` — strip secrets from log excerpts

**Files:**
- Create: `shared/scripts/redact.js`
- Test: `shared/scripts/redact.test.js`

**Interfaces:**
- Produces: `redact(text: string): string`, `PATTERNS: Array<{name, re, replace}>`.

Replacement token is the literal `[REDACTED]`; for DSNs only the credential segment is replaced, so `postgres://user:pass@host/db` becomes `postgres://[REDACTED]@host/db` (host stays readable for debugging).

- [ ] **Step 1: Write the failing tests**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { redact } = require('./redact.js');

test('redacts a postgres DSN credential (L-15)', () => {
  assert.equal(redact('DATABASE_URL=postgres://user:pass@host:5432/db'),
    'DATABASE_URL=postgres://[REDACTED]@host:5432/db');
});

test('redacts credentials in any scheme', () => {
  assert.equal(redact('https://alice:s3cret@example.com/x'), 'https://[REDACTED]@example.com/x');
});

test('redacts github and generic bearer tokens', () => {
  assert.match(redact('token ghp_abcdefghijklmnopqrstuvwxyz0123456789'), /\[REDACTED\]/);
  assert.match(redact('Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.abc.def'), /Bearer \[REDACTED\]/);
});

test('redacts key=value secrets', () => {
  for (const line of ['password=hunter2', 'API_KEY: abc123def456', 'secret="xyzzy"', 'AWS_SECRET_ACCESS_KEY=abc/def+ghi']) {
    assert.match(redact(line), /\[REDACTED\]/, line);
  }
});

test('redacts a Cookie header', () => {
  assert.equal(redact('Cookie: session=abc; other=def'), 'Cookie: [REDACTED]');
});

test('leaves ordinary log text untouched', () => {
  const s = 'Server listening on http://localhost:3000 — 24 tests passed';
  assert.equal(redact(s), s);
});

test('is idempotent', () => {
  const once = redact('password=hunter2');
  assert.equal(redact(once), once);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test shared/scripts/redact.test.js` → FAIL (module not found).

- [ ] **Step 3: Implement `redact.js`**

CLI reads all of stdin, writes redacted text to stdout, exits 0. `--help` prints:

```
Usage: node redact.js [--help]

Reads text on stdin, writes it to stdout with secrets replaced by [REDACTED].
Patterns: URL credentials (scheme://user:pass@host), bearer/JWT tokens,
GitHub tokens (ghp_/gho_/ghu_/ghs_/ghr_/github_pat_), AWS access keys,
Slack tokens, private-key blocks, Cookie/Set-Cookie headers, and
key=value / key: value pairs whose key matches password|passwd|secret|token|api[-_]?key|auth.
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test shared/scripts/redact.test.js` → all pass.

- [ ] **Step 5: Verify the CLI**

Run: `printf 'postgres://u:p@h/db\n' | node shared/scripts/redact.js`
Expected: `postgres://[REDACTED]@h/db`

- [ ] **Step 6: Commit**

```bash
git add shared/scripts/redact.js shared/scripts/redact.test.js
git commit -m "feat(shared): redact.js — strip secrets from board-bound log excerpts"
```

---

### Task 4: `validate-artifact.js` — required sections of spec.md / plan.md

**Files:**
- Create: `shared/scripts/validate-artifact.js`
- Test: `shared/scripts/validate-artifact.test.js`

**Interfaces:**
- Produces: `validate(kind: 'spec'|'plan', text: string): {ok, missing: string[], found: string[], notes: string[]}`, `REQUIRED: {spec: [...], plan: [...]}`.

Required sections are taken verbatim from `plugins/planning/skills/speccing-tickets/SKILL.md` and `plugins/planning/skills/planning-tickets/SKILL.md` — the implementer copies the heading strings from those files rather than inventing them. Matching is on the heading text after the `#`s, case-insensitive, whitespace-trimmed. A `plan.md` must additionally contain at least one heading matching `/^###\s+Task\s+\d+\b/`.

- [ ] **Step 1: Write the failing tests**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { validate, REQUIRED } = require('./validate-artifact.js');

const goodPlan = REQUIRED.plan.map(h => `## ${h}\n\nbody\n`).join('\n') + '\n### Task 1: Do the thing\n\n- [ ] Step 1\n';

test('a plan with every required section and a Task heading passes', () => {
  const r = validate('plan', goodPlan);
  assert.equal(r.ok, true, JSON.stringify(r.missing));
});

test('a plan with a renamed "### Task" heading fails (E-11)', () => {
  const bad = goodPlan.replace('### Task 1: Do the thing', '### Step 1: Do the thing');
  const r = validate('plan', bad);
  assert.equal(r.ok, false);
  assert.ok(r.missing.some(s => /Task N/i.test(s)));
});

test('a spec missing "Done means" fails and names it', () => {
  const spec = REQUIRED.spec.filter(h => !/done means/i.test(h)).map(h => `## ${h}\n\nbody\n`).join('\n');
  const r = validate('spec', spec);
  assert.equal(r.ok, false);
  assert.ok(r.missing.some(s => /done means/i.test(s)));
});

test('heading matching ignores case and trailing whitespace', () => {
  const r = validate('plan', goodPlan.replace(/^## Done means/mi, '##   DONE MEANS   '));
  assert.equal(r.ok, true, JSON.stringify(r.missing));
});

test('a missing file is reported, not thrown', () => {
  const r = validate('spec', '');
  assert.equal(r.ok, false);
  assert.ok(r.missing.length > 0);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test shared/scripts/validate-artifact.test.js` → FAIL.

- [ ] **Step 3: Implement `validate-artifact.js`**

CLI:

```
Usage: node validate-artifact.js <spec|plan> <path> [--json]

Checks that the artifact contains every section contract v1 requires.
Prints missing/renamed sections to stderr; --json prints the full report to stdout.
Exit codes: 0 valid, 1 missing sections or unreadable file, 2 usage error.
```

A path that does not exist exits 1 with `cannot read <path>: <reason>` on stderr — never throws.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test shared/scripts/validate-artifact.test.js` → all pass.

- [ ] **Step 5: Commit**

```bash
git add shared/scripts/validate-artifact.js shared/scripts/validate-artifact.test.js
git commit -m "feat(shared): validate-artifact.js — enforce spec.md/plan.md sections"
```

---

### Task 5: `config.js` — bootstrap, validate, normalize board configs

**Files:**
- Create: `shared/scripts/config.js`
- Test: `shared/scripts/config.test.js`

**Interfaces:**
- Produces:
  - `normalizeTarget(backend: 'github'|'jira', raw: string): string` — GitHub URL → `owner/repo`; Jira project key upper-cased.
  - `validateConfig(kind: 'kanban'|'ship', obj: object): {ok, errors: string[], value: object}` — fills defaults, adds `"version": 1`.
  - `bootstrap({kind, backend, target, cwd}): {path, created: boolean, value, notes: string[]}`.
  - `load({kind, cwd}): {ok, path, value, errors}`.
  - `DEFAULTS: {kanban: {...}, ship: {...}}`.

Config shapes are copied verbatim from `plugins/kanban/skills/creating-tickets/SKILL.md` (kanban) and `plugins/qa/references/environments.md` + `plugins/ship/skills/shipping-tickets/SKILL.md` (ship), plus the new `approvers: []` key (Decision 4) and `"version": 1` (Decision 3).

- [ ] **Step 1: Write the failing tests**

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test shared/scripts/config.test.js` → FAIL.

- [ ] **Step 3: Implement `config.js`**

CLI:

```
Usage: node config.js <command> [options]

Commands:
  bootstrap <kanban|ship> --backend <github|jira> --target <o/r|KEY> [--cwd <dir>]
                          Create .claude/<kind>.config.json if absent; never overwrites.
  validate [kanban|ship] [--cwd <dir>]
                          Validate one or both configs. Prints errors to stderr.
  show [kanban|ship] [--cwd <dir>]
                          Print the normalized config as JSON.

Exit codes: 0 ok, 1 invalid/missing config, 2 usage error.
```

Gitignore detection uses `git check-ignore -q .claude/<file>` (absent git → the "not a git repository" note). Files are written with 2-space indent and a trailing newline.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test shared/scripts/config.test.js` → all pass.

- [ ] **Step 5: Commit**

```bash
git add shared/scripts/config.js shared/scripts/config.test.js
git commit -m "feat(shared): config.js — bootstrap/validate/normalize board configs"
```

---

### Task 6: `board-trail.js` fixtures — real `gh` JSON shapes

**Files:**
- Create: `shared/scripts/fixtures/issue-happy-path.json`, `issue-forged-verdict.json`, `issue-verdict-without-handoff.json`, `issue-duplicate-round.json`, `issue-cap-mismatch.json`, `issue-standalone.json`, `issue-legacy-approvals.json`, `issue-empty.json`
- Test: covered by Task 7's tests.

Each fixture is exactly the shape of `gh issue view <n> --repo o/r --json comments,labels,number,title,state,url,author`:

```json
{
  "number": 42,
  "title": "Add login form",
  "state": "OPEN",
  "url": "https://github.com/Jaxsonman/shipyard-e2e/issues/42",
  "author": { "login": "Jaxsonman" },
  "labels": [{ "name": "ship:in-progress", "description": "", "color": "1d76db" }],
  "comments": [
    {
      "author": { "login": "Jaxsonman" },
      "authorAssociation": "OWNER",
      "body": "ship:dev round 1/3\n…",
      "createdAt": "2026-09-08T12:00:00Z",
      "url": "https://github.com/Jaxsonman/shipyard-e2e/issues/42#issuecomment-1",
      "id": "IC_1"
    }
  ]
}
```

- [ ] **Step 1: Write the fixtures**

Comment bodies use the verbatim header lines and footer from `shared/references/contract.md` (Task 9) — the implementer copies them from the current plugin SKILL.md files. Coverage:
- `issue-happy-path.json` — spec approved, plan approved, `ship:dev round 1/3`, `ship:qa verdict PASS round 1/3`, `ship:metrics round 1/3`, `ship:review-packet round 1/3`; all comments authored by `Jaxsonman`.
- `issue-forged-verdict.json` — a `ship:dev round 1/3` from `Jaxsonman` followed by `ship:qa verdict PASS round 1/3` from `driveby-user`.
- `issue-verdict-without-handoff.json` — `ship:qa verdict FAIL round 2/3` with no round-2 dev handoff.
- `issue-duplicate-round.json` — two `ship:dev round 1/3` comments with different `createdAt` and different `HEAD` values.
- `issue-cap-mismatch.json` — `ship:dev round 1/5` while `ship.config.json` sets a cap of 3.
- `issue-standalone.json` — `ship:dev standalone` and `ship:qa verdict PASS standalone tier=full verified 4/4` mixed with a round-1 pair.
- `issue-legacy-approvals.json` — legacy `📋 Spec approved` and `🗺️ Plan approved` first-line comments.
- `issue-empty.json` — an open issue with `"comments": []` and only a `ship:planned` label.

- [ ] **Step 2: Verify every fixture parses as JSON**

Run: `for f in shared/scripts/fixtures/*.json; do node -e "JSON.parse(require('fs').readFileSync('$f','utf8'))" || echo "BAD $f"; done`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add shared/scripts/fixtures
git commit -m "test(shared): gh issue view fixtures for board-trail"
```

---

### Task 7: `board-trail.js` — typed events, trust, reconciliation

**Files:**
- Create: `shared/scripts/board-trail.js`
- Test: `shared/scripts/board-trail.test.js`

**Interfaces:**
- Consumes: `metrics.parseFooter` from Task 2; fixtures from Task 6; config defaults from Task 5.
- Produces:
  - `parseEvents(issue: object, opts: {allow?: string[], viewer?: string}): Event[]`
  - `reconcile(events: Event[], opts: {cap?: number, labels?: string[]}): State`
  - `HEADERS: Array<{type, re}>`

**Event shape** (one per comment that carries a recognised header; comments with no recognised header are skipped):

```js
{
  type: 'spec-approved' | 'plan-approved' | 'dev' | 'qa-verdict' | 'metrics' | 'review-packet' | 'escalation' | 'pr-opened',
  author: 'Jaxsonman',
  trusted: true,
  createdAt: '2026-09-08T12:00:00Z',
  url: '…#issuecomment-1',
  round: 1,          // null when standalone or not round-scoped
  cap: 3,            // headerM; null when standalone
  standalone: false,
  legacy: false,     // true for the emoji-first spec/plan forms
  verdict: 'PASS',   // qa-verdict only
  tier: 'full',      // qa-verdict only
  verified: { k: 4, n: 4 },   // qa-verdict only, else null
  criteriaDerived: false,     // qa-verdict only
  cause: 'cap',      // escalation only
  url_opened: '…',   // pr-opened only
  reposted: false,
  metrics: { stage, started, finished, tokensIn, tokensOut } | null,
  raw: '<first line verbatim>'
}
```

**State shape:**

```js
{
  phase: 'unstarted'|'spec-approved'|'plan-approved'|'dev-in-progress'|'awaiting-qa'|'awaiting-review'|'escalated'|'pr-open',
  round: 2,            // highest round with a trusted dev handoff
  cap: 3,              // config cap, or header cap when no config cap is given
  trusted: true,       // false when any load-bearing event was untrusted
  irreconcilable: [ { code, message, url } ],
  untrusted: [ { type, author, url } ],
  rounds: { '1': { dev: Event|null, qa: Event|null, metrics: Event|null, packet: Event|null } },
  standalone: [ Event ],
  escalation: Event|null
}
```

**Trust rule (Decision 4):** an event is `trusted: true` iff its author login equals `opts.viewer` (the invoking `gh` account) or appears in `opts.allow` (from `--allow` or `ship.config.json` `approvers`). Case-insensitive comparison. When `opts.viewer` is unknown, `trusted` is `false` for everyone not in `allow`.

**Irreconcilable codes:** `verdict-without-handoff` (L-19), `cap-mismatch` (L-9), `untrusted-verdict` (L-1/L-2), `round-gap`, `unknown-verdict`, `malformed-header`.

**Dedupe:** when two trusted events of the same type share a round, the one with the latest `createdAt` wins (ties broken by later array position); the loser is retained in `state.rounds[N].superseded[]` (L-20).

**Standalone (L-10):** `standalone` events never advance `round`, are never counted for cap arithmetic, and are collected in `state.standalone` so resume can report them.

- [ ] **Step 1: Write the failing tests**

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test shared/scripts/board-trail.test.js` → FAIL.

- [ ] **Step 3: Implement `board-trail.js`**

CLI:

```
Usage: node board-trail.js parse [options]

  --repo <owner/repo>    Fetch the issue with `gh issue view` (requires gh on PATH).
  --issue <n>            Issue number (with --repo).
  --stdin                Read `gh issue view --json comments,labels,number,title,state,url,author` JSON on stdin.
  --allow <a,b>          Extra trusted logins (merged with ship.config.json approvers).
  --config <path>        ship.config.json to read `cap` and `approvers` from.
  --viewer <login>       The invoking gh account; defaults to `gh api user -q .login`.
  --pretty               Pretty-print the JSON output.

Prints {"events": [...], "state": {...}} to stdout.
Exit codes: 0 parsed, 1 irreconcilable state, 2 usage error.
```

`gh` is invoked with exactly `gh issue view <n> --repo <o/r> --json comments,labels,number,title,state,url,author`. A `gh` failure exits 2 with the stderr text — never throws.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test shared/scripts/board-trail.test.js` → all pass.

- [ ] **Step 5: Commit**

```bash
git add shared/scripts/board-trail.js shared/scripts/board-trail.test.js
git commit -m "feat(shared): board-trail.js — trusted event parsing and state reconciliation"
```

---

### Task 8: `preflight.js` — stage-agnostic environment and repo checks

**Files:**
- Create: `shared/scripts/preflight.js`
- Test: `shared/scripts/preflight.test.js`

**Interfaces:**
- Consumes: `config.load` from Task 5.
- Produces: `preflight({stage, ticket?, base?, cwd?, exec?}): Report`, `STAGES`.

`exec` is an injectable command runner `(cmd, args) => {code, stdout, stderr}` so tests never touch the network — it defaults to a `child_process.spawnSync` wrapper.

**Report shape:**

```js
{
  stage: 'dev',
  ok: false,
  checks: [ { id: 'git-repo', ok: true, level: 'error', message: 'inside a git repository (/path)' } ],
  reasons: [ 'branch feat/42-login is checked out in another worktree: /path/wt' ]
}
```

`level` is `error` (fails the stage) or `warn` (reported, `ok` stays true). `ok` is true iff no `error`-level check failed.

**Checks, by id:** `git-repo`, `node-version` (≥ 18), `gh-installed`, `gh-auth` (`gh auth status`), `repo-access` (`gh repo view <target>`), `config` (via `config.load`, kanban for `kanban`, ship for `dev|qa|ship|pr`, either for `spec|plan`, none for `prd`), and for ticket stages (`spec|plan|dev|qa|ship|pr` with `--ticket`): `branch-match` (`feat/<id>-*` across local and `origin/`; 0 → warn for `dev`, error for `qa|ship|pr`; >1 → error naming every match, L-7), `branch-divergence` (local vs `origin/` ahead/behind counts), `worktree-elsewhere` (`git worktree list --porcelain` naming the path holding the branch, L-3), `worktree-collision` (the conventional worktree path already exists and is not that branch's worktree).

**Safety:** run in a non-git directory the `git-repo` check fails, every git-dependent check is `skipped: true`, and the process still exits with a JSON report — it must never throw.

- [ ] **Step 1: Write the failing tests**

```js
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

test('the report is JSON-serialisable and lists reasons for every failed error check', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-nogit2-'));
  const r = preflight({ stage: 'qa', ticket: 7, cwd: dir, exec: fakeExec({}) });
  JSON.parse(JSON.stringify(r));
  const failed = r.checks.filter(c => c.ok === false && c.level === 'error');
  assert.equal(r.reasons.length, failed.length);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test shared/scripts/preflight.test.js` → FAIL.

- [ ] **Step 3: Implement `preflight.js`**

CLI:

```
Usage: node preflight.js --stage <prd|kanban|spec|plan|dev|qa|ship|pr> [options]

  --ticket <n>     Ticket/issue id — enables the branch and worktree checks.
  --base <branch>  Base branch to compare against (default: main).
  --cwd <dir>      Directory to check (default: process.cwd()).
  --json           Print only the JSON report (default: JSON on stdout, reasons on stderr).
  --quiet          Suppress the human-readable reasons.

Exit codes: 0 all error-level checks passed, 1 one or more failed, 2 usage error.
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test shared/scripts/preflight.test.js` → all pass.

- [ ] **Step 5: Verify it is safe outside a git repo**

Run: `cd $(mktemp -d) && node <worktree>/shared/scripts/preflight.js --stage prd; echo "exit=$?"`
Expected: a JSON report on stdout, reasons on stderr, `exit=1`, no stack trace.

- [ ] **Step 6: Commit**

```bash
git add shared/scripts/preflight.js shared/scripts/preflight.test.js
git commit -m "feat(shared): preflight.js — stage-agnostic environment and repo checks"
```

---

### Task 9: Contract v1 document (H-01)

**Files:**
- Create: `shared/references/contract.md`

Every verbatim string is **copied** from these sources (read them; do not retype from memory):
`plugins/ship/references/github.md`, `plugins/ship/references/jira.md`, `plugins/ship/skills/shipping-tickets/SKILL.md`, `plugins/dev/skills/implementing-tickets/SKILL.md`, `plugins/dev/references/github.md`, `plugins/qa/skills/verifying-branches/SKILL.md`, `plugins/qa/references/environments.md`, `plugins/planning/skills/*/SKILL.md`, `plugins/kanban/skills/creating-tickets/SKILL.md`.

**Required sections, in this order:**

1. `# Shipyard Contract v1` — version, date, status, and the rule that `shared/references/contract.md` is the source of truth and all other copies are generated.
2. `## Scope and versioning` — what the contract governs; contract version bumps and README call-outs (Decision 3).
3. `## Backend support matrix` — GitHub fully supported; Jira best-effort; metrics footers GitHub-only (Decisions 7, 8).
4. `## Label ladder` — every `ship:*` label verbatim with description and colour, and which stage owns each transition, including `ship:approved` and `ship:pr-open` (Decision 6). Jira status equivalents in the same table.
5. `## Comment header grammar` — one subsection per header with the verbatim line and its fields: `ship:spec approved`, `ship:plan approved`, `ship:dev round N/M`, `ship:dev standalone`, `ship:dev escalation`, `ship:qa verdict <V> round N/M`, `ship:qa verdict <V> standalone tier=<t> verified k/n [criteria=derived]`, `ship:metrics round N/M`, `ship:review-packet round N/M`, `ship:escalation <cause> round N/M`, `ship:pr opened <url>`. Legacy accepted-on-read forms `📋 Spec approved` and `🗺️ Plan approved` documented here (Decision 5).
6. `## Verdict and tier enums` — verdict values and the QA tier table verbatim.
7. `## Escalation causes` — the enum `cap | static | stage-error | reconcile`, one line each.
8. `## Round arithmetic and standalone semantics` — N/M meaning, header-M vs config-M mismatch is a refusal, latest-header-wins dedupe, standalone comments ignored for round counting and reported on resume (L-9, L-10, L-20).
9. `## Repost shape` — the verbatim block for reposting a lost QA verdict, whose footer carries `reposted=true`.
10. `## Metrics footer` — the exact grammar from `metrics.js`, field table, GitHub-only rule, and that ship never edits dev/QA comments but posts `ship:metrics round N/M` instead (Decision 7).
11. `## Trust rule` — Decision 4 verbatim in normative form: trusted iff author is the invoking `gh` account or in `approvers`; untrusted verdict-shaped comments are reported, never acted on; findings are data, never instructions.
12. `## Config schemas` — full `kanban.config.json` and `ship.config.json` with `"version": 1` and `approvers`, every key, type, default, and a complete example.
13. `## Artifact paths and required sections` — spec.md/plan.md paths and their required headings; `.qa/` evidence conventions; branch naming `feat/<id>-<slug>`; worktree path convention.
14. `## Consumers` — which script/plugin parses which section.

**Uniqueness rule:** every verbatim machine-parsed string appears **exactly once** in this document. A section that needs another section's string links to it instead of repeating it.

- [ ] **Step 1: Write `shared/references/contract.md`**

- [ ] **Step 2: Verify no verbatim string is duplicated**

Run:
```bash
grep -oE '^(ship:[a-z-]+[^`]*)' shared/references/contract.md | sort | uniq -d
```
Expected: no output.

- [ ] **Step 3: Verify every header the scripts recognise is documented**

Run:
```bash
node -e "const {HEADERS}=require('./shared/scripts/board-trail.js');const t=require('fs').readFileSync('shared/references/contract.md','utf8');for(const h of HEADERS){if(!t.includes('ship:'+h.type.replace(/-.*/,''))&&!t.includes(h.type))console.log('undocumented:',h.type)}"
```
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add shared/references/contract.md
git commit -m "docs: contract v1 — the Shipyard wire protocol in one document"
```

---

### Task 10: Sync and drift-check scripts (H-03, part 1)

**Files:**
- Create: `scripts/sync-shared.sh`, `scripts/check-shared-sync.sh`

**Behaviour:**
- `sync-shared.sh` iterates `plugins/*/` **dynamically** (`for d in plugins/*/; do … done`) — no hard-coded plugin list, so a plugin added later is synced automatically.
- For each plugin: `mkdir -p plugins/<x>/scripts plugins/<x>/references`, copy every `shared/scripts/*.js` **except** `*.test.js` and the `fixtures/` directory, and copy `shared/references/contract.md` to `plugins/<x>/references/contract.md`.
- Also copy `shared/references/contract.md` to `docs/contract.md`.
- Each generated file gets no added header (a header would break `node` parsing of `.js` diffs); instead, `docs/contract.md` and the vendored contracts are declared generated in README and in the contract's own header line.
- Stale vendored scripts (a `plugins/<x>/scripts/*.js` with no counterpart in `shared/scripts/`) are **deleted** so a renamed script does not linger.
- `check-shared-sync.sh` re-runs the same copy logic into a temporary tree and `diff -ru`s it against the committed tree; prints every drifting path and exits 1. It must not modify the working tree.
- Both scripts `set -euo pipefail`, resolve the repo root from their own location (`cd "$(dirname "$0")/.."`), and support `--help`. `check-shared-sync.sh` is silent on success apart from one `OK` line, and prints nothing at all with `--quiet`.

- [ ] **Step 1: Write `scripts/sync-shared.sh` and `scripts/check-shared-sync.sh`, `chmod +x` both**

- [ ] **Step 2: Run the sync**

Run: `bash scripts/sync-shared.sh`
Expected: `plugins/<x>/scripts/*.js` and `plugins/<x>/references/contract.md` exist for all six plugins; `docs/contract.md` exists; no `*.test.js` and no `fixtures/` under any plugin.

Verify: `find plugins -name '*.test.js' -o -name fixtures | grep . && echo "LEAK"` → prints nothing.

- [ ] **Step 3: Verify the check passes clean**

Run: `bash scripts/check-shared-sync.sh; echo "exit=$?"` → `exit=0`.

- [ ] **Step 4: Verify the check catches drift**

Run:
```bash
echo "// drift" >> plugins/dev/scripts/metrics.js
bash scripts/check-shared-sync.sh; echo "exit=$?"
```
Expected: `exit=1` and `plugins/dev/scripts/metrics.js` named in the output.

Then: `bash scripts/sync-shared.sh && bash scripts/check-shared-sync.sh; echo "exit=$?"` → `exit=0`.

- [ ] **Step 5: Verify a stale vendored script is removed**

Run:
```bash
echo "// stale" > plugins/qa/scripts/gone.js
bash scripts/sync-shared.sh
test ! -f plugins/qa/scripts/gone.js && echo REMOVED
```
Expected: `REMOVED`.

- [ ] **Step 6: Commit — this commit stages files under `plugins/`, so README.md must be staged too**

Fold the README changes of Task 13 into this commit if it lands first, or land Task 13 first and amend. The commit must contain `scripts/`, the vendored `plugins/*/`, `docs/contract.md`, and `README.md` together.

```bash
git add scripts plugins docs/contract.md README.md
git commit -m "feat: vendor shared scripts and contract into every plugin"
```

---

### Task 11: `version` in every plugin.json (Decision 11)

**Files:**
- Modify: `plugins/dev/.claude-plugin/plugin.json`, `plugins/kanban/…`, `plugins/planning/…`, `plugins/prd/…`, `plugins/qa/…`, `plugins/ship/…`

- [ ] **Step 1: Add `"version": "1.0.0"` to each manifest**

Place it directly after `"description"`. Keep 2-space indent and the existing key order otherwise.

- [ ] **Step 2: Verify each file is still valid JSON**

Run: `for f in plugins/*/.claude-plugin/plugin.json; do node -e "JSON.parse(require('fs').readFileSync('$f','utf8'))" || echo "BAD $f"; done`
Expected: no output.

- [ ] **Step 3: Verify validate reports 0 warnings**

Run: `claude plugin validate .`
Expected: no `⚠` lines; validation passes.

- [ ] **Step 4: Commit (stages `plugins/`, so `README.md` goes in too)**

```bash
git add plugins README.md
git commit -m "chore: add semver version 1.0.0 to every plugin manifest"
```

---

### Task 12: Pre-commit hook and CI (H-03, part 2)

**Files:**
- Create: `.claude/hooks/check-shared-and-validate.sh`, `.github/workflows/ci.yml`
- Modify: `.claude/settings.json`

**Hook contract:** the existing `check-readme-updated.sh` prints a `PreToolUse` deny JSON block when it wants to block and prints nothing on success. The new sibling follows the same shape and is registered as a second entry in the same `PreToolUse`/`Bash` hook array with the same `"if": "Bash(git commit *)"`.

The sibling denies the commit when either:
- `bash scripts/check-shared-sync.sh --quiet` exits non-zero — reason names the drifting paths and tells the user to run `bash scripts/sync-shared.sh`, or
- `claude plugin validate .` reports **errors** (a line containing `✖` or an exit code ≠ 0) — warnings alone do not block.

Speed: it runs only when the staged set touches `shared/`, `plugins/`, `scripts/`, or `.claude-plugin/`; otherwise it exits 0 immediately printing nothing. If `claude` is not on `PATH`, the validate half is skipped silently (CI still covers it).

- [ ] **Step 1: Write `.claude/hooks/check-shared-and-validate.sh` and `chmod +x`**

- [ ] **Step 2: Register it in `.claude/settings.json`**

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "bash .claude/hooks/check-readme-updated.sh", "if": "Bash(git commit *)" },
          { "type": "command", "command": "bash .claude/hooks/check-shared-and-validate.sh", "if": "Bash(git commit *)" }
        ]
      }
    ]
  }
}
```

- [ ] **Step 3: Verify the hook is quiet on a clean tree and fast**

Run: `time bash .claude/hooks/check-shared-and-validate.sh`
Expected: no output, exit 0, well under two seconds when nothing relevant is staged.

- [ ] **Step 4: Verify the hook blocks on drift**

Run:
```bash
echo "// drift" >> plugins/dev/scripts/metrics.js && git add plugins/dev/scripts/metrics.js
bash .claude/hooks/check-shared-and-validate.sh
git restore --staged plugins/dev/scripts/metrics.js && bash scripts/sync-shared.sh
```
Expected: a JSON block with `"permissionDecision": "deny"` naming `plugins/dev/scripts/metrics.js`.

- [ ] **Step 5: Write `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
  pull_request:

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Unit tests
        run: node --test shared/scripts/*.test.js
      - name: Vendored copies are in sync
        run: bash scripts/check-shared-sync.sh
      - name: Plugin manifests validate
        run: npx --yes @anthropic-ai/claude-code plugin validate .
```

No secrets and no `ANTHROPIC_API_KEY` are required: `plugin validate` is a local manifest check. Verify that claim locally with `npx --yes @anthropic-ai/claude-code plugin validate .` before committing; if that invocation is wrong, substitute the documented install (`npm i -g @anthropic-ai/claude-code && claude plugin validate .`) and record the deviation in the report.

- [ ] **Step 6: Verify the whole CI command set passes locally**

Run:
```bash
node --test shared/scripts/*.test.js && bash scripts/check-shared-sync.sh && claude plugin validate .
```
Expected: tests pass, sync OK, validate reports 0 warnings.

- [ ] **Step 7: Commit**

```bash
git add .claude/hooks/check-shared-and-validate.sh .claude/settings.json .github/workflows/ci.yml
git commit -m "ci: shared-sync + plugin validate in the pre-commit hook and GitHub Actions"
```

---

### Task 13: README — contract link, shared scripts, CI section

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add a `Contract` line near the top**

One sentence linking `docs/contract.md`, stating it is contract v1, that it is the single definition of the labels, comment headers, footers, and config schemas every plugin parses, and that `docs/contract.md` and `plugins/*/references/contract.md` are generated from `shared/references/contract.md`.

- [ ] **Step 2: Add a `## Shared scripts` section**

Name the six scripts and their one-line purpose, state the Node ≥ 18 / CommonJS / zero-dependency rule, show `node "${CLAUDE_PLUGIN_ROOT}/scripts/<name>.js" --help` as the way a skill invokes one, and say `bash scripts/sync-shared.sh` regenerates the vendored copies and that `plugins/*/scripts/` must never be hand-edited.

- [ ] **Step 3: Add a `## Verification` section**

```bash
node --test shared/scripts/*.test.js   # unit tests (the directory form fails on Node 25)
bash scripts/check-shared-sync.sh      # vendored copies match shared/
claude plugin validate .               # plugin manifests
```

Note that the pre-commit hook and `.github/workflows/ci.yml` run all three.

- [ ] **Step 4: Verify the links resolve**

Run: `grep -o 'docs/contract.md' README.md && test -f docs/contract.md && echo OK`
Expected: `OK`.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: README — contract link, shared scripts, verification"
```

---

### Task 14: Adversarial review and fixes

- [ ] **Step 1: Run the full verification set**

```bash
node --test shared/scripts/*.test.js
bash scripts/check-shared-sync.sh
claude plugin validate .
```

- [ ] **Step 2: Dispatch one `refuter` subagent (model opus)**

Give it `git diff main...feat/foundation` plus the acceptance criteria of H-01, H-02 and H-03 verbatim from the spec, and instruct it to find inputs that break the scripts and contract strings that were invented rather than copied — not to praise the change.

- [ ] **Step 3: Fix every real finding, re-run Step 1, commit**

```bash
git add -A
git commit -m "fix: refuter findings on the foundation wave"
```

---

## Self-Review

**Spec coverage:** Decision 1 → Tasks 10, 12. Decision 2 → Global Constraints, Tasks 2–8. Decision 3 → Task 9. Decision 4 → Tasks 7, 9. Decision 5 → Tasks 7, 9. Decision 7 → Tasks 2, 9. Decision 11 → Task 11. Shared-scripts table → Tasks 2–8. H-01 → Task 9. H-02 → Tasks 2–8. H-03 → Tasks 10, 11, 12. `.gitignore` → Task 1. README → Task 13. Refuter → Task 14.

**Ordering note:** Tasks 10, 11 and 13 all stage files that the README hook guards. Land Task 13 (README) before Task 10 and Task 11, and include `README.md` in each of those commits.
