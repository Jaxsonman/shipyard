'use strict';

const fs = require('fs');

const USAGE = `Usage: node validate-artifact.js <spec|plan> <path> [--json]

Checks that the artifact contains every section contract v1 requires.
Prints missing/renamed sections to stderr; --json prints the full report to stdout.
Exit codes: 0 valid, 1 missing sections or unreadable file, 2 usage error.
`;

const REQUIRED = {
  spec: [
    'Problem',
    'Done means',
    'UX intent',
    'Edge cases & failure modes',
    'Context for implementation',
    'Out of scope',
  ],
  plan: [
    'Architecture decisions',
    'Security & scalability',
    'Testing approach',
    'Tasks',
  ],
};

const TASK_HEADING_RE = /^###\s+Task\s+\d+\b/;

function normalize(text) {
  return String(text).trim().replace(/\s+/g, ' ').toLowerCase();
}

function extractHeadings(text) {
  const headings = [];
  const lines = String(text).split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^#{1,6}\s+(.*)$/);
    if (m) headings.push(m[1]);
  }
  return headings;
}

function validate(kind, text) {
  const required = REQUIRED[kind];
  const missing = [];
  const found = [];
  const notes = [];

  if (!required) {
    return { ok: false, missing: [], found: [], notes: [`unknown kind: ${kind}`] };
  }

  const headings = extractHeadings(text);
  const normalizedHeadings = new Set(headings.map(normalize));

  for (const section of required) {
    if (normalizedHeadings.has(normalize(section))) {
      found.push(section);
    } else {
      missing.push(section);
    }
  }

  if (kind === 'plan') {
    const lines = String(text).split(/\r?\n/);
    const hasTaskHeading = lines.some((line) => TASK_HEADING_RE.test(line));
    if (hasTaskHeading) {
      found.push('### Task N');
    } else {
      missing.push('at least one "### Task N" heading');
    }
  }

  return { ok: missing.length === 0, missing, found, notes };
}

function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(USAGE);
    process.exit(0);
  }

  const positionals = args.filter((a) => a !== '--json');
  const jsonOutput = args.includes('--json');

  if (positionals.length !== 2) {
    process.stderr.write(USAGE);
    process.exit(2);
  }

  const [kind, filePath] = positionals;

  if (kind !== 'spec' && kind !== 'plan') {
    process.stderr.write(`error: kind must be "spec" or "plan", got "${kind}"\n`);
    process.exit(2);
  }

  let text;
  try {
    text = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    process.stderr.write(`cannot read ${filePath}: ${err.message}\n`);
    process.exit(1);
    return;
  }

  const result = validate(kind, text);

  if (jsonOutput) {
    process.stdout.write(JSON.stringify(result) + '\n');
  } else if (!result.ok) {
    process.stderr.write(`missing sections in ${filePath}:\n`);
    for (const m of result.missing) {
      process.stderr.write(`  - ${m}\n`);
    }
  }

  process.exit(result.ok ? 0 : 1);
}

if (require.main === module) {
  main();
}

module.exports = { validate, REQUIRED };
