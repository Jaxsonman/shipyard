'use strict';
/**
 * board-trail.js — parse a ticket's comments into typed pipeline events and
 * reconcile them into a single pipeline state.
 *
 * Implements Shipyard contract v1 sections 3 (trust rule), 5 (comment header
 * grammar), 9 (round arithmetic, standalone semantics, irreconcilable state)
 * and 10 (metrics footer). See references/contract.md.
 *
 * CommonJS, zero dependencies, Node >= 18.
 */

const { spawnSync } = require('node:child_process');
const { parseFooter } = require('./metrics.js');

const USAGE = `Usage: node board-trail.js parse [options]

  --repo <owner/repo>    Fetch the issue with \`gh issue view\` (requires gh on PATH).
  --issue <n>            Issue number (with --repo).
  --stdin                Read \`gh issue view --json comments,labels,number,title,state,url,author\` JSON on stdin.
  --allow <a,b>          Extra trusted logins (merged with ship.config.json approvers).
  --config <path>        ship.config.json to read \`cap\` and \`approvers\` from.
  --viewer <login>       The invoking gh account; defaults to \`gh api user -q .login\`.
  --pretty               Pretty-print the JSON output.

Prints {"events": [...], "state": {...}} to stdout.
Exit codes: 0 parsed, 1 irreconcilable state, 2 usage error.`;

const VERDICTS = ['PASS', 'FAIL'];
const TIERS = ['full', 'tests-only', 'static'];
const CAUSES = ['cap', 'static', 'stage-error', 'reconcile'];

/**
 * Header matchers, in precedence order. Each `parse` returns the event fields
 * contributed by the header, or `null` when the line looks like a pipeline
 * header but does not conform (recorded as `malformed-header`).
 */
const HEADERS = [
  {
    type: 'spec-approved',
    re: /^ship:spec approved\s*$/,
    parse: () => ({}),
  },
  {
    type: 'plan-approved',
    re: /^ship:plan approved\s*$/,
    parse: () => ({}),
  },
  {
    // Legacy, accepted on read only (contract v1 §5.1).
    type: 'spec-approved',
    re: /^\u{1F4CB}️? ?Spec approved\b/u,
    parse: () => ({ legacy: true }),
  },
  {
    // Legacy, accepted on read only (contract v1 §5.2).
    type: 'plan-approved',
    re: /^\u{1F5FA}️? ?Plan approved\b/u,
    parse: () => ({ legacy: true }),
  },
  {
    type: 'dev-escalation',
    re: /^ship:dev escalation\s*$/,
    parse: () => ({}),
  },
  {
    type: 'dev',
    re: /^ship:dev (?:round\b|standalone\b)/,
    parse: (line) => {
      if (/^ship:dev standalone\s*$/.test(line)) return { standalone: true };
      const m = /^ship:dev round (\d+)\/(\d+)\s*$/.exec(line);
      if (!m) return null;
      const round = Number(m[1]); const cap = Number(m[2]);
      if (!validRound(round, cap)) return null;
      return { round, cap };
    },
  },
  {
    type: 'qa-verdict',
    re: /^ship:qa verdict\b/,
    parse: (line) => {
      // Legacy, accepted on read only: a repost used to append
      // " (reposted by ship)" to the header instead of relying solely on
      // the metrics footer's reposted:true (contract v1 §11).
      const LEGACY_REPOST_SUFFIX = / \(reposted by ship\)$/;
      const legacyReposted = LEGACY_REPOST_SUFFIX.test(line);
      const stripped = legacyReposted ? line.replace(LEGACY_REPOST_SUFFIX, '') : line;
      const m = /^ship:qa verdict (\S+) (?:round (\d+)\/(\d+)|standalone) tier=(\S+) verified (\d+)\/(\d+)(?: criteria=(\S+))?\s*$/.exec(stripped);
      if (!m) return null;
      const [, verdict, n, cap, tier, k, total, criteria] = m;
      if (!VERDICTS.includes(verdict)) return null;
      if (!TIERS.includes(tier)) return null;
      if (criteria !== undefined && criteria !== 'derived') return null;
      if (n !== undefined && !validRound(Number(n), Number(cap))) return null;
      const out = {
        verdict,
        tier,
        standalone: n === undefined,
        round: n === undefined ? null : Number(n),
        cap: cap === undefined ? null : Number(cap),
        verified: { k: Number(k), n: Number(total) },
        criteriaDerived: criteria === 'derived',
      };
      if (legacyReposted) {
        out.legacy = true;
        out.reposted = true;
      }
      return out;
    },
  },
  {
    type: 'metrics',
    re: /^ship:metrics\b/,
    parse: (line) => {
      const m = /^ship:metrics round (\d+)\/(\d+)\s*$/.exec(line);
      if (!m) return null;
      const round = Number(m[1]); const cap = Number(m[2]);
      if (!validRound(round, cap)) return null;
      return { round, cap };
    },
  },
  {
    type: 'review-packet',
    re: /^ship:review-packet\b/,
    parse: (line) => {
      const m = /^ship:review-packet round (\d+)\/(\d+)\s*$/.exec(line);
      if (!m) return null;
      const round = Number(m[1]); const cap = Number(m[2]);
      if (!validRound(round, cap)) return null;
      return { round, cap };
    },
  },
  {
    type: 'escalation',
    re: /^ship:escalation\b/,
    parse: (line) => {
      const m = /^ship:escalation (\S+) round (\d+)\/(\d+)\s*$/.exec(line);
      if (!m) return null;
      if (!CAUSES.includes(m[1])) return null;
      const round = Number(m[2]); const cap = Number(m[3]);
      if (!validRound(round, cap)) return null;
      return { cause: m[1], round, cap };
    },
  },
  {
    type: 'pr-opened',
    re: /^ship:pr\b/,
    parse: (line) => {
      const m = /^ship:pr opened (\S+)\s*$/.exec(line);
      if (!m) return null;
      return { prUrl: m[1] };
    },
  },
  {
    // Catch-all, last: a first line that claims to be a pipeline header but
    // matches no form in contract v1 §5 is reported, never silently dropped.
    type: 'unknown',
    re: /^ship:/,
    parse: () => null,
  },
];

/** Round and cap are 1-based counts; 0 or negative is a malformed header. */
function validRound(n, cap) {
  return Number.isInteger(n) && n >= 1 && Number.isInteger(cap) && cap >= 1;
}

function blankEvent() {
  return {
    type: null,
    author: null,
    trusted: false,
    createdAt: null,
    url: null,
    round: null,
    cap: null,
    standalone: false,
    legacy: false,
    malformed: false,
    verdict: null,
    tier: null,
    verified: null,
    criteriaDerived: false,
    cause: null,
    prUrl: null,
    reposted: false,
    metrics: null,
    raw: '',
  };
}

function isTrusted(login, viewer, allow) {
  if (!login) return false;
  const l = String(login).toLowerCase();
  if (viewer && l === String(viewer).toLowerCase()) return true;
  return (allow || []).some((a) => String(a).toLowerCase() === l);
}

/**
 * Parse a `gh issue view --json comments,...` object into typed events.
 * Comments whose first line matches no header are ignored entirely.
 *
 * @param {object} issue
 * @param {{allow?: string[], viewer?: string}} [opts]
 * @returns {object[]}
 */
function parseEvents(issue, opts = {}) {
  const allow = opts.allow || [];
  const viewer = opts.viewer || null;
  const comments = (issue && Array.isArray(issue.comments)) ? issue.comments : [];
  const events = [];

  for (const c of comments) {
    const body = typeof c.body === 'string' ? c.body : '';
    const first = body.split('\n')[0].replace(/\r$/, '').trimEnd();
    const match = HEADERS.find((h) => h.re.test(first));
    if (!match) continue;

    const ev = blankEvent();
    ev.type = match.type;
    ev.raw = first;
    ev.author = (c.author && c.author.login) || null;
    ev.createdAt = c.createdAt || null;
    ev.url = c.url || null;
    ev.trusted = isTrusted(ev.author, viewer, allow);

    const fields = match.parse(first);
    if (fields === null) {
      ev.malformed = true;
    } else {
      Object.assign(ev, fields);
    }

    const footer = parseFooter(body);
    if (footer) {
      ev.metrics = {
        stage: footer.stage,
        started: footer.started,
        finished: footer.finished,
        tokensIn: footer.tokensIn,
        tokensOut: footer.tokensOut,
      };
      ev.reposted = ev.reposted === true || footer.reposted === true;
    }

    events.push(ev);
  }
  return events;
}

function byTime(a, b) {
  const ta = Date.parse(a.createdAt || '') || 0;
  const tb = Date.parse(b.createdAt || '') || 0;
  return ta - tb;
}

/** Latest-wins: returns {winner, superseded[]} over a list in board order. */
function latestWins(list) {
  if (list.length === 0) return { winner: null, superseded: [] };
  const sorted = list.map((e, i) => ({ e, i })).sort((x, y) => {
    const d = byTime(x.e, y.e);
    return d !== 0 ? d : x.i - y.i;
  });
  const winner = sorted[sorted.length - 1].e;
  return { winner, superseded: sorted.slice(0, -1).map((x) => x.e) };
}

/**
 * Reconcile typed events into one pipeline state.
 *
 * @param {object[]} events
 * @param {{cap?: number, labels?: string[]}} [opts]
 */
function reconcile(events, opts = {}) {
  const labels = (opts.labels || []).filter((l) => /^ship:/.test(l));
  const configCap = typeof opts.cap === 'number' ? opts.cap : null;

  const state = {
    phase: 'unstarted',
    round: 0,
    cap: configCap,
    trusted: true,
    irreconcilable: [],
    untrusted: [],
    rounds: {},
    standalone: [],
    escalation: null,
    prUrl: null,
    labels,
  };

  const bad = (code, message, url) => {
    if (!state.irreconcilable.some((i) => i.code === code && i.message === message)) {
      state.irreconcilable.push({ code, message, url: url || null });
    }
  };

  // Untrusted and malformed events never take part in reconciliation.
  for (const e of events) {
    if (e.malformed) {
      bad('malformed-header', `unrecognised pipeline header: ${e.raw}`, e.url);
      continue;
    }
    if (!e.trusted) {
      state.untrusted.push({ type: e.type, author: e.author, url: e.url, raw: e.raw });
      state.trusted = false;
      if (e.type === 'qa-verdict') {
        bad('untrusted-verdict', `verdict-shaped comment from untrusted author ${e.author}: ${e.raw}`, e.url);
      }
    }
  }

  const usable = events.filter((e) => e.trusted && !e.malformed);

  if (labels.length > 1) {
    bad('multiple-labels', `ticket carries multiple ship:* labels: ${labels.join(', ')}`);
  }

  // Standalone events are excluded from round arithmetic entirely (§9).
  for (const e of usable) {
    if (e.standalone) {
      e.round = null;
      e.cap = null;
      state.standalone.push(e);
    }
  }

  const rounded = usable.filter((e) => !e.standalone && typeof e.round === 'number');

  // Header cap vs config cap (§9).
  if (configCap !== null) {
    for (const e of rounded) {
      if (typeof e.cap === 'number' && e.cap !== configCap) {
        bad('cap-mismatch', `header cap ${e.cap} differs from configured loopCap ${configCap} in: ${e.raw}`, e.url);
      }
    }
  } else {
    const first = rounded.find((e) => typeof e.cap === 'number');
    if (first) state.cap = first.cap;
  }

  const slotFor = { dev: 'dev', 'qa-verdict': 'qa', metrics: 'metrics', 'review-packet': 'packet' };

  for (const e of rounded) {
    const slot = slotFor[e.type];
    if (!slot) continue;
    const key = String(e.round);
    if (!state.rounds[key]) {
      state.rounds[key] = { dev: null, qa: null, metrics: null, packet: null, superseded: [] };
    }
  }

  for (const key of Object.keys(state.rounds)) {
    const r = state.rounds[key];
    for (const [type, slot] of Object.entries(slotFor)) {
      const list = rounded.filter((e) => e.type === type && String(e.round) === key);
      const { winner, superseded } = latestWins(list);
      r[slot] = winner;
      r.superseded.push(...superseded);
    }
  }

  const roundNumbers = Object.keys(state.rounds).map(Number).sort((a, b) => a - b);

  // A round-N verdict with no round-N dev handoff is irreconcilable (§9).
  for (const n of roundNumbers) {
    const r = state.rounds[String(n)];
    if (r.qa && !r.dev) {
      bad('verdict-without-handoff', `round ${n} has a QA verdict with no dev handoff`, r.qa.url);
    }
  }

  // Round gaps.
  const devRounds = roundNumbers.filter((n) => state.rounds[String(n)].dev);
  for (const n of devRounds) {
    if (n > 1 && !state.rounds[String(n - 1)]) {
      bad('round-gap', `round ${n} has a dev handoff but round ${n - 1} does not`);
    }
  }

  state.round = devRounds.length ? Math.max(...devRounds) : 0;

  const escalations = usable.filter((e) => e.type === 'escalation' || e.type === 'dev-escalation');
  state.escalation = escalations.length ? escalations[escalations.length - 1] : null;

  const pr = usable.filter((e) => e.type === 'pr-opened');
  if (pr.length) state.prUrl = pr[pr.length - 1].prUrl;

  state.phase = derivePhase(state, usable);
  return state;
}

function derivePhase(state, usable) {
  if (state.prUrl) return 'pr-open';
  if (state.escalation) return 'escalated';
  const current = state.round ? state.rounds[String(state.round)] : null;
  if (current && current.packet) return 'awaiting-review';
  if (current && current.qa) {
    return current.qa.verdict === 'PASS' ? 'awaiting-review' : 'dev-in-progress';
  }
  if (current && current.dev) return 'awaiting-qa';
  if (usable.some((e) => e.type === 'plan-approved')) return 'plan-approved';
  if (usable.some((e) => e.type === 'spec-approved')) return 'spec-approved';
  return 'unstarted';
}

// ---------------------------------------------------------------- CLI ----

function die(msg, code) {
  process.stderr.write(msg + '\n');
  process.exit(code);
}

function readStdin() {
  const fs = require('node:fs');
  try {
    return fs.readFileSync(0, 'utf8');
  } catch (err) {
    die(`cannot read stdin: ${err.message}`, 2);
  }
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  if (r.error) return { code: 127, stdout: '', stderr: r.error.message };
  return { code: r.status === null ? 1 : r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--stdin' || a === '--pretty') out[a.slice(2)] = true;
    else if (a === '--help' || a === '-h') out.help = true;
    else if (a.startsWith('--')) out[a.slice(2)] = argv[++i];
    else out._.push(a);
  }
  return out;
}

function main(argv) {
  const args = parseArgs(argv);
  if (args.help || argv.length === 0) {
    process.stdout.write(USAGE + '\n');
    process.exit(0);
  }
  if (args._[0] !== 'parse') die(USAGE, 2);

  let raw;
  if (args.stdin) {
    raw = readStdin();
  } else if (args.repo && args.issue) {
    const r = run('gh', ['issue', 'view', String(args.issue), '--repo', String(args.repo),
      '--json', 'comments,labels,number,title,state,url,author']);
    if (r.code !== 0) die(`gh issue view failed: ${(r.stderr || '').trim()}`, 2);
    raw = r.stdout;
  } else {
    die('need either --stdin, or both --repo and --issue.\n\n' + USAGE, 2);
  }

  let issue;
  try {
    issue = JSON.parse(raw);
  } catch (err) {
    die(`input is not valid JSON: ${err.message}`, 2);
  }

  const allow = [];
  let cap;
  if (args.config) {
    const fs = require('node:fs');
    try {
      const cfg = JSON.parse(fs.readFileSync(args.config, 'utf8'));
      if (Array.isArray(cfg.approvers)) allow.push(...cfg.approvers);
      if (typeof cfg.loopCap === 'number') cap = cfg.loopCap;
    } catch (err) {
      die(`cannot read ${args.config}: ${err.message}`, 2);
    }
  }
  if (args.allow) allow.push(...String(args.allow).split(',').map((s) => s.trim()).filter(Boolean));

  let viewer = args.viewer || null;
  if (!viewer) {
    const r = run('gh', ['api', 'user', '-q', '.login']);
    if (r.code === 0) viewer = r.stdout.trim() || null;
  }

  const events = parseEvents(issue, { allow, viewer });
  const labels = Array.isArray(issue.labels) ? issue.labels.map((l) => l.name) : [];
  const state = reconcile(events, { cap, labels });

  const payload = { events, state };
  process.stdout.write(JSON.stringify(payload, null, args.pretty ? 2 : 0) + '\n');
  process.exit(state.irreconcilable.length ? 1 : 0);
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { parseEvents, reconcile, HEADERS, VERDICTS, TIERS, CAUSES, USAGE };
