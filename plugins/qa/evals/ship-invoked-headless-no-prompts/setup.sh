#!/usr/bin/env bash
set -euo pipefail

git init -q
git config user.email "eval@example.com"
git config user.name "Eval Runner"

mkdir -p .claude docs/ship/7 .bin

cat > .claude/kanban.config.json <<'EOF'
{
  "version": 1,
  "backend": "github",
  "target": "acme/widgets"
}
EOF

# A full, already-confirmed `qa` block (contract §12.3) — this is what a
# prior `/qa --env-check` interview would have written. Ship-invoked runs
# must reuse it verbatim, never re-detect.
cat > .claude/ship.config.json <<'EOF'
{
  "version": 1,
  "baseBranch": "main",
  "loopCap": 3,
  "approvers": [],
  "qa": {
    "setup": "true",
    "seed": "true",
    "run": "node server.js",
    "test": "node test.js",
    "health": "http://localhost:{PORT}/",
    "basePort": 41100,
    "envFile": ".env.qa.local",
    "requiredEnv": ["SEARCH_API_KEY"],
    "e2e": "auto"
  }
}
EOF

# gitignored env file holding the value for the one required var.
cat > .env.qa.local <<'EOF'
SEARCH_API_KEY=eval-dummy-key
EOF
echo ".env.qa.local" >> .gitignore

cat > docs/ship/7/spec.md <<'EOF'
## Problem

Users cannot search the product catalog from the header.

## Done means

1. A header search box is present on every page.
2. Typing a query and pressing Enter shows a results list containing at
   least one matching item for a known catalog term.

## UX intent

Single input, inline results, no full-page navigation.

## Edge cases & failure modes

- Empty query shows no results, no error.

## Context for implementation

Header component: `header.html`. Server: `server.js`.

## Out of scope

- Fuzzy/typo-tolerant search.
EOF

# A tiny, real, self-contained app + test suite (no external deps, no
# network) so QA's Step 5 (suite) and Step 4/6 (bring-up + E2E) have
# something real and fast to run headlessly.
cat > server.js <<'EOF'
const http = require("http");

const PORT = process.env.PORT || 41100;
const CATALOG = ["Widget A", "Widget B", "Gadget C"];

const page = (results) => `<!doctype html>
<html>
  <body>
    <form action="/search" method="get">
      <input name="q" aria-label="search" />
      <button type="submit">Search</button>
    </form>
    <ul id="results">
      ${results.map((r) => `<li>${r}</li>`).join("\n")}
    </ul>
  </body>
</html>`;

http
  .createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    if (url.pathname === "/search") {
      const q = (url.searchParams.get("q") || "").toLowerCase();
      const results = q
        ? CATALOG.filter((item) => item.toLowerCase().includes(q))
        : [];
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(page(results));
      return;
    }
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(page([]));
  })
  .listen(PORT, () => {
    console.log(`listening on ${PORT}`);
  });
EOF

cat > test.js <<'EOF'
// Tiny, dependency-free suite. Exits non-zero on failure.
const assert = require("assert");

function extractResults(html) {
  const li = [...html.matchAll(/<li>(.*?)<\/li>/g)].map((m) => m[1]);
  return li;
}

const CATALOG = ["Widget A", "Widget B", "Gadget C"];

function search(q) {
  const results = q
    ? CATALOG.filter((item) => item.toLowerCase().includes(q.toLowerCase()))
    : [];
  return results;
}

assert.deepStrictEqual(search("widget"), ["Widget A", "Widget B"]);
assert.deepStrictEqual(search(""), []);

console.log("2 passed, 0 failed");
EOF

git add -A
git commit -q -m "chore: seed ticket 7 spec + app"

git checkout -q -b feat/7-add-search-box
cat > header.html <<'EOF'
<form action="/search" method="get">
  <input name="q" aria-label="search" />
</form>
EOF
git add -A
git commit -q -m "feat(7): add header search box"

# gh shim: offline, answers ticket 7 and accepts a comment post. Never
# talks to the real Jaxsonman/shipyard-e2e repo.
cat > .bin/gh <<'EOF'
#!/usr/bin/env bash
if [ "$1" = "auth" ] && [ "$2" = "status" ]; then
  echo "Logged in to github.com as eval-runner" >&2
  exit 0
fi
if [ "$1" = "issue" ] && [ "$2" = "view" ]; then
  cat <<'JSON'
{
  "number": 7,
  "title": "Add header search box",
  "body": "As a user I want to search the catalog from the header.",
  "labels": [],
  "url": "https://github.com/acme/widgets/issues/7",
  "comments": []
}
JSON
  exit 0
fi
if [ "$1" = "issue" ] && [ "$2" = "comment" ]; then
  echo "https://github.com/acme/widgets/issues/7#issuecomment-1"
  exit 0
fi
echo "gh: unhandled invocation: $*" >&2
exit 1
EOF
chmod +x .bin/gh
