'use strict';

const { execFile: execFileCb } = require('node:child_process');
const { promisify } = require('node:util');
const fs = require('node:fs');
const nodePath = require('node:path');

// Contract v1 §4, most-advanced-first: with a conflicting multi-label ticket
// we still report a stage (flagged `conflict`) rather than guessing Backlog.
const STAGE_PRECEDENCE = [
  { label: 'ship:needs-human', stage: 'Needs Human' },
  { label: 'ship:pr-open', stage: 'PR Open' },
  { label: 'ship:approved', stage: 'Approved' },
  { label: 'ship:awaiting-review', stage: 'Awaiting Review' },
  { label: 'ship:in-qa', stage: 'QA' },
  { label: 'ship:in-dev', stage: 'Dev' },
  { label: 'ship:planned', stage: 'Planned' },
  { label: 'ship:specced', stage: "Spec'd" },
];

function stageFromLabels(labels) {
  const names = (labels || [])
    .map((l) => (l && l.name) || '')
    .filter(Boolean);
  const shipLabelCount = names.filter((n) => n.startsWith('ship:')).length;
  const conflict = shipLabelCount > 1;

  for (const { label, stage } of STAGE_PRECEDENCE) {
    if (names.includes(label)) {
      return { stage, conflict };
    }
  }

  return { stage: 'Backlog', conflict };
}

function priorityFromLabels(labels) {
  const names = (labels || []).map((l) => (l && l.name) || '');
  for (const name of names) {
    const m = /^priority:\s*(.+)$/i.exec(name);
    if (m) {
      const value = m[1];
      return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
    }
  }
  return null;
}

function defaultExecFile(cmd, args) {
  const run = promisify(execFileCb);
  return run(cmd, args, {
    maxBuffer: 10 * 1024 * 1024,
    timeout: 20000,
    killSignal: 'SIGKILL',
  }).then((r) => r.stdout);
}

function createBoard(execFile) {
  const run = execFile || defaultExecFile;

  return {
    async listTickets(repo) {
      const stdout = await run('gh', [
        'issue',
        'list',
        '--repo',
        repo,
        '--state',
        'open',
        '--limit',
        '1000',
        '--json',
        'number,title,labels,assignees,updatedAt,url',
      ]);
      return JSON.parse(stdout);
    },

    async getTicket(repo, number) {
      const stdout = await run('gh', [
        'issue',
        'view',
        String(number),
        '--repo',
        repo,
        '--json',
        'number,title,body,labels,state,url,comments,assignees,updatedAt',
      ]);
      return JSON.parse(stdout);
    },

    async approve(repo, number, stage) {
      // Contract v1 §4 / program spec Decision 6: the review gate swaps
      // ship:awaiting-review -> ship:approved. It does NOT close the issue —
      // the issue closes when the PR merges, and `pr` consumes ship:approved.
      if (stage === 'Awaiting Review') {
        await run('gh', [
          'issue',
          'edit',
          String(number),
          '--repo',
          repo,
          '--add-label',
          'ship:approved',
          '--remove-label',
          'ship:awaiting-review',
        ]);
        return;
      }
      if (stage === 'Needs Human') {
        await run('gh', [
          'issue',
          'edit',
          String(number),
          '--repo',
          repo,
          '--add-label',
          'ship:planned',
          '--remove-label',
          'ship:needs-human',
        ]);
        return;
      }
      throw new Error(`approve not available for stage ${stage}`);
    },

    async assign(repo, number, login) {
      await run('gh', [
        'issue',
        'edit',
        String(number),
        '--repo',
        repo,
        '--add-assignee',
        login,
      ]);
    },
  };
}

async function repoFromPath(path, execFile) {
  const run = execFile || defaultExecFile;
  const stdout = await run('git', ['-C', path, 'remote', 'get-url', 'origin']);
  const url = stdout.trim();

  let m = /^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/.exec(url);
  if (!m) {
    m = /^https:\/\/github\.com\/([^/]+)\/(.+?)(?:\.git)?$/.exec(url);
  }

  if (!m) {
    throw new Error(`Remote origin is not a GitHub repository: ${url}`);
  }

  return `${m[1]}/${m[2]}`;
}

/**
 * The invoking `gh` account. Contract v1 §3 makes this the anchor of the trust
 * rule: a comment is trusted only when its author is this login or appears in
 * `approvers`. When it cannot be determined we return null, which per §3 means
 * every author outside `approvers` is untrusted — fail closed, never open.
 */
async function viewer(execFile) {
  const run = execFile || defaultExecFile;
  try {
    const stdout = await run('gh', ['api', 'user', '--jq', '.login']);
    const login = String(stdout || '').trim();
    return login || null;
  } catch (err) {
    return null;
  }
}

/**
 * `approvers` from a linked project's .claude/ship.config.json (contract §12).
 * A missing file, unreadable file, bad JSON or wrong type all yield [] — a
 * trust list is never guessed, and this must never throw into a request.
 */
function readApprovers(projectPath) {
  if (!projectPath) return [];
  try {
    const raw = fs.readFileSync(nodePath.join(projectPath, '.claude', 'ship.config.json'), 'utf8');
    const cfg = JSON.parse(raw);
    const list = cfg && cfg.approvers;
    if (!Array.isArray(list)) return [];
    return list.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim());
  } catch (err) {
    return [];
  }
}

module.exports = { stageFromLabels, priorityFromLabels, createBoard, repoFromPath, viewer, readApprovers };
