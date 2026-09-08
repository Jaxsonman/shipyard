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
