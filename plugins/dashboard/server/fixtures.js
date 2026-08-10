'use strict';

// In-memory mock data for `--mock` mode. Shapes mirror what board.js's
// createBoard() and the real config file produce, so server.js can swap
// this in wholesale without branching route logic. Ticket titles/owners are
// ported from the design prototype (docs/design/dashboard/Shipyard
// Dashboard.dc.html) so the mock UI matches the design mock.
//
// Mutable module-level state: actions (approve/assign/add-project) mutate
// these arrays in place so the UI is fully exercisable offline across
// requests within a process lifetime.

function iso(minutesAgo) {
  return new Date(Date.now() - minutesAgo * 60000).toISOString();
}

function metricsComment(header, stage, startedAgoMin, finishedAgoMin, tokensIn, tokensOut) {
  const body = `${header}\n\n<!-- shipyard-metrics {"stage":"${stage}","started":"${iso(startedAgoMin)}","finished":"${iso(finishedAgoMin)}","tokens_in":${tokensIn},"tokens_out":${tokensOut}} -->`;
  return { body, createdAt: iso(finishedAgoMin) };
}

const PROJECTS = [
  { id: 'core', name: 'Core platform', path: '/mock/core', repo: 'org/shipyard-core' },
  { id: 'reef', name: 'Reef Tracker', path: '/mock/reef', repo: 'org/reef-tracker' },
];

// repo -> ticket[] ; each ticket mirrors `gh issue view --json
// number,title,body,labels,state,url,comments,assignees` plus fixture-only
// `spec`/`plan` fields (real mode reads those from disk; mock mode reads
// them straight off the ticket).
const TICKETS = {
  'org/shipyard-core': [
    {
      number: 101,
      title: 'Reef tank PRD',
      body: 'Draft PRD for the reef-tank water parameter tracker: problem, users, success metrics.',
      labels: [],
      state: 'open',
      url: 'https://github.com/org/shipyard-core/issues/101',
      assignees: [{ login: 'm.alvarez' }],
      updatedAt: iso(120),
      spec: null,
      plan: null,
      comments: [],
    },
    {
      number: 102,
      title: 'Ticket breakdown: auth',
      body: 'Break the auth PRD into dependency-linked vertical-slice tickets.',
      labels: [{ name: 'ship:specced' }, { name: 'priority: medium' }],
      state: 'open',
      url: 'https://github.com/org/shipyard-core/issues/102',
      assignees: [{ login: 'r.chen' }],
      updatedAt: iso(40),
      spec: "Done means: every ticket is a vertical slice a human can verify end-to-end; `Depends on:` links where genuinely required.",
      plan: null,
      comments: [
        metricsComment('📋 Spec approved — `docs/ship/102/spec.md`', 'spec', 60, 42, 68000, 11000),
      ],
    },
    {
      number: 81,
      title: 'CSV export for reports',
      body: 'Server-side CSV export for the reporting dashboard, streamed for large datasets.',
      labels: [{ name: 'ship:in-dev' }, { name: 'priority: medium' }],
      state: 'open',
      url: 'https://github.com/org/shipyard-core/issues/81',
      assignees: [{ login: 'dev-agent' }],
      updatedAt: iso(6),
      spec: 'Done means: handles 500k+ rows without OOM, respects active filters, UTF-8 BOM for Excel.',
      plan: '1. Streaming CSV writer\n2. Wire filter state into query\n3. Failing-then-passing tests per task\n4. Adversarial review pass',
      comments: [
        metricsComment('📋 Spec approved — `docs/ship/81/spec.md`', 'spec', 400, 380, 68000, 11000),
        metricsComment('🗺️ Plan approved — `docs/ship/81/plan.md`', 'plan', 370, 348, 54000, 9000),
        metricsComment('ship:dev round 1/1', 'dev', 100, 6, 420000, 38000),
      ],
    },
    {
      number: 65,
      title: 'Webhook retry backoff',
      body: 'Exponential backoff + dead-letter queue for failed outbound webhooks.',
      labels: [{ name: 'ship:in-dev' }, { name: 'ship:planned' }, { name: 'priority: high' }],
      state: 'open',
      url: 'https://github.com/org/shipyard-core/issues/65',
      assignees: [{ login: 'r.chen' }],
      updatedAt: iso(2880),
      spec: 'Done means: 5 retries max, jittered backoff, DLQ entries visible in admin.',
      plan: '1. Backoff scheduler\n2. DLQ table + admin view\n3. Load + failure-injection tests',
      comments: [
        metricsComment('ship:dev round 1/2', 'dev', 200, 120, 210000, 19000),
      ],
    },
    {
      number: 70,
      title: 'Onboarding checklist widget',
      body: 'Dismissible checklist nudging new accounts through first-run setup.',
      labels: [{ name: 'ship:awaiting-review' }, { name: 'priority: medium' }],
      state: 'open',
      url: 'https://github.com/org/shipyard-core/issues/70',
      assignees: [{ login: 'j.okafor' }],
      updatedAt: iso(1440),
      spec: 'Done means: dismiss persists, resumes where left off, tracks completion rate.',
      plan: '1. Checklist state model\n2. Widget UI\n3. Analytics events\n4. QA pass',
      comments: [
        metricsComment('📋 Spec approved — `docs/ship/70/spec.md`', 'spec', 600, 574, 68000, 11000),
        metricsComment('🗺️ Plan approved — `docs/ship/70/plan.md`', 'plan', 560, 538, 54000, 9000),
        metricsComment('ship:dev round 1/1', 'dev', 500, 300, 420000, 38000),
        metricsComment('ship:qa verdict full', 'qa', 290, 259, 96000, 14000),
        metricsComment('ship:review-packet — ready for human review', 'ship', 250, 238, 27000, 5000),
      ],
    },
  ],
  'org/reef-tracker': [
    {
      number: 97,
      title: 'Magic-link login',
      body: 'Passwordless login via emailed magic link, session bootstrap on click-through.',
      labels: [{ name: 'ship:planned' }, { name: 'priority: high' }],
      state: 'open',
      url: 'https://github.com/org/reef-tracker/issues/97',
      assignees: [{ login: 'r.chen' }],
      updatedAt: iso(1400),
      spec: 'Done means: link expires in 15m, single-use, falls back to password if email delivery fails.',
      plan: '1. Token issuance + storage\n2. Email delivery\n3. Session bootstrap on click-through\n4. Expiry + single-use tests',
      comments: [
        metricsComment('📋 Spec approved — `docs/ship/97/spec.md`', 'spec', 1500, 1474, 68000, 11000),
        metricsComment('🗺️ Plan approved — `docs/ship/97/plan.md`', 'plan', 1460, 1438, 54000, 9000),
      ],
    },
    {
      number: 76,
      title: 'Dark mode toggle',
      body: 'Persisted dark-mode toggle across the settings surface.',
      labels: [{ name: 'ship:in-qa' }, { name: 'priority: low' }],
      state: 'open',
      url: 'https://github.com/org/reef-tracker/issues/76',
      assignees: [{ login: 'qa-agent' }],
      updatedAt: iso(22),
      spec: 'Done means: persists across reload, respects system preference by default, no flash of wrong theme.',
      plan: '1. Theme context + localStorage\n2. Settings toggle UI\n3. Regression pass on existing screens',
      comments: [
        metricsComment('ship:dev round 1/1', 'dev', 90, 40, 210000, 19000),
        metricsComment('ship:qa verdict full', 'qa', 31, 22, 96000, 14000),
      ],
    },
    {
      number: 88,
      title: 'Rate-limit API gateway',
      body: 'Token-bucket rate limiting in front of the public API.',
      labels: [{ name: 'ship:needs-human' }, { name: 'priority: medium' }],
      state: 'open',
      url: 'https://github.com/org/reef-tracker/issues/88',
      assignees: [],
      updatedAt: iso(180),
      spec: 'Done means: 429 with Retry-After header, per-key limits configurable, burst allowance.',
      plan: '1. Add token-bucket middleware\n2. Wire per-key config store\n3. Tests: burst, sustained, reset\n4. Load test at 10x expected traffic',
      comments: [
        metricsComment('ship:dev round 1/3', 'dev', 500, 400, 300000, 28000),
        metricsComment('ship:qa verdict tests-only', 'qa', 390, 360, 80000, 10000),
        { body: 'ship:escalation — dev/QA loop exhausted at round 3', createdAt: iso(20) },
      ],
    },
  ],
};

function findTicket(repo, number) {
  const list = TICKETS[repo] || [];
  return list.find((t) => t.number === Number(number));
}

function createMockBoard() {
  return {
    async listTickets(repo) {
      const list = TICKETS[repo] || [];
      return list
        .filter((t) => t.state === 'open')
        .map((t) => ({
          number: t.number,
          title: t.title,
          labels: t.labels,
          assignees: t.assignees,
          updatedAt: t.updatedAt,
          url: t.url,
        }));
    },

    async getTicket(repo, number) {
      const t = findTicket(repo, number);
      if (!t) throw new Error(`ticket ${number} not found in ${repo}`);
      return {
        number: t.number,
        title: t.title,
        body: t.body,
        labels: t.labels,
        state: t.state,
        url: t.url,
        comments: t.comments,
        assignees: t.assignees,
        spec: t.spec ?? null,
        plan: t.plan ?? null,
      };
    },

    async approve(repo, number, stage) {
      const t = findTicket(repo, number);
      if (!t) throw new Error(`ticket ${number} not found in ${repo}`);
      if (stage === 'Awaiting Review') {
        t.state = 'closed';
        return;
      }
      if (stage === 'Needs Human') {
        t.labels = t.labels.filter((l) => l.name !== 'ship:needs-human');
        t.labels.push({ name: 'ship:planned' });
        return;
      }
      throw new Error(`approve not available for stage ${stage}`);
    },

    async assign(repo, number, login) {
      const t = findTicket(repo, number);
      if (!t) throw new Error(`ticket ${number} not found in ${repo}`);
      t.assignees = [{ login }];
    },
  };
}

// Mimics board.js's repoFromPath()/execFile contract for the "add project"
// flow in mock mode: derives a fake GitHub remote from the directory name
// instead of shelling out to git.
async function mockExecFile(cmd, args) {
  if (cmd === 'git' && args[0] === '-C') {
    const dir = args[1];
    const base = require('node:path').basename(dir).replace(/[^a-zA-Z0-9-]+/g, '-') || 'project';
    return `git@github.com:mock/${base}.git\n`;
  }
  throw new Error(`mock exec not supported: ${cmd} ${args.join(' ')}`);
}

function getProjects() {
  return PROJECTS;
}

module.exports = { PROJECTS, TICKETS, createMockBoard, mockExecFile, getProjects };
