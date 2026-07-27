import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const mode = process.argv[2];
const designPath = path.join(repoRoot, '.claude', 'skills', 'harness-design', 'SKILL.md');
const planPath = path.join(repoRoot, '.claude', 'skills', 'harness-plan', 'SKILL.md');
const verifyPath = path.join(repoRoot, '.claude', 'skills', 'harness-verify', 'SKILL.md');

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
  console.error('Usage: node harness/plugin/runtime/test/brief-driven-stage-expansion-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const design = readText(designPath);
const plan = readText(planPath);
const verifyText = readText(verifyPath);
const ok = design.includes('先按 `harness/specs/brief-contract.md` 生成 design exploration brief')
  && plan.includes('先按 `harness/specs/brief-contract.md` 生成 task brief')
  && verifyText.includes('先按 `harness/specs/brief-contract.md` 生成 verification brief');

if (mode === 'red') {
  if (!ok) {
    fail('Expected design/plan/verify stage skills to extend brief-driven dispatch beyond intake and tdd');
  }
  pass('Red precondition no longer holds.');
}

if (!ok) {
  fail('Expected design/plan/verify stage skills to extend brief-driven dispatch beyond intake and tdd');
}

pass(mode === 'green' ? 'Green brief-driven stage expansion smoke passed.' : 'Brief-driven stage expansion verify smoke passed.');
