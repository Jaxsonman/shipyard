'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const DEFAULTS = {
  kanban: { version: 1, backend: null, target: null },
  ship: { version: 1, backend: null, target: null, baseBranch: 'main', loopCap: 3, approvers: [] },
};

const VALID_BACKENDS = ['github', 'jira'];

function normalizeTarget(backend, raw) {
  if (typeof raw !== 'string') {
    throw new TypeError('normalizeTarget: raw must be a string');
  }
  if (backend === 'github') {
    let t = raw.trim();
    t = t.replace(/^https:\/\/github\.com\//, '');
    t = t.replace(/^git@github\.com:/, '');
    t = t.replace(/\.git$/, '');
    t = t.replace(/\/+$/, '');
    return t;
  }
  if (backend === 'jira') {
    return String(raw).trim().toUpperCase();
  }
  return raw;
}

function validateConfig(kind, obj) {
  const errors = [];
  const defaults = DEFAULTS[kind];
  const input = obj && typeof obj === 'object' ? obj : {};

  const value = Object.assign({}, defaults, input);
  value.version = 1;

  if (Object.prototype.hasOwnProperty.call(input, 'qa')) {
    value.qa = input.qa;
  }

  const backend = value.backend;
  if (!backend || !VALID_BACKENDS.includes(backend)) {
    errors.push(`invalid or missing "backend" (must be one of ${VALID_BACKENDS.join('/')})`);
  }

  const target = value.target;
  if (!target || (typeof target === 'string' && target.trim() === '')) {
    errors.push('missing or empty "target"');
  }

  if (kind === 'ship') {
    if (Object.prototype.hasOwnProperty.call(input, 'loopCap')) {
      const lc = input.loopCap;
      if (!Number.isInteger(lc) || lc <= 0) {
        errors.push('"loopCap" must be a positive integer');
      }
    }
    if (Object.prototype.hasOwnProperty.call(input, 'approvers')) {
      const ap = input.approvers;
      if (!Array.isArray(ap) || !ap.every((a) => typeof a === 'string')) {
        errors.push('"approvers" must be an array of strings');
      }
    }
  }

  return { ok: errors.length === 0, errors, value };
}

function configPath(kind, cwd) {
  return path.join(cwd, '.claude', `${kind}.config.json`);
}

function isInsideGitRepo(cwd) {
  try {
    const r = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd });
    if (r.error) return false;
    return r.status === 0 && String(r.stdout).trim() === 'true';
  } catch (e) {
    return false;
  }
}

function isGitIgnored(cwd, relPath) {
  try {
    const r = spawnSync('git', ['check-ignore', '-q', relPath], { cwd });
    if (r.error) return false;
    return r.status === 0;
  } catch (e) {
    return false;
  }
}

function bootstrap({ kind, backend, target, cwd }) {
  const notes = [];
  const p = configPath(kind, cwd);
  const relPath = path.join('.claude', `${kind}.config.json`);

  if (fs.existsSync(p)) {
    try {
      const raw = fs.readFileSync(p, 'utf8');
      const parsed = JSON.parse(raw);
      const { value } = validateConfig(kind, parsed);
      return { path: p, created: false, value, notes };
    } catch (e) {
      // fall through to attempt to (re)write below is NOT allowed per "never overwrite";
      // but an unparsable existing file still counts as "already exists" — report it.
      notes.push(`existing config at ${p} could not be parsed as JSON: ${e.message}`);
      return { path: p, created: false, value: null, notes };
    }
  }

  const normalizedTarget = normalizeTarget(backend, target);
  const { value } = validateConfig(kind, { backend, target: normalizedTarget });

  fs.mkdirSync(path.join(cwd, '.claude'), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(value, null, 2) + '\n');

  if (!isInsideGitRepo(cwd)) {
    notes.push(`${cwd} is not a git repository`);
  } else if (isGitIgnored(cwd, relPath)) {
    notes.push(`${relPath} is ignored by git — run \`git add -f ${relPath}\` to force-add it`);
  }

  return { path: p, created: true, value, notes };
}

function load({ kind, cwd }) {
  const p = configPath(kind, cwd);
  if (!fs.existsSync(p)) {
    return { ok: false, path: p, value: null, errors: [`config file not found at ${p}`] };
  }
  let raw;
  try {
    raw = fs.readFileSync(p, 'utf8');
  } catch (e) {
    return { ok: false, path: p, value: null, errors: [`could not read ${p}: ${e.message}`] };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return { ok: false, path: p, value: null, errors: [`invalid JSON in ${p}: ${e.message}`] };
  }
  const { ok, errors, value } = validateConfig(kind, parsed);
  return { ok, path: p, value, errors };
}

module.exports = { DEFAULTS, normalizeTarget, validateConfig, bootstrap, load };

// ---- CLI ----

function printUsage(stream) {
  stream.write(`Usage: node config.js <command> [options]

Commands:
  bootstrap <kanban|ship> --backend <github|jira> --target <o/r|KEY> [--cwd <dir>]
                          Create .claude/<kind>.config.json if absent; never overwrites.
  validate [kanban|ship] [--cwd <dir>]
                          Validate one or both configs. Prints errors to stderr.
  show [kanban|ship] [--cwd <dir>]
                          Print the normalized config as JSON.

Exit codes: 0 ok, 1 invalid/missing config, 2 usage error.
`);
}

function parseFlags(args) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--backend') {
      flags.backend = args[++i];
    } else if (a === '--target') {
      flags.target = args[++i];
    } else if (a === '--cwd') {
      flags.cwd = args[++i];
    } else if (a === '--help' || a === '-h') {
      flags.help = true;
    } else {
      positional.push(a);
    }
  }
  return { flags, positional };
}

function main() {
  const argv = process.argv.slice(2);

  if (argv.includes('--help') || argv.includes('-h')) {
    printUsage(process.stdout);
    process.exit(0);
  }

  const [command, ...rest] = argv;

  if (!command) {
    printUsage(process.stderr);
    process.exit(2);
  }

  const { flags, positional } = parseFlags(rest);
  const cwd = flags.cwd ? path.resolve(flags.cwd) : process.cwd();

  if (command === 'bootstrap') {
    const kind = positional[0];
    if (kind !== 'kanban' && kind !== 'ship') {
      process.stderr.write('bootstrap requires <kanban|ship>\n');
      process.exit(2);
    }
    if (!flags.backend || !flags.target) {
      process.stderr.write('bootstrap requires --backend and --target\n');
      process.exit(2);
    }
    try {
      const result = bootstrap({ kind, backend: flags.backend, target: flags.target, cwd });
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      for (const n of result.notes) {
        process.stderr.write(n + '\n');
      }
      process.exit(0);
    } catch (e) {
      process.stderr.write(`error: ${e.message}\n`);
      process.exit(2);
    }
  } else if (command === 'validate') {
    const kinds = positional[0] ? [positional[0]] : ['kanban', 'ship'];
    let anyFail = false;
    const results = {};
    for (const kind of kinds) {
      if (kind !== 'kanban' && kind !== 'ship') {
        process.stderr.write(`invalid kind: ${kind}\n`);
        process.exit(2);
      }
      const r = load({ kind, cwd });
      results[kind] = r;
      if (!r.ok) {
        anyFail = true;
        for (const e of r.errors) process.stderr.write(`${kind}: ${e}\n`);
      }
    }
    process.stdout.write(JSON.stringify(results, null, 2) + '\n');
    process.exit(anyFail ? 1 : 0);
  } else if (command === 'show') {
    const kinds = positional[0] ? [positional[0]] : ['kanban', 'ship'];
    let anyFail = false;
    const results = {};
    for (const kind of kinds) {
      if (kind !== 'kanban' && kind !== 'ship') {
        process.stderr.write(`invalid kind: ${kind}\n`);
        process.exit(2);
      }
      const r = load({ kind, cwd });
      results[kind] = r.value;
      if (!r.ok) anyFail = true;
    }
    process.stdout.write(JSON.stringify(results, null, 2) + '\n');
    process.exit(anyFail ? 1 : 0);
  } else {
    printUsage(process.stderr);
    process.exit(2);
  }
}

if (require.main === module) {
  main();
}
