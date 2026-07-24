import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const mode = process.argv[2];
const harnessPath = path.join(repoRoot, '.claude', 'skills', 'harness', 'SKILL.md');
const intakePath = path.join(repoRoot, '.claude', 'skills', 'harness-intake', 'SKILL.md');
const ambiguityPath = path.join(repoRoot, 'harness', 'specs', 'ambiguity-scoring.md');

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
  console.error('Usage: node harness/plugin/runtime/test/clarify-choice-contract-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const harnessText = readText(harnessPath);
const intakeText = readText(intakePath);
const ambiguityText = readText(ambiguityPath);

const ok = harnessText.includes('选项式 A/B/C + 其他')
  && harnessText.includes('跳过 clarify 直接进 design/plan')
  && intakeText.includes('选项式问题')
  && intakeText.includes('跳过 clarify 直接进入 design/plan')
  && ambiguityText.includes('选项式 A/B/C + 其他');

if (mode === 'red') {
  if (!ok) {
    fail('Expected clarify contract to require option-first questioning and forbid skipping clarify');
  }
  pass('Red precondition no longer holds.');
}

if (!ok) {
  fail('Expected clarify contract to require option-first questioning and forbid skipping clarify');
}

pass(mode === 'green' ? 'Green clarify-choice contract smoke passed.' : 'Clarify-choice contract verify smoke passed.');
