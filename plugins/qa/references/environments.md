# Environment detection recipes

Used by the skill's first-run interview (standalone only) to propose a
`qa` config block. Apply the **first matching recipe in file order** —
docker-compose deliberately outranks node so a composed app isn't
mis-detected by its `package.json`. Every proposed value is shown to the
human for confirmation or editing before anything persists; these are
defaults, not decisions.

Each recipe must answer: how is the port injected? If the recipe cannot
determine a mechanism for this repo, the interview asks the human instead
of guessing.

## docker-compose

**Detect:** `docker-compose.yml` or `compose.yaml` at repo root.

**Proposed block:**
- `setup`: `docker compose build`
- `seed`: a service or script named `seed` if one exists, else omit
- `run`: `docker compose up`
- `test`: from `package.json` scripts / `pytest` / `go test ./...` if the
  repo also carries an app-level test setup; else omit
- `health`: `http://localhost:{PORT}/` against the first published port
- `e2e`: `browser`

**Port injection:** works only if the compose file maps the host port from
an env var (e.g. `"${PORT:-3000}:3000"`). If it hard-codes the host port,
say so in the interview: parallel QA runs will collide on it, and the
human chooses to either edit the compose file or accept serialized runs.

## node / npm

**Detect:** `package.json` at repo root (and no compose file).

**Proposed block:**
- `setup`: `npm ci` — or `pnpm install --frozen-lockfile` if
  `pnpm-lock.yaml` exists, `yarn install --frozen-lockfile` if `yarn.lock`
- `seed`: `scripts["db:seed"]` or `scripts.seed` if present, else omit
- `run`: `scripts.dev`, else `scripts.start`
- `test`: `scripts.test` — unless it is npm's placeholder
  (`echo "Error: no test specified"`), which counts as no suite
- `health`: `http://localhost:{PORT}/`
- `e2e`: `auto`

**Port injection:** `PORT` env var (Express, Next, CRA, most frameworks
honor it). Vite ignores it — if the run script is Vite, propose
`npm run dev -- --port {PORT}` instead.

## python

**Detect:** `pyproject.toml` or `requirements.txt`.

**Proposed block:**
- `setup`: `python -m venv .qa-venv && .qa-venv/bin/pip install -r
  requirements.txt` (or `.qa-venv/bin/pip install -e .` for pyproject)
- `seed`: a `seed`/`fixtures` management command if discoverable, else omit
- `run`: the detected entry — `uvicorn <module>:app --port {PORT}`,
  `flask run --port {PORT}`, or `python manage.py runserver {PORT}`
- `test`: `.qa-venv/bin/pytest`
- `health`: `http://localhost:{PORT}/`
- `e2e`: `auto`

**Port injection:** `--port {PORT}` flag on the run command (shown above).

## go

**Detect:** `go.mod`.

**Proposed block:**
- `setup`: `go mod download`
- `seed`: omit unless an obvious seed command exists
- `run`: `go run .`
- `test`: `go test ./...`
- `health`: `http://localhost:{PORT}/`
- `e2e`: `auto`

**Port injection:** no universal convention — check `main` for a `PORT`
env read or a `-port`/`-addr` flag; if neither is found, the interview
asks the human.

## static site

**Detect:** `index.html` (or a build output dir) with no server-side code
and no test framework.

**Proposed block:**
- `setup`: the build script if one exists, else omit
- `seed`: omit
- `run`: `npx -y serve -l {PORT} <dir>`
- `test`: omit (recorded as "no test suite found" — full tier stays
  reachable via E2E per the spec's tier table)
- `health`: `http://localhost:{PORT}/`
- `e2e`: `browser`

**Port injection:** the `-l {PORT}` flag shown above.

## CLI-only

**Detect:** a `bin` entry in `package.json`, or a main package that never
opens a listener (no server dependency, no port reference).

**Proposed block:**
- `setup`: per the language recipe above (`npm ci`, venv, `go mod download`)
- `seed`: omit unless present
- `run`: omit — there is nothing to launch
- `test`: per the language recipe
- `health`: omit
- `e2e`: `cli`

**Port injection:** not applicable. In `cli` mode the skill skips launch
and health entirely; bring-up is setup + seed, and criteria are exercised
by invoking the CLI directly.
