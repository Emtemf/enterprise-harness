import assert from 'node:assert/strict';
import { validatePlanTestCaseBindings } from '../lib/plan-test-case-binding.mjs';

const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

function cases(rows) {
  return [
    '## 测试用例',
    '| TCID | Traces | Level | Priority | Preconditions | Data | Actions | Observable assertions | Cleanup/Recovery | Status |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows,
  ].join('\n');
}

function task(id, strategy, testCases, red = null) {
  return [
    `## Task 1: ${id}`,
    '### Frozen inputs',
    `- Test cases: ${testCases.join(', ')}`,
    '### Execution strategy',
    `- Strategy: \`${strategy}\``,
    `- Minimal RED case: ${red || 'N/A — not tdd'}`,
  ].join('\n');
}

const testCases = cases([
  '| TC1 | R1 / D1 / VO1 | unit | normal | ready | data | act | observable | cleanup | accepted |',
  '| TC2 | R2 / D2 / VO2 | migration | critical | old schema | sql | apply | forward and rollback | restore | accepted |',
]);

assert.match(
  validatePlanTestCaseBindings('# no table\n', task('unit', 'direct', ['TC1'])).problems.join('; '),
  /no TCID table|unknown accepted test case TC1/u,
  'missing TC table must return findings instead of throwing',
);

const missing = validatePlanTestCaseBindings(testCases, task('only-unit', 'tdd', ['TC1'], 'TC1'));
assert.match(missing.problems.join('; '), /accepted test case TC2 is not mapped/u);

const disguised = validatePlanTestCaseBindings(testCases, [
  task('unit-and-sql', 'direct', ['TC1', 'TC2']),
].join('\n'));
assert.match(disguised.problems.join('; '), /migration test case TC2 must be mapped by a migration task/u);

const valid = validatePlanTestCaseBindings(testCases, [
  task('unit', 'tdd', ['TC1'], 'TC1'),
  task('migration', 'migration', ['TC2']),
].join('\n').replace('## Task 1: migration', '## Task 2: migration'));
assert.deepEqual(valid.problems, []);

console.log(`PASS plan-test-case-binding ${mode}`);
