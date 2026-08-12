import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const mode = process.argv[2];
const specPath = path.join(repoRoot, 'harness', 'specs', 'verify-contract.md');
const skillPath = path.join(repoRoot, 'skills', 'harness-verify', 'SKILL.md');
const reviewerPath = path.join(repoRoot, 'agents', 'verification-reviewer.md');
const stopPath = path.join(repoRoot, 'runtime', 'lib', 'hooks', 'stop.mjs');

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
  console.error('Usage: node runtime/test/verify-contract-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const spec = readText(specPath);
const skill = readText(skillPath);
const reviewer = readText(reviewerPath);
const stopText = readText(stopPath);
const ok = spec.includes('Verify Contract')
  && spec.includes('verification-reviewer')
  && spec.includes('validation.status=fresh')
  && spec.includes('reviewer verdict 已落盘')
  && skill.includes('verification-reviewer')
  && reviewer.includes('完成声明是否被新鲜验证证据支持')
  && stopText.includes('validateCompletionPredicate');

if (mode === 'red') {
  if (!ok) {
    fail('Expected verify contract, verify skill, reviewer, and stop gate to stay aligned');
  }
  pass('Red precondition no longer holds.');
}

if (!ok) {
  fail('Expected verify contract, verify skill, reviewer, and stop gate to stay aligned');
}

pass(mode === 'green' ? 'Green verify contract smoke passed.' : 'Verify contract smoke passed.');
