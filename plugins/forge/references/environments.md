# Environment detection recipes

Used by `qa-orchestrator` to bring the app up once per round. Unlike
`qa`'s `/qa --env-check` interview, forge never asks a human to confirm
these — the loop is unattended after intent approval, so bring-up
commands are derived fresh each round from the intent's **How to run**
section (setup, seed, launch commands, env var names, ports) plus the
first matching recipe below for anything "How to run" does not specify.
Apply the first matching recipe in file order. That order is load-
bearing, not alphabetical, and two precedences are deliberate:
**docker-compose outranks every language recipe**, so a composed app is
not mis-detected by its `package.json`; and **CLI-only outranks
node / npm**, so a package whose only entry point is a `bin` (no server,
no port, nothing to launch) is brought up as a CLI rather than having
`qa-orchestrator` wait 60 seconds for a health URL that will never turn
green. A `package.json` reaches the node / npm recipe only after CLI-only
has declined it. If neither "How to run" nor the matched recipe
establishes a port-injection mechanism (see each recipe), bring-up is
treated as failed: `qa-orchestrator` reports `FAIL` with one blocking
finding carrying the bring-up command's output. Forge never guesses a
required secret's value — only the variable *name* "How to run"
provides; a required var with no value reachable in this environment is
also a bring-up failure, reported the same way.

## docker-compose

**Detect:** `docker-compose.yml` or `compose.yaml` at repo root.

**Bring-up:**
- `setup`: `docker compose build`
- `seed`: a service or script named `seed` if one exists, else omit
- `run`: `docker compose up`
- `test`: from `package.json` scripts / `pytest` / `go test ./...` if the
  repo also carries an app-level test setup; else omit
- `health`: `http://localhost:{PORT}/` against the first published port
- `mode`: `browser`

**Port injection:** works only if the compose file maps the host port
from an env var (e.g. `"${PORT:-3000}:3000"`). If it hard-codes the host
port, this is a bring-up failure — a hard-coded port cannot receive the
port this round won, and forge has no human to ask to edit the compose
file.

## CLI-only

**Detect:** a `bin` entry in `package.json` and no server entry point
(no `scripts.dev`/`scripts.start` that opens a listener, no server
dependency, no port reference), or a main package in any language that
never opens a listener.

**Bring-up:**
- `setup`: per the matching language recipe below (`npm ci`, venv,
  `go mod download`)
- `seed`: omit unless present
- `run`: omit — there is nothing to launch
- `test`: per the matching language recipe below
- `health`: omit
- `mode`: `cli`

**Port injection:** not applicable. In `cli` mode `qa-orchestrator` skips
launch and health entirely; bring-up is setup + seed, and verifiers
invoke the CLI directly.

## node / npm

**Detect:** `package.json` at repo root (and no compose file, and the
CLI-only recipe above did not already match it).

**Bring-up:**
- `setup`: `npm ci` — or `pnpm install --frozen-lockfile` if
  `pnpm-lock.yaml` exists, `yarn install --frozen-lockfile` if `yarn.lock`
- `seed`: `scripts["db:seed"]` or `scripts.seed` if present, else omit
- `run`: `scripts.dev`, else `scripts.start`
- `test`: `scripts.test` — unless it is npm's placeholder
  (`echo "Error: no test specified"`), which counts as no suite
- `health`: `http://localhost:{PORT}/`
- `mode`: `browser`

**Port injection:** `PORT` env var (Express, Next, CRA, most frameworks
honor it). Vite ignores it — if the run script is Vite, use
`npm run dev -- --port {PORT}` instead.

## python

**Detect:** `pyproject.toml` or `requirements.txt`.

**Bring-up:**
- `setup`: `python -m venv .forge-venv && .forge-venv/bin/pip install -r
  requirements.txt` (or `.forge-venv/bin/pip install -e .` for pyproject)
- `seed`: a `seed`/`fixtures` management command if discoverable, else omit
- `run`: the detected entry — `uvicorn <module>:app --port {PORT}`,
  `flask run --port {PORT}`, or `python manage.py runserver {PORT}`
- `test`: `.forge-venv/bin/pytest`
- `health`: `http://localhost:{PORT}/`
- `mode`: `browser`

**Port injection:** `--port {PORT}` flag on the run command (shown above).

## go

**Detect:** `go.mod`.

**Bring-up:**
- `setup`: `go mod download`
- `seed`: omit unless an obvious seed command exists
- `run`: `go run .`
- `test`: `go test ./...`
- `health`: `http://localhost:{PORT}/`
- `mode`: `browser`

**Port injection:** no universal convention — check `main` for a `PORT`
env read or a `-port`/`-addr` flag; neither found → bring-up failure
(there is no human to ask).

## static site

**Detect:** `index.html` (or a build output dir) with no server-side code
and no test framework.

**Bring-up:**
- `setup`: the build script if one exists, else omit
- `seed`: omit
- `run`: `npx -y serve -l {PORT} <dir>`
- `test`: omit (recorded as "no test suite found" — a lens can still
  earn evidence via E2E)
- `health`: `http://localhost:{PORT}/`
- `mode`: `browser`

**Port injection:** the `-l {PORT}` flag shown above.
