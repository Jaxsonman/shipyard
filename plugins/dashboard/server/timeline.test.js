'use strict';
const test = require('node:test');
const assert = require('node:assert');
const timeline = require('./timeline');

const NOW = Date.parse('2026-08-12T00:00:00Z');
const M = (o) => `<!-- shipyard-metrics ${JSON.stringify(o)} -->`;
const mk = (body, createdAt) => ({ body, createdAt });

const devTicket = {
  number: 81, title: 'CSV export', url: 'u', updatedAt: '2026-08-11T13:00:00Z',
  labels: [{ name: 'ship:in-dev' }],
  comments: [
    mk('📋 Spec approved\n' + M({ stage: 'spec', started: '2026-08-09T09:00:00Z', finished: '2026-08-09T10:00:00Z', tokens_in: 100, tokens_out: 10 }), '2026-08-09T10:00:00Z'),
    mk('ship:dev round 1/3\n' + M({ stage: 'dev', started: '2026-08-11T12:00:00Z', finished: '2026-08-11T13:00:00Z', tokens_in: 900, tokens_out: 90 }), '2026-08-11T13:00:00Z'),
  ],
};

test('buildRow marks the label stage current and earlier stages past', () => {
  const row = timeline.buildRow(devTicket, { projectId: 'core', projectName: 'Core', now: NOW });
  assert.equal(row.id, 'core#81');
  assert.equal(row.stage, 'Dev');
  assert.equal(row.running, true);
  assert.deepEqual(row.segments.map((s) => [s.stage, s.state]), [['Spec', 'past'], ['Dev', 'current']]);
  assert.equal(row.tokensIn, 1000);
  assert.equal(row.tokensOut, 100);
  assert.equal(row.lastActivity, Date.parse('2026-08-11T13:00:00Z'));
});

test('buildRow preformats duration and token labels per segment', () => {
  const row = timeline.buildRow(devTicket, { projectId: 'core', projectName: 'Core', now: NOW });
  assert.equal(row.segments[0].durationLabel, '1h 0m');
  assert.equal(row.segments[0].tokensLabel, '100/10');
});

test('buildRow leaves an estimated segment without a duration or token label', () => {
  const row = timeline.buildRow({
    number: 9, title: 'old', url: 'u', updatedAt: '2026-08-10T10:00:00Z',
    labels: [{ name: 'ship:planned' }],
    comments: [mk('📋 Spec approved', '2026-08-09T09:00:00Z'), mk('🗺️ Plan approved', '2026-08-10T10:00:00Z')],
  }, { projectId: 'core', projectName: 'Core', now: NOW });
  assert.ok(row.segments.every((s) => s.estimated === true));
  assert.equal(row.segments[0].durationLabel, null);
  assert.equal(row.segments[0].tokensLabel, null);
  assert.deepEqual(row.segments.map((s) => s.state), ['past', 'current']);
});

test('buildRow surfaces the newest escalation cause for a Needs Human ticket', () => {
  const row = timeline.buildRow({
    number: 88, title: 'stuck', url: 'u', updatedAt: '2026-08-11T13:00:00Z',
    labels: [{ name: 'ship:needs-human' }],
    comments: [
      mk('ship:escalation static round 1/3', '2026-08-10T10:00:00Z'),
      mk('ship:escalation cap round 3/3', '2026-08-11T13:00:00Z'),
    ],
  }, { projectId: 'core', projectName: 'Core', now: NOW });
  assert.equal(row.stage, 'Needs Human');
  assert.deepEqual(row.escalation, { cause: 'cap', round: 3, cap: 3 });
});

test('buildRow does not surface an escalation on a ticket that recovered', () => {
  const row = timeline.buildRow({
    number: 89, title: 'recovered', url: 'u', updatedAt: '2026-08-11T13:00:00Z',
    labels: [{ name: 'ship:planned' }],
    comments: [mk('ship:escalation cap round 3/3', '2026-08-10T10:00:00Z')],
  }, { projectId: 'core', projectName: 'Core', now: NOW });
  assert.equal(row.escalation, null);
});

test('buildRow flags a Backlog ticket and gives it no current segment', () => {
  const row = timeline.buildRow({ number: 1, title: 'idea', url: 'u', updatedAt: '2026-08-01T00:00:00Z', labels: [], comments: [] },
    { projectId: 'core', projectName: 'Core', now: NOW });
  assert.equal(row.backlog, true);
  assert.deepEqual(row.segments, []);
  assert.equal(row.lastActivity, Date.parse('2026-08-01T00:00:00Z'));
});

test('buildBoardTimeline groups by project and sorts by last activity descending', () => {
  const out = timeline.buildBoardTimeline({
    now: NOW,
    projects: [{ id: 'core', name: 'Core' }, { id: 'reef', name: 'Reef' }],
    tickets: [
      { project: 'reef', ...devTicket, number: 5 },
      { project: 'core', ...devTicket, number: 6, updatedAt: '2026-08-01T00:00:00Z', comments: [] },
      { project: 'core', ...devTicket, number: 7 },
    ],
  });
  assert.deepEqual(out.rows.map((r) => r.id), ['core#7', 'core#6', 'reef#5']);
  assert.deepEqual(out.groups, [{ projectId: 'core', projectName: 'Core', count: 2 }, { projectId: 'reef', projectName: 'Reef', count: 1 }]);
});

test('buildBoardTimeline domain spans the earliest segment to now', () => {
  const out = timeline.buildBoardTimeline({ now: NOW, projects: [{ id: 'core', name: 'Core' }], tickets: [{ project: 'core', ...devTicket }] });
  assert.equal(out.domain.start, Date.parse('2026-08-09T09:00:00Z'));
  assert.equal(out.domain.end, NOW);
});

test('buildBoardTimeline with no segmented tickets still returns a non-zero domain', () => {
  const out = timeline.buildBoardTimeline({ now: NOW, projects: [{ id: 'core', name: 'Core' }], tickets: [{ project: 'core', number: 1, title: 't', url: 'u', updatedAt: '2026-08-11T00:00:00Z', labels: [], comments: [] }] });
  assert.ok(out.domain.end > out.domain.start);
});

test('buildBoardTimeline keeps tickets from an unlisted project, grouped last', () => {
  const out = timeline.buildBoardTimeline({
    now: NOW,
    projects: [{ id: 'core', name: 'Core' }],
    tickets: [{ project: 'ghost', ...devTicket, number: 3 }, { project: 'core', ...devTicket, number: 4 }],
  });
  assert.deepEqual(out.groups.map((g) => g.projectId), ['core', 'ghost']);
  assert.deepEqual(out.rows.map((r) => r.id), ['core#4', 'ghost#3']);
});
