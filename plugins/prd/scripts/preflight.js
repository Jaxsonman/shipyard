'use strict';
/**
 * preflight.js — stage-agnostic environment and repository checks, run at
 * step 1 of every Shipyard command, before any interview or expensive work.
 *
 * Implements the preconditions named in Shipyard contract v1 §12 (configs)
 * and §13 (branch and worktree conventions).
 *
 * CommonJS, zero dependencies, Node >= 18. Never throws on a missing file,
 * a non-git directory, or a missing binary — it reports.
 */

const path = require('node:path');
const { spawnSync } = require('node:child_process');
const config = require('./config.js');

const USAGE = `Usage: node preflight.js --stage <prd|kanban|spec|plan|dev|qa|ship|pr> [options]

  --ticket <n>     Ticket/issue id — enables the branch and worktree checks.
  --base <branch>  Base branch to compare against (default: main).
  --cwd <dir>      Directory to check (default: process.cwd()).
  --json           Print only the JSON report (default: JSON on stdout, reasons on stderr).
  --quiet          Suppress the human-readable reasons.

Stage pr additionally checks the ship:approved gate and reports an existing
open PR for the branch (reported, never fatal).

Exit codes: 0 all error-level checks passed, 1 one or more failed, 2 usage error.`;

const STAGES = ['prd', 'kanban', 'spec', 'plan', 'dev', 'qa', 'ship', 'pr'];

/** Stages that operate on a ticket branch. */
const TICKET_STAGES = ['spec', 'plan', 'dev', 'qa', 'ship', 'pr'];

/**
 * Which config kind(s) a stage needs, in order. Board identity (`backend`,
 * `target`) lives only in kanban.config.json (contract §12); ship.config.json
 * never carries it. Stages that run against a ticket branch (dev/qa/ship/pr)
 * need both: board identity from kanban, run parameters (baseBranch,
 * loopCap, approvers, qa) from ship.
 */
const STAGE_CONFIG = {
  prd: [],
  kanban: ['kanban'],
  spec: ['kanban'],
  plan: ['kanban'],
  dev: ['kanban', 'ship'],
  qa: ['kanban', 'ship'],
  ship: ['kanban', 'ship'],
  pr: ['kanban', 'ship'],
};

/** Stages for which a missing feat/<id>-* branch is fatal rather than expected. */
const BRANCH_REQUIRED = ['qa', 'ship', 'pr'];

const MIN_NODE_MAJOR = 18;

/**
 * Walk up from `dir` looking for a `.git` entry (a directory in a normal
 * checkout, a file in a linked worktree). Returns the containing directory
 * or null. Never throws.
 */
function findGitRoot(dir) {
  const fs = require('node:fs');
  let cur;
  try {
    cur = path.resolve(dir);
  } catch {
    return null;
  }
  for (;;) {
    try {
      if (fs.existsSync(path.join(cur, '.git'))) return cur;
    } catch {
      return null;
    }
    const up = path.dirname(cur);
    if (up === cur) return null;
    cur = up;
  }
}

/** Parse `gh --json` output. Returns null rather than throwing on garbage. */
function safeJson(text) {
  try {
    return JSON.parse(String(text || ''));
  } catch {
    return null;
  }
}

function defaultExec(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', ...opts });
  if (r.error) return { code: 127, stdout: '', stderr: r.error.message };
  return { code: r.status === null ? 1 : r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

/**
 * @param {{stage: string, ticket?: string|number, base?: string, cwd?: string,
 *          exec?: (cmd: string, args: string[]) => {code: number, stdout: string, stderr: string}}} opts
 * @returns {{stage: string, ok: boolean, checks: object[], reasons: string[]}}
 */
function preflight(opts = {}) {
  const stage = opts.stage;
  if (!STAGES.includes(stage)) {
    throw new Error(`unknown stage "${stage}" — expected one of ${STAGES.join(', ')}`);
  }
  const cwd = opts.cwd || process.cwd();
  const base = opts.base || 'main';
  const ticket = opts.ticket === undefined || opts.ticket === null ? null : String(opts.ticket);
  const rawExec = opts.exec || defaultExec;
  const exec = (cmd, args) => {
    try {
      return rawExec(cmd, args, { cwd });
    } catch (err) {
      return { code: 127, stdout: '', stderr: err.message };
    }
  };

  const checks = [];
  const add = (id, ok, level, message, extra = {}) =>
    checks.push({ id, ok, level, message, skipped: false, ...extra });
  const skip = (id, level, message) =>
    checks.push({ id, ok: true, level, message, skipped: true });

  // --- git repository -----------------------------------------------------
  // Detected on the filesystem rather than through `exec` so the check stays
  // truthful even when a caller injects a stubbed command runner.
  const isRepo = findGitRoot(cwd) !== null;
  add('git-repo', isRepo, 'error',
    isRepo ? `inside a git repository (${cwd})`
      : `not inside a git repository: ${cwd}`);

  // --- node version -------------------------------------------------------
  const major = Number(String(process.versions.node).split('.')[0]);
  add('node-version', major >= MIN_NODE_MAJOR, 'error',
    major >= MIN_NODE_MAJOR ? `Node ${process.versions.node} (>= ${MIN_NODE_MAJOR})`
      : `Node ${process.versions.node} is below the required ${MIN_NODE_MAJOR}`);

  // --- config -------------------------------------------------------------
  // Board identity (backend/target) is owned by kanban.config.json; run
  // parameters (baseBranch/loopCap/approvers/qa) are owned by
  // ship.config.json. A stage may need one or both (contract §12).
  const kinds = STAGE_CONFIG[stage] || [];
  let cfg = null; // merged view: backend/target from kanban, the rest from ship.
  if (kinds.length === 0) {
    skip('config', 'error', `stage ${stage} needs no board config`);
  } else {
    let allOk = true;
    const messages = [];
    const merged = {};
    for (const kind of kinds) {
      const loaded = config.load({ kind, cwd });
      if (!loaded.ok) {
        allOk = false;
        messages.push(`.claude/${kind}.config.json: ${(loaded.errors || ['unreadable']).join('; ')}`);
        continue;
      }
      if (kind === 'kanban') {
        merged.backend = loaded.value.backend;
        merged.target = loaded.value.target;
      } else {
        // ship.config.json owns everything except board identity — never
        // let a stray backend/target on it clobber kanban's (contract §12).
        const { backend, target, ...rest } = loaded.value;
        Object.assign(merged, rest);
      }
    }
    if (allOk) {
      cfg = merged;
      add('config', true, 'error',
        `${kinds.map((k) => `.claude/${k}.config.json`).join(', ')} valid (backend=${merged.backend}, target=${merged.target})`);
    } else {
      add('config', false, 'error', messages.join('; '));
    }
  }

  // --- gh ------------------------------------------------------------------
  const backend = cfg && cfg.backend ? cfg.backend : 'github';
  if (backend !== 'github') {
    skip('gh-installed', 'error', `backend is ${backend} — gh is not used`);
    skip('gh-auth', 'error', `backend is ${backend} — gh auth is not used`);
    skip('repo-access', 'error', `backend is ${backend} — no gh repo access check`);
  } else {
    const ghv = exec('gh', ['--version']);
    const ghOk = ghv.code === 0;
    add('gh-installed', ghOk, 'error',
      ghOk ? (ghv.stdout.split('\n')[0] || 'gh present') : 'gh is not installed or not on PATH');

    if (!ghOk) {
      skip('gh-auth', 'error', 'gh unavailable');
      skip('repo-access', 'error', 'gh unavailable');
    } else {
      const auth = exec('gh', ['auth', 'status']);
      const authOk = auth.code === 0;
      add('gh-auth', authOk, 'error',
        authOk ? 'gh is authenticated' : (auth.stderr || auth.stdout || 'gh auth status failed').trim());

      const target = cfg && cfg.target;
      if (!target) {
        skip('repo-access', 'error', 'no target configured');
      } else if (!authOk) {
        skip('repo-access', 'error', 'gh is not authenticated');
      } else {
        const view = exec('gh', ['repo', 'view', String(target)]);
        add('repo-access', view.code === 0, 'error',
          view.code === 0 ? `can read ${target}` : `cannot read ${target}: ${(view.stderr || '').trim()}`);
      }
    }
  }

  // --- ticket-scoped checks ------------------------------------------------
  /** The single feat/<id>-* branch, when exactly one matched. */
  let resolvedBranch = null;
  const ticketScoped = TICKET_STAGES.includes(stage) && ticket !== null;
  if (!ticketScoped || !isRepo) {
    const why = !isRepo ? 'not a git repository'
      : (ticket === null ? 'no --ticket given' : `stage ${stage} is not ticket-scoped`);
    for (const id of ['branch-match', 'branch-divergence', 'worktree-elsewhere', 'worktree-collision']) {
      skip(id, 'error', why);
    }
  } else {
    const prefix = `feat/${ticket}-`;

    const local = exec('git', ['branch', '--format=%(refname:short)']);
    const remote = exec('git', ['branch', '-r', '--format=%(refname:short)']);
    const lines = (s) => String(s || '').split('\n').map((x) => x.trim()).filter(Boolean);
    const localMatches = lines(local.stdout).filter((b) => b.startsWith(prefix));
    const remoteMatches = lines(remote.stdout)
      .filter((b) => b.startsWith('origin/'))
      .map((b) => b.slice('origin/'.length))
      .filter((b) => b.startsWith(prefix));
    const all = [...new Set([...localMatches, ...remoteMatches])];

    if (all.length === 1) {
      add('branch-match', true, 'error', `one branch matches ${prefix}*: ${all[0]}`, { branch: all[0] });
    } else if (all.length === 0) {
      const fatal = BRANCH_REQUIRED.includes(stage);
      add('branch-match', false, fatal ? 'error' : 'warn',
        `no branch matches ${prefix}*${fatal ? '' : ' — it will be created from ' + base}`);
    } else {
      add('branch-match', false, 'error',
        `${all.length} branches match ${prefix}*: ${all.join(', ')} — resolve to one before continuing`);
    }

    const branch = all.length === 1 ? all[0] : null;
    resolvedBranch = branch;

    if (!branch) {
      skip('branch-divergence', 'warn', 'no single matching branch');
    } else if (!localMatches.includes(branch)) {
      add('branch-divergence', true, 'warn', `${branch} exists only on origin`);
    } else if (!remoteMatches.includes(branch)) {
      add('branch-divergence', true, 'warn', `${branch} exists only locally (never pushed)`);
    } else {
      const counts = exec('git', ['rev-list', '--left-right', '--count', `${branch}...origin/${branch}`]);
      const [ahead, behind] = String(counts.stdout || '').trim().split(/\s+/).map(Number);
      const diverged = counts.code === 0 && (ahead > 0 && behind > 0);
      add('branch-divergence', !diverged, diverged ? 'error' : 'warn',
        counts.code !== 0 ? `cannot compare ${branch} with origin/${branch}`
          : diverged ? `${branch} has diverged from origin/${branch}: ${ahead} ahead, ${behind} behind`
            : `${branch} vs origin/${branch}: ${ahead || 0} ahead, ${behind || 0} behind`);
    }

    const wt = exec('git', ['worktree', 'list', '--porcelain']);
    const holders = {};
    let currentPath = null;
    for (const line of String(wt.stdout || '').split('\n')) {
      if (line.startsWith('worktree ')) currentPath = line.slice('worktree '.length).trim();
      else if (line.startsWith('branch ')) {
        const ref = line.slice('branch '.length).trim().replace(/^refs\/heads\//, '');
        if (currentPath) holders[ref] = currentPath;
      }
    }
    const here = path.resolve(cwd);
    if (!branch) {
      skip('worktree-elsewhere', 'error', 'no single matching branch');
    } else if (holders[branch] && path.resolve(holders[branch]) !== here) {
      add('worktree-elsewhere', false, 'error',
        `branch ${branch} is checked out in another worktree: ${holders[branch]}`,
        { path: holders[branch] });
    } else {
      add('worktree-elsewhere', true, 'error',
        holders[branch] ? `branch ${branch} is checked out here` : `branch ${branch} is not checked out elsewhere`);
    }

    const repoDir = path.basename(here);
    const conventional = path.resolve(here, '..', `${repoDir}-ship`, `dev-${ticket}`);
    const takenBy = Object.entries(holders).find(([, p]) => path.resolve(p) === conventional);
    if (takenBy && branch && takenBy[0] !== branch) {
      add('worktree-collision', false, 'error',
        `worktree path ${conventional} is already held by branch ${takenBy[0]}`, { path: conventional });
    } else {
      add('worktree-collision', true, 'warn',
        takenBy ? `worktree path ${conventional} holds ${takenBy[0]}` : `worktree path ${conventional} is free`,
        { path: conventional });
    }
  }

  // --- pr-stage gate (contract v1 §4: /pr consumes ship:approved) ---------
  if (stage !== 'pr') {
    skip('pr-gate', 'error', `stage ${stage} has no review gate`);
    skip('pr-existing', 'warn', `stage ${stage} does not open pull requests`);
  } else if (backend !== 'github') {
    skip('pr-gate', 'error', `backend is ${backend} — the gate is checked through the Jira reference`);
    skip('pr-existing', 'warn', `backend is ${backend} — no gh pr lookup`);
  } else if (ticket === null) {
    skip('pr-gate', 'error', 'no --ticket given');
    skip('pr-existing', 'warn', 'no --ticket given');
  } else if (!cfg || !cfg.target) {
    skip('pr-gate', 'error', 'no target configured');
    skip('pr-existing', 'warn', 'no target configured');
  } else {
    const target = String(cfg.target);
    const view = exec('gh', ['issue', 'view', ticket, '--repo', target, '--json', 'labels']);
    const parsed = view.code === 0 ? safeJson(view.stdout) : null;
    if (view.code !== 0 || !parsed) {
      add('pr-gate', false, 'error',
        `cannot read the labels of ${target}#${ticket}: ${(view.stderr || view.stdout || 'unparseable gh output').trim()}`);
    } else {
      const names = (parsed.labels || []).map((l) => (typeof l === 'string' ? l : l && l.name)).filter(Boolean);
      const shipLabels = names.filter((n) => String(n).startsWith('ship:'));
      if (shipLabels.length > 1) {
        add('pr-gate', false, 'error',
          `${target}#${ticket} carries multiple ship:* labels: ${shipLabels.join(', ')} — resolve to one before continuing`);
      } else if (shipLabels.includes('ship:approved')) {
        add('pr-gate', true, 'error', `${target}#${ticket} carries ship:approved`);
      } else {
        add('pr-gate', false, 'error',
          `${target}#${ticket} is not ship:approved (current: ${shipLabels[0] || 'no ship:* label'}) — the review gate must approve the review packet first`);
      }
    }

    if (!resolvedBranch) {
      skip('pr-existing', 'warn', 'no single matching branch');
    } else {
      const list = exec('gh', ['pr', 'list', '--repo', target, '--head', resolvedBranch,
        '--state', 'open', '--json', 'url,number']);
      const prs = list.code === 0 ? safeJson(list.stdout) : null;
      if (!Array.isArray(prs)) {
        add('pr-existing', true, 'warn',
          `could not list open PRs for ${resolvedBranch}: ${(list.stderr || 'unparseable gh output').trim()}`);
      } else if (prs.length) {
        add('pr-existing', true, 'warn',
          `an open PR already exists for ${resolvedBranch}: ${prs[0].url} — reconcile it instead of opening another`,
          { prUrl: prs[0].url, prNumber: prs[0].number });
      } else {
        add('pr-existing', true, 'warn', `no open PR for ${resolvedBranch}`);
      }
    }
  }

  const failed = checks.filter((c) => c.ok === false && c.level === 'error');
  return {
    stage,
    ticket,
    base,
    cwd,
    ok: failed.length === 0,
    checks,
    reasons: failed.map((c) => c.message),
  };
}

// ---------------------------------------------------------------- CLI ----

class UsageError extends Error {}

function takeValue(argv, i, flagName) {
  const v = argv[i + 1];
  if (v === undefined) {
    throw new UsageError(`${flagName} requires a value`);
  }
  if (v.startsWith('--')) {
    throw new UsageError(`${flagName} requires a value (got flag-like token "${v}")`);
  }
  return v;
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json' || a === '--quiet') out[a.slice(2)] = true;
    else if (a === '--help' || a === '-h') out.help = true;
    else if (a.startsWith('--')) {
      out[a.slice(2)] = takeValue(argv, i, a);
      i++;
    } else out._.push(a);
  }
  return out;
}

function main(argv) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (err) {
    if (err instanceof UsageError) {
      process.stderr.write(err.message + '\n\n' + USAGE + '\n');
      process.exit(2);
    }
    throw err;
  }
  if (args.help || argv.length === 0) {
    process.stdout.write(USAGE + '\n');
    process.exit(0);
  }
  if (!args.stage) {
    process.stderr.write('--stage is required.\n\n' + USAGE + '\n');
    process.exit(2);
  }

  let report;
  try {
    report = preflight({
      stage: args.stage,
      ticket: args.ticket,
      base: args.base,
      cwd: args.cwd,
    });
  } catch (err) {
    process.stderr.write(err.message + '\n\n' + USAGE + '\n');
    process.exit(2);
  }

  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  if (!args.json && !args.quiet && report.reasons.length) {
    process.stderr.write(`preflight --stage ${report.stage} failed:\n`);
    for (const r of report.reasons) process.stderr.write(`  - ${r}\n`);
  }
  process.exit(report.ok ? 0 : 1);
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { preflight, STAGES, TICKET_STAGES, STAGE_CONFIG, USAGE };
