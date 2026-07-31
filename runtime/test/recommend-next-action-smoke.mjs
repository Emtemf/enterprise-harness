import assert from 'node:assert/strict';
import { recommendNextAction } from '../lib/workflow.mjs';

const mode = process.argv[2];

if (!['red', 'green', 'verify'].includes(mode)) {
  console.error('Usage: node runtime/test/recommend-next-action-smoke.mjs <red|green|verify>');
  process.exit(1);
}

try {
  assert.equal(
    recommendNextAction('c1', { workflow: { stage: 'plan', nextEntry: '/harness-plan' } }, 'plan', 'plan 已就绪，下一步应进入 tdd。'),
    '/harness-plan',
  );
  assert.equal(
    recommendNextAction('c2', { workflow: { stage: 'design', nextEntry: '/harness-design' } }, 'design', 'execution deepening 第一批切片待冻结。'),
    'workflow decide c2 freeze-slice',
  );
  assert.equal(
    recommendNextAction('c3', { workflow: { stage: 'clarify', nextEntry: '/harness-intake' } }, 'clarify', 'clarify 尚未达标。', {
      defaultDecision: 'answer-next-question',
      options: ['answer-next-question', 'narrow-scope'],
    }),
    'workflow decide c3 answer-next-question',
  );
} catch (error) {
  if (mode === 'red') {
    console.log('Red precondition observed: recommendNextAction primitive is currently broken.');
    process.exit(0);
  }
  console.error(`Expected recommendNextAction to centralize next-action derivation: ${error.message}`);
  process.exit(1);
}

if (mode === 'red') {
  console.error('Red precondition no longer holds.');
  process.exit(1);
}

console.log(mode === 'green' ? 'Green recommend-next-action smoke passed.' : 'Recommend-next-action verify smoke passed.');
