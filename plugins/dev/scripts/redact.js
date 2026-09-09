'use strict';

const TOKEN = '[REDACTED]';

// A key (identifier) counts as sensitive when one of these words appears as a
// whole underscore/dash-delimited component of it (or is the whole key),
// case-insensitively. This deliberately does NOT match ordinary words that
// merely contain the substring (e.g. "Authorization" contains "auth" but is
// not bounded by a separator/start/end on both sides), so generic English
// text and header names like "Authorization" are left to the Bearer-token
// pattern instead of being blanket-redacted.
const SENSITIVE_KEY_RE = /(^|[_-])(password|passwd|secret|token|api[-_]?key|auth)($|[_-])/i;

function isSensitiveKey(key) {
  return SENSITIVE_KEY_RE.test(key);
}

const PATTERNS = [
  {
    name: 'url-credentials',
    re: /(\b[a-zA-Z][a-zA-Z0-9+.-]*:\/\/)([^\s\/:@]+):([^\s\/@]+)@/g,
    replace: (_m, scheme) => `${scheme}${TOKEN}@`
  },
  {
    name: 'pem-private-key',
    re: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g,
    replace: () => TOKEN
  },
  {
    name: 'cookie-header',
    re: /^([ \t]*(?:Cookie|Set-Cookie))[ \t]*:.*$/gim,
    replace: (_m, name) => `${name}: ${TOKEN}`
  },
  {
    name: 'bearer-token',
    re: /\bBearer\s+[A-Za-z0-9\-_.]+/g,
    replace: () => `Bearer ${TOKEN}`
  },
  {
    name: 'jwt',
    re: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
    replace: () => TOKEN
  },
  {
    name: 'github-token',
    re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b|\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
    replace: () => TOKEN
  },
  {
    name: 'aws-access-key-id',
    re: /\bAKIA[0-9A-Z]{16}\b/g,
    replace: () => TOKEN
  },
  {
    name: 'slack-token',
    re: /\bxox[baprs]-[A-Za-z0-9-]+/g,
    replace: () => TOKEN
  },
  {
    name: 'key-value-secret',
    re: /\b([A-Za-z][A-Za-z0-9_-]*)([ \t]*[:=][ \t]*)("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^\s]+)/g,
    replace: (m, key, sep, value) => {
      if (!isSensitiveKey(key)) return m;
      if (value.length >= 2 && value[0] === '"' && value[value.length - 1] === '"') {
        return `${key}${sep}"${TOKEN}"`;
      }
      if (value.length >= 2 && value[0] === "'" && value[value.length - 1] === "'") {
        return `${key}${sep}'${TOKEN}'`;
      }
      return `${key}${sep}${TOKEN}`;
    }
  }
];

function redact(text) {
  let out = String(text);
  for (const { re, replace } of PATTERNS) {
    out = out.replace(re, replace);
  }
  return out;
}

function printHelp() {
  process.stdout.write(
    `Usage: node redact.js [--help]

Reads text on stdin, writes it to stdout with secrets replaced by [REDACTED].
Patterns: URL credentials (scheme://user:pass@host), bearer/JWT tokens,
GitHub tokens (ghp_/gho_/ghu_/ghs_/ghr_/github_pat_), AWS access keys,
Slack tokens, private-key blocks, Cookie/Set-Cookie headers, and
key=value / key: value pairs whose key matches password|passwd|secret|token|api[-_]?key|auth.
`
  );
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    process.exit(0);
  }
  const chunks = [];
  process.stdin.on('data', (c) => chunks.push(c));
  process.stdin.on('end', () => {
    const input = Buffer.concat(chunks).toString('utf8');
    process.stdout.write(redact(input));
    process.exit(0);
  });
}

module.exports = { redact, PATTERNS };
