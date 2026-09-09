'use strict';

const { execFile: execFileCb } = require('node:child_process');
const { promisify } = require('node:util');

const STAGE_PRECEDENCE = [
  { label: 'ship:needs-human', stage: 'Needs Human' },
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
      if (stage === 'Awaiting Review') {
        await run('gh', ['issue', 'close', String(number), '--repo', repo]);
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

module.exports = { stageFromLabels, priorityFromLabels, createBoard, repoFromPath };
