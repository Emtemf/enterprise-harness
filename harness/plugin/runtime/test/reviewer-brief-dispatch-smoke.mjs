import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const mode = process.argv[2];
const planCriticPath = path.join(repoRoot, '.claude', 'agents', 'plan-critic.md');
const verificationReviewerPath = path.join(repoRoot, '.claude', 'agents', 'verification-reviewer.md');
const briefSpecPath = path.join(repoRoot, 'harness', 'specs', 'brief-contract.md');

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
  console.error('Usage: node harness/plugin/runtime/test/reviewer-brief-dispatch-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const planCritic = readText(planCriticPath);
const verificationReviewer = readText(verificationReviewerPath);
const briefSpec = readText(briefSpecPath);
const ok = briefSpec.includes('Task Brief')
  && briefSpec.includes('Verification Brief')
  && planCritic.includes('你通常会收到一个 task brief')
  && planCritic.includes('缺少最小 brief')
  && verificationReviewer.includes('你通常会收到一个 verification brief')
  && verificationReviewer.includes('缺少最小 brief');

if (mode === 'red') {
  if (!ok) {
    fail('Expected reviewer/critic agents to adopt brief-driven dispatch semantics');
  }
  pass('Red precondition no longer holds.');
}

if (!ok) {
  fail('Expected reviewer/critic agents to adopt brief-driven dispatch semantics');
}

pass(mode === 'green' ? 'Green reviewer brief dispatch smoke passed.' : 'Reviewer brief dispatch verify smoke passed.');
