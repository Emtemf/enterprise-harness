import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const mode = process.argv[2];
const verifyPath = path.join(repoRoot, 'harness', 'specs', 'verify-contract.md');
const modelPath = path.join(repoRoot, 'harness', 'specs', 'double-check-model.md');

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
  console.error('Usage: node harness/plugin/runtime/test/verify-verdict-consumption-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const verifyText = readText(verifyPath);
const modelText = readText(modelPath);
const ok = verifyText.includes('`completion-verdict`：`pass` / `block` / `advisory`')
  && verifyText.includes('`blockers`')
  && verifyText.includes('`consumed-evidence-summary`')
  && verifyText.includes('`next-step`')
  && verifyText.includes('`completion-verdict=pass`')
  && verifyText.includes('`completion-verdict=advisory`')
  && verifyText.includes('`completion-verdict=block`')
  && modelText.includes('verify 输出中的 `completion-verdict` 应为 `pass`')
  && modelText.includes('verify 输出中的 `completion-verdict` 应为 `advisory`')
  && modelText.includes('verify 输出中的 `completion-verdict` 应为 `block`');

if (mode === 'red') {
  if (!ok) {
    fail('Expected verify verdict consumption contract to define pass/advisory/block semantics and next-step mapping');
  }
  pass('Red precondition no longer holds.');
}

if (!ok) {
  fail('Expected verify verdict consumption contract to define pass/advisory/block semantics and next-step mapping');
}

pass(mode === 'green' ? 'Green verify verdict consumption smoke passed.' : 'Verify verdict consumption smoke passed.');
