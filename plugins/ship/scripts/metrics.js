'use strict';

const STAGES = ['prd', 'kanban', 'spec', 'plan', 'dev', 'qa', 'ship', 'pr'];

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

// Non-global: a global regex here would carry lastIndex state across calls
// and cause intermittent false negatives. Build a fresh global copy inside
// parseFooter when iterating for the last match.
const FOOTER_RE = /<!--\s*shipyard-metrics\s+(\{[\s\S]*?\})\s*-->/;

function now() {
  return new Date().toISOString().replace(/\.\d+Z$/, 'Z');
}

function footer(opts) {
  opts = opts || {};
  const { stage, started, finished, tokensIn, tokensOut, reposted } = opts;

  if (!STAGES.includes(stage)) {
    throw new Error(`invalid stage: ${stage}`);
  }
  if (typeof started !== 'string' || !ISO_RE.test(started)) {
    throw new Error(`invalid started timestamp: ${started}`);
  }
  if (finished !== undefined && (typeof finished !== 'string' || !ISO_RE.test(finished))) {
    throw new Error(`invalid finished timestamp: ${finished}`);
  }

  const payload = {};
  payload.stage = stage;
  payload.started = started;
  if (finished !== undefined) payload.finished = finished;
  if (tokensIn !== undefined) payload.tokens_in = tokensIn;
  if (tokensOut !== undefined) payload.tokens_out = tokensOut;
  if (reposted !== undefined) payload.reposted = reposted;

  return `<!-- shipyard-metrics ${JSON.stringify(payload)} -->`;
}

function parseFooter(text) {
  if (typeof text !== 'string') return null;

  const globalRe = new RegExp(FOOTER_RE.source, 'g');
  let match;
  let last = null;
  while ((match = globalRe.exec(text)) !== null) {
    last = match;
  }
  if (!last) return null;

  let parsed;
  try {
    parsed = JSON.parse(last[1]);
  } catch (err) {
    return null;
  }

  return {
    stage: parsed.stage !== undefined ? parsed.stage : null,
    started: parsed.started !== undefined ? parsed.started : null,
    finished: parsed.finished !== undefined ? parsed.finished : null,
    tokensIn: parsed.tokens_in !== undefined ? parsed.tokens_in : null,
    tokensOut: parsed.tokens_out !== undefined ? parsed.tokens_out : null,
    reposted: parsed.reposted === true,
  };
}

module.exports = { now, footer, parseFooter, FOOTER_RE, STAGES };

const USAGE = `Usage: node metrics.js <command> [options]

Commands:
  now                          Print the current time as ISO-8601 UTC (second precision).
  footer --stage <s> --started <iso> [--finished <iso>]
         [--tokens-in <n>] [--tokens-out <n>] [--reposted]
                               Print the contract v1 metrics footer line.
  parse-footer                 Read a comment body on stdin, print the parsed footer as JSON.

Exit codes: 0 ok, 1 no footer found (parse-footer), 2 usage error.
`;

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--stage') out.stage = argv[++i];
    else if (a === '--started') out.started = argv[++i];
    else if (a === '--finished') out.finished = argv[++i];
    else if (a === '--tokens-in') out.tokensIn = argv[++i];
    else if (a === '--tokens-out') out.tokensOut = argv[++i];
    else if (a === '--reposted') out.reposted = true;
    else {
      throw new Error(`unknown option: ${a}`);
    }
  }
  return out;
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0];

  if (cmd === '--help' || cmd === '-h' || argv.length === 0) {
    process.stdout.write(USAGE);
    process.exit(0);
  }

  if (cmd === 'now') {
    process.stdout.write(now() + '\n');
    process.exit(0);
  }

  if (cmd === 'footer') {
    let opts;
    try {
      opts = parseArgs(argv.slice(1));
    } catch (err) {
      process.stderr.write(String(err.message) + '\n');
      process.exit(2);
    }
    if (opts.tokensIn !== undefined) opts.tokensIn = Number(opts.tokensIn);
    if (opts.tokensOut !== undefined) opts.tokensOut = Number(opts.tokensOut);
    try {
      const line = footer(opts);
      process.stdout.write(line + '\n');
      process.exit(0);
    } catch (err) {
      process.stderr.write(String(err.message) + '\n');
      process.exit(2);
    }
  }

  if (cmd === 'parse-footer') {
    readStdin().then((text) => {
      const parsed = parseFooter(text);
      if (parsed === null) {
        process.stderr.write('no footer found\n');
        process.exit(1);
      }
      process.stdout.write(JSON.stringify(parsed) + '\n');
      process.exit(0);
    }).catch((err) => {
      process.stderr.write(String(err.message) + '\n');
      process.exit(2);
    });
    return;
  }

  process.stderr.write(`unknown command: ${cmd}\n`);
  process.stderr.write(USAGE);
  process.exit(2);
}

if (require.main === module) {
  main();
}
