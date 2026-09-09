'use strict';

const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFile: execFileCb } = require('node:child_process');

const { parseMetrics, buildTimeline } = require('./metrics.js');
const { stageFromLabels, priorityFromLabels, createBoard, repoFromPath } = require('./board.js');
const fixtures = require('./fixtures.js');
const timeline = require('./timeline.js');
const stats = require('./stats.js');
const trail = require('./trail.js');

// gatherRows() fans out one `gh` call per open issue plus one per ticket
// detail; /api/timeline and /api/stats each call it, so a naive
// implementation doubles that fan-out on every poll of both views. Cache the
// built rows per project id for a few seconds and de-dupe concurrent
// in-flight fetches so two back-to-back requests for the same project share
// one fan-out.
const ROW_CACHE_TTL_MS = 3000;

const DETAIL_CONCURRENCY = 5;

async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }
  const workers = [];
  for (let i = 0; i < Math.min(limit, items.length); i++) workers.push(worker());
  await Promise.all(workers);
  return results;
}

const DEFAULT_PORT = 7433;
const MAX_PORT = 7453;
const MAX_BODY_BYTES = 1024 * 1024; // 1MB
const WEB_ROOT = path.join(__dirname, '..', 'web');

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function defaultConfigPath() {
  return path.join(os.homedir(), '.claude', 'shipyard-dashboard.json');
}

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];
    let rejected = false;

    req.on('data', (chunk) => {
      if (rejected) return;
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        rejected = true;
        // Don't destroy the socket here — req/res share it on HTTP/1.1, and
        // destroying now would prevent the caller from ever writing the
        // error response. Just stop buffering; the caller destroys the
        // connection after the response is flushed.
        reject(Object.assign(new Error('request body too large'), { statusCode: 413 }));
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (rejected) return;
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (err) {
        reject(Object.assign(new Error('invalid JSON body'), { statusCode: 400 }));
      }
    });

    req.on('error', (err) => reject(err));
  });
}

// Guards against CSRF and DNS-rebinding: this server binds to 127.0.0.1
// but CORS "simple requests" (e.g. a form POST) skip preflight, and a
// malicious page served from an attacker-controlled DNS name that
// resolves to 127.0.0.1 could still send same-origin-looking requests if
// we only trusted the socket. So we validate Origin (when present) and
// Host against the loopback names the server actually listens on.
function isAllowedOrigin(origin, port) {
  if (!origin) return true;
  return origin === `http://127.0.0.1:${port}` || origin === `http://localhost:${port}`;
}

function isAllowedHostHeader(hostHeader) {
  if (!hostHeader) return true;
  let hostname;
  try {
    hostname = new URL(`http://${hostHeader}`).hostname;
  } catch (err) {
    return false;
  }
  return hostname === '127.0.0.1' || hostname === 'localhost';
}

function slugify(input) {
  const base = String(input || 'project')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'project';
}

function uniqueSlug(desired, existingIds) {
  if (!existingIds.has(desired)) return desired;
  let n = 2;
  while (existingIds.has(`${desired}-${n}`)) n++;
  return `${desired}-${n}`;
}

function ticketListEntry(project, issue) {
  const { stage, conflict } = stageFromLabels(issue.labels);
  const priority = priorityFromLabels(issue.labels);
  const assignee = (issue.assignees && issue.assignees[0] && issue.assignees[0].login) || null;
  return {
    project: project.id,
    projectName: project.name,
    number: issue.number,
    title: issue.title,
    stage,
    conflict,
    running: stage === 'Dev' || stage === 'QA',
    assignee,
    priority,
    updatedAt: issue.updatedAt,
    url: issue.url,
  };
}

async function readOptionalFile(filePath) {
  try {
    return await fsp.readFile(filePath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

function ghAuthCheck() {
  return new Promise((resolve) => {
    execFileCb('gh', ['auth', 'status'], { timeout: 3000 }, (err) => {
      resolve(!err);
    });
  });
}

function createApp(opts = {}) {
  const mock = !!opts.mock;
  const configPath = opts.configPath || defaultConfigPath();
  const execFile = opts.execFile; // undefined -> board.js's real default

  const board = mock ? fixtures.createMockBoard() : createBoard(execFile);
  const repoExecFile = mock ? fixtures.mockExecFile : execFile;

  async function loadConfig() {
    if (mock) return { projects: fixtures.getProjects() };
    try {
      const raw = await fsp.readFile(configPath, 'utf8');
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.projects)) return { projects: [] };
      return parsed;
    } catch (err) {
      if (err.code === 'ENOENT') return { projects: [] };
      throw err;
    }
  }

  async function saveConfig(config) {
    if (mock) return; // fixtures.PROJECTS array is mutated in place by callers
    await fsp.mkdir(path.dirname(configPath), { recursive: true });
    await fsp.writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
  }

  async function findProject(config, id) {
    return config.projects.find((p) => p.id === id) || null;
  }

  // ---- route handlers -----------------------------------------------

  async function handleHealth(req, res) {
    const gh = await ghAuthCheck();
    sendJson(res, 200, { ok: true, gh });
  }

  async function handleGetProjects(req, res) {
    const config = await loadConfig();
    const failed = [];
    const projects = await Promise.all(
      config.projects.map(async (p) => {
        try {
          const tickets = await board.listTickets(p.repo);
          return { id: p.id, name: p.name, path: p.path, repo: p.repo, openCount: tickets.length };
        } catch (err) {
          failed.push(p.id);
          return { id: p.id, name: p.name, path: p.path, repo: p.repo, openCount: null };
        }
      })
    );
    const payload = { projects };
    if (failed.length > 0) {
      payload.warning = `Failed to load tickets for: ${failed.join(', ')}`;
    }
    sendJson(res, 200, payload);
  }

  async function handlePostProjects(req, res) {
    let body;
    try {
      body = await readJsonBody(req);
    } catch (err) {
      sendJson(res, err.statusCode || 400, { error: err.message });
      req.destroy();
      return;
    }
    const dirPath = body && body.path;
    const name = body && body.name;
    if (!dirPath || typeof dirPath !== 'string') {
      sendJson(res, 400, { error: 'path is required' });
      return;
    }
    let stat;
    try {
      stat = await fsp.stat(dirPath);
    } catch (err) {
      sendJson(res, 400, { error: `path does not exist: ${dirPath}` });
      return;
    }
    if (!stat.isDirectory()) {
      sendJson(res, 400, { error: `path is not a directory: ${dirPath}` });
      return;
    }
    let repo;
    try {
      repo = await repoFromPath(dirPath, repoExecFile);
    } catch (err) {
      sendJson(res, 400, { error: err.message });
      return;
    }
    const config = await loadConfig();
    const existingIds = new Set(config.projects.map((p) => p.id));
    const id = uniqueSlug(slugify(name || path.basename(dirPath)), existingIds);
    const project = { id, name: name || path.basename(dirPath), path: dirPath, repo };
    config.projects.push(project);
    await saveConfig(config);
    sendJson(res, 200, { project });
  }

  async function handleGetTickets(req, res, query) {
    const config = await loadConfig();
    const projectFilter = query.get('project') || 'all';
    const projects =
      projectFilter === 'all'
        ? config.projects
        : config.projects.filter((p) => p.id === projectFilter);

    if (projectFilter !== 'all' && projects.length === 0) {
      sendJson(res, 400, { error: `unknown project: ${projectFilter}` });
      return;
    }

    const all = [];
    for (const project of projects) {
      try {
        const issues = await board.listTickets(project.repo);
        for (const issue of issues) all.push(ticketListEntry(project, issue));
      } catch (err) {
        // Skip projects whose board is unreachable; /api/projects surfaces
        // the failure explicitly, this endpoint just omits their tickets.
      }
    }
    all.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
    sendJson(res, 200, { tickets: all });
  }

  // Resolves the project list the same way handleGetTickets does, lists
  // issues per project, then fetches full ticket detail (comments) for each
  // issue with bounded concurrency so a large board doesn't spawn hundreds
  // of `gh` processes at once. A single bad ticket degrades to a
  // list-derived row instead of failing the whole response.
  const rowCache = new Map(); // projectId -> { data, expiresAt }
  const rowCachePending = new Map(); // projectId -> Promise<data>

  async function gatherRows(projectId) {
    const key = projectId || 'all';
    const cached = rowCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.data;
    if (rowCachePending.has(key)) return rowCachePending.get(key);

    const pending = gatherRowsUncached(key)
      .then((data) => {
        rowCache.set(key, { data, expiresAt: Date.now() + ROW_CACHE_TTL_MS });
        rowCachePending.delete(key);
        return data;
      })
      .catch((err) => {
        rowCachePending.delete(key);
        throw err;
      });
    rowCachePending.set(key, pending);
    return pending;
  }

  async function gatherRowsUncached(projectId) {
    const config = await loadConfig();
    const projectFilter = projectId || 'all';
    const projects =
      projectFilter === 'all'
        ? config.projects
        : config.projects.filter((p) => p.id === projectFilter);

    if (projectFilter !== 'all' && projects.length === 0) {
      return { error: `unknown project: ${projectFilter}` };
    }

    const warnings = [];
    const tickets = [];

    for (const project of projects) {
      let issues;
      try {
        issues = await board.listTickets(project.repo);
      } catch (err) {
        warnings.push(`Failed to load tickets for ${project.id}: ${err.message}`);
        continue;
      }

      const details = await mapWithConcurrency(issues, DETAIL_CONCURRENCY, async (issue) => {
        try {
          const detail = await board.getTicket(project.repo, issue.number);
          return { ...detail, project: project.id };
        } catch (err) {
          warnings.push(
            `Failed to load detail for ${project.id}#${issue.number}: ${err.message}`
          );
          return { ...issue, comments: [], project: project.id };
        }
      });

      for (const d of details) tickets.push(d);
    }

    const built = timeline.buildBoardTimeline({ tickets, projects: config.projects, now: Date.now() });
    return { ...built, warnings };
  }

  async function handleGetTimeline(req, res, query) {
    const projectFilter = query.get('project') || 'all';
    const result = await gatherRows(projectFilter);
    if (result.error) {
      sendJson(res, 400, { error: result.error });
      return;
    }
    const { now, domain, groups, rows, warnings } = result;
    sendJson(res, 200, { now, domain, groups, rows, warnings });
  }

  async function handleGetStats(req, res, query) {
    const projectFilter = query.get('project') || 'all';
    const result = await gatherRows(projectFilter);
    if (result.error) {
      sendJson(res, 400, { error: result.error });
      return;
    }
    const built = stats.buildStats({ rows: result.rows, now: result.now });
    sendJson(res, 200, { ...built, warnings: result.warnings });
  }

  async function handleGetTicketDetail(req, res, projectId, numberStr) {
    const config = await loadConfig();
    const project = await findProject(config, projectId);
    if (!project) {
      sendJson(res, 404, { error: `unknown project: ${projectId}` });
      return;
    }
    const number = Number(numberStr);
    let issue;
    try {
      issue = await board.getTicket(project.repo, number);
    } catch (err) {
      sendJson(res, 404, { error: `ticket not found: ${numberStr}` });
      return;
    }
    const entry = ticketListEntry(project, issue);

    let spec = null;
    let plan = null;
    if (mock) {
      spec = typeof issue.spec === 'string' ? issue.spec : null;
      plan = typeof issue.plan === 'string' ? issue.plan : null;
    } else {
      const dir = path.join(project.path, 'docs', 'ship', String(number));
      spec = await readOptionalFile(path.join(dir, 'spec.md'));
      plan = await readOptionalFile(path.join(dir, 'plan.md'));
    }

    const comments = issue.comments || [];
    const logs = trail.parseLogEntries(comments).map((e) => ({
      header: e.header,
      body: e.body,
      createdAt: e.at === null ? null : new Date(e.at).toISOString(),
    }));
    const ticketTimeline = buildTimeline(comments, entry.stage);

    sendJson(res, 200, {
      ticket: { ...entry, body: issue.body, spec, plan, logs, timeline: ticketTimeline },
    });
  }

  async function handleApprove(req, res, projectId, numberStr) {
    const config = await loadConfig();
    const project = await findProject(config, projectId);
    if (!project) {
      sendJson(res, 404, { error: `unknown project: ${projectId}` });
      return;
    }
    const number = Number(numberStr);
    let issue;
    try {
      issue = await board.getTicket(project.repo, number);
    } catch (err) {
      sendJson(res, 404, { error: `ticket not found: ${numberStr}` });
      return;
    }
    const { stage } = stageFromLabels(issue.labels);
    try {
      await board.approve(project.repo, number, stage);
    } catch (err) {
      if (/approve not available/.test(err.message)) {
        sendJson(res, 409, { error: err.message });
        return;
      }
      throw err;
    }
    sendJson(res, 200, { ok: true });
  }

  async function handleAssign(req, res, projectId, numberStr) {
    const config = await loadConfig();
    const project = await findProject(config, projectId);
    if (!project) {
      sendJson(res, 404, { error: `unknown project: ${projectId}` });
      return;
    }
    let body;
    try {
      body = await readJsonBody(req);
    } catch (err) {
      sendJson(res, err.statusCode || 400, { error: err.message });
      req.destroy();
      return;
    }
    const login = body && body.login;
    if (!login || typeof login !== 'string') {
      sendJson(res, 400, { error: 'login is required' });
      return;
    }
    const number = Number(numberStr);
    try {
      await board.assign(project.repo, number, login);
    } catch (err) {
      sendJson(res, 400, { error: err.message });
      return;
    }
    sendJson(res, 200, { ok: true });
  }

  // ---- static file serving -------------------------------------------

  async function serveStatic(req, res, pathname) {
    let decoded;
    try {
      decoded = decodeURIComponent(pathname);
    } catch (err) {
      sendJson(res, 400, { error: 'bad request path' });
      return;
    }
    if (decoded === '/' || decoded === '') decoded = '/index.html';

    const resolved = path.resolve(WEB_ROOT, '.' + decoded);
    const rootWithSep = WEB_ROOT.endsWith(path.sep) ? WEB_ROOT : WEB_ROOT + path.sep;
    if (resolved !== WEB_ROOT && !resolved.startsWith(rootWithSep)) {
      sendJson(res, 404, { error: 'not found' });
      return;
    }

    let stat;
    try {
      stat = await fsp.stat(resolved);
    } catch (err) {
      sendJson(res, 404, { error: 'not found' });
      return;
    }
    if (stat.isDirectory()) {
      sendJson(res, 404, { error: 'not found' });
      return;
    }

    const ext = path.extname(resolved).toLowerCase();
    const contentType = CONTENT_TYPES[ext] || 'application/octet-stream';
    fs.readFile(resolved, (err, data) => {
      if (err) {
        sendJson(res, 404, { error: 'not found' });
        return;
      }
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    });
  }

  // ---- router ----------------------------------------------------------

  const server = http.createServer((req, res) => {
    Promise.resolve()
      .then(async () => {
        const addr = server.address();
        const port = addr && addr.port;
        if (!isAllowedOrigin(req.headers.origin, port)) {
          sendJson(res, 403, { error: 'cross-origin request rejected' });
          return;
        }
        if (!isAllowedHostHeader(req.headers.host)) {
          sendJson(res, 403, { error: 'cross-origin request rejected' });
          return;
        }

        const url = new URL(req.url, 'http://127.0.0.1');
        const pathname = url.pathname;
        const parts = pathname.split('/').filter(Boolean);

        if (pathname === '/api/health' && req.method === 'GET') {
          return handleHealth(req, res);
        }
        if (pathname === '/api/projects' && req.method === 'GET') {
          return handleGetProjects(req, res);
        }
        if (pathname === '/api/projects' && req.method === 'POST') {
          return handlePostProjects(req, res);
        }
        if (pathname === '/api/tickets' && req.method === 'GET') {
          return handleGetTickets(req, res, url.searchParams);
        }
        if (pathname === '/api/timeline' && req.method === 'GET') {
          return handleGetTimeline(req, res, url.searchParams);
        }
        if (pathname === '/api/stats' && req.method === 'GET') {
          return handleGetStats(req, res, url.searchParams);
        }
        // /api/tickets/<projectId>/<number>[/approve|/assign]
        if (parts[0] === 'api' && parts[1] === 'tickets' && parts.length === 4 && req.method === 'GET') {
          return handleGetTicketDetail(req, res, parts[2], parts[3]);
        }
        if (
          parts[0] === 'api' &&
          parts[1] === 'tickets' &&
          parts.length === 5 &&
          parts[4] === 'approve' &&
          req.method === 'POST'
        ) {
          return handleApprove(req, res, parts[2], parts[3]);
        }
        if (
          parts[0] === 'api' &&
          parts[1] === 'tickets' &&
          parts.length === 5 &&
          parts[4] === 'assign' &&
          req.method === 'POST'
        ) {
          return handleAssign(req, res, parts[2], parts[3]);
        }
        if (parts[0] === 'api') {
          sendJson(res, 404, { error: `not found: ${pathname}` });
          return;
        }
        return serveStatic(req, res, pathname);
      })
      .catch((err) => {
        if (!res.headersSent) {
          sendJson(res, 500, { error: err && err.message ? err.message : 'internal error' });
        } else {
          res.end();
        }
      });
  });

  return server;
}

// ---- CLI entry point -----------------------------------------------------

function listenWithScan(server, startPort) {
  return new Promise((resolve, reject) => {
    let port = startPort;

    function tryListen() {
      const onError = (err) => {
        server.removeListener('listening', onListening);
        if (err.code === 'EADDRINUSE' && port < MAX_PORT) {
          port += 1;
          tryListen();
        } else if (err.code === 'EADDRINUSE') {
          reject(new Error(`No available port in range ${startPort}-${MAX_PORT}`));
        } else {
          reject(err);
        }
      };
      const onListening = () => {
        server.removeListener('error', onError);
        resolve(port);
      };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(port, '127.0.0.1');
    }

    tryListen();
  });
}

function parseArgv(argv) {
  const opts = { port: DEFAULT_PORT, open: false, mock: false, configPath: undefined };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--port') {
      opts.port = parseInt(argv[++i], 10);
    } else if (arg === '--open') {
      opts.open = true;
    } else if (arg === '--mock') {
      opts.mock = true;
    } else if (arg === '--config') {
      opts.configPath = argv[++i];
    }
  }
  return opts;
}

function main() {
  const opts = parseArgv(process.argv.slice(2));
  const server = createApp({ mock: opts.mock, configPath: opts.configPath });

  listenWithScan(server, opts.port || DEFAULT_PORT)
    .then((port) => {
      console.log(`Shipyard dashboard: http://127.0.0.1:${port}`);
      if (opts.open) {
        const url = `http://127.0.0.1:${port}`;
        const cmd = process.platform === 'darwin' ? 'open' : 'xdg-open';
        execFileCb(cmd, [url], () => {});
      }
    })
    .catch((err) => {
      console.error(`Failed to start Shipyard dashboard server: ${err.message}`);
      process.exit(1);
    });
}

if (require.main === module) {
  main();
}

module.exports = { createApp, main, slugify, uniqueSlug };
