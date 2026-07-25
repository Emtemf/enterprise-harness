import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const mode = process.argv[2];
const modelPath = path.join(repoRoot, 'harness', 'specs', 'double-check-model.md');
const reviewRulePath = path.join(repoRoot, '.claude', 'rules', '70-review.md');
const stopPath = path.join(repoRoot, 'harness', 'plugin', 'runtime', 'hooks', 'stop.mjs');

function readText(file) {
  return fs.readFileSync(file, 'utf-8');
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function pass(message) {
  console.log(message);
  process.exit(0);
}

if (!['red', 'green', 'verify'].includes(mode)) {
  console.error('Usage: node harness/plugin/runtime/test/double-check-model-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const model = readText(modelPath);
const reviewRule = readText(reviewRulePath);
const stopText = readText(stopPath);
const ok = model.includes('主执行 → 独立复核 → 统一消费 → 完成态门禁')
  && model.includes('design-reviewer')
  && model.includes('plan-critic')
  && model.includes('verification-reviewer')
  && (model.includes('pass / block / advisory') || model.includes('`pass` / `block` / `advisory`'))
  && reviewRule.includes('blocking reviewers')
  && (reviewRule.includes('mechanical consumption') || reviewRule.includes('机械消费基线'))
  && stopText.includes('validateCompletionReviewers');

if (mode === 'red') {
  if (!ok) {
    fail('Expected double-check model to align reviewers, verdict consumption, and stop gate enforcement');
  }
  pass('Red precondition no longer holds.');
}

if (!ok) {
  fail('Expected double-check model to align reviewers, verdict consumption, and stop gate enforcement');
}

pass(mode === 'green' ? 'Green double-check model smoke passed.' : 'Double-check model verify smoke passed.');
