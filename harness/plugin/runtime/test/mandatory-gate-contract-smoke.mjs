import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const mode = process.argv[2];
const harnessPath = path.join(repoRoot, '.claude', 'skills', 'harness', 'SKILL.md');
const designPath = path.join(repoRoot, '.claude', 'skills', 'harness-design', 'SKILL.md');
const planPath = path.join(repoRoot, '.claude', 'skills', 'harness-plan', 'SKILL.md');

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
  console.error('Usage: node harness/plugin/runtime/test/mandatory-gate-contract-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const harnessText = readText(harnessPath);
const designText = readText(designPath);
const planText = readText(planPath);
const ok = harnessText.includes('reviewer 返回 block，不得进入下一阶段')
  && designText.includes('不得提供“继续 / 跳过 review 直接进入 plan”的逃逸路径')
  && planText.includes('不允许通过“继续”绕过 reviewer/gate')
  && planText.includes('不得直接进入 TDD');

if (mode === 'red') {
  if (!ok) {
    fail('Expected mandatory gate contract to forbid skip/continue escape paths');
  }
  pass('Red precondition no longer holds.');
}

if (!ok) {
  fail('Expected mandatory gate contract to forbid skip/continue escape paths');
}

pass(mode === 'green' ? 'Green mandatory gate contract smoke passed.' : 'Mandatory gate contract verify smoke passed.');
