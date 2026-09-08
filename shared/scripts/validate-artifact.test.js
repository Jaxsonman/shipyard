const test = require('node:test');
const assert = require('node:assert/strict');
const { validate, REQUIRED } = require('./validate-artifact.js');

const goodPlan = REQUIRED.plan.map(h => `## ${h}\n\nbody\n`).join('\n') + '\n### Task 1: Do the thing\n\n- [ ] Step 1\n';

test('a plan with every required section and a Task heading passes', () => {
  const r = validate('plan', goodPlan);
  assert.equal(r.ok, true, JSON.stringify(r.missing));
});

test('a plan with a renamed "### Task" heading fails (E-11)', () => {
  const bad = goodPlan.replace('### Task 1: Do the thing', '### Step 1: Do the thing');
  const r = validate('plan', bad);
  assert.equal(r.ok, false);
  assert.ok(r.missing.some(s => /Task N/i.test(s)));
});

test('a spec missing "Done means" fails and names it', () => {
  const spec = REQUIRED.spec.filter(h => !/done means/i.test(h)).map(h => `## ${h}\n\nbody\n`).join('\n');
  const r = validate('spec', spec);
  assert.equal(r.ok, false);
  assert.ok(r.missing.some(s => /done means/i.test(s)));
});

test('heading matching ignores case and trailing whitespace', () => {
  const r = validate('plan', goodPlan.replace(/^## Done means/mi, '##   DONE MEANS   '));
  assert.equal(r.ok, true, JSON.stringify(r.missing));
});

test('a missing file is reported, not thrown', () => {
  const r = validate('spec', '');
  assert.equal(r.ok, false);
  assert.ok(r.missing.length > 0);
});
