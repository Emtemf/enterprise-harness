import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const mode = process.argv[2];
const files = {
  stableExploration: path.join(repoRoot, 'harness', 'specs', 'exploration-packet.md'),
  stableAmbiguity: path.join(repoRoot, 'harness', 'specs', 'ambiguity-scoring.md'),
  shadowExploration: path.join(repoRoot, 'harness', 'changes', 'clarify-first-staged-orchestrator', 'specs', 'exploration-packet.md'),
  shadowAmbiguity: path.join(repoRoot, 'harness', 'changes', 'clarify-first-staged-orchestrator', 'specs', 'ambiguity-scoring.md'),
};
const expected = {
  stableExploration: ['`question`', '`scope`', '`facts`', '`uncertainties`', '`impact`', '`suggestedUserQuestion`', '`sources`'],
  stableAmbiguity: ['一次只问一个问题', 'weakest dimension', '所有关键维度 >= 4', '用户已显式确认执行范围'],
  shadowExploration: ['不再是长期权威来源', 'harness/specs/exploration-packet.md', '不要继续把本文件当成 source of truth'],
  shadowAmbiguity: ['不再是长期权威来源', 'harness/specs/ambiguity-scoring.md', '不要继续把本文件当成 source of truth'],
};

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
  console.error('Usage: node harness/plugin/runtime/test/exploration-stable-contract-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const ok = Object.entries(files).every(([key, file]) => expected[key].every((token) => readText(file).includes(token)));

if (mode === 'red') {
  if (!ok) {
    fail('Expected stable exploration/ambiguity contracts and non-authoritative shadow snapshots to be defined');
  }
  pass('Red precondition no longer holds.');
}

if (!ok) {
  fail('Expected stable exploration/ambiguity contracts and non-authoritative shadow snapshots to be defined');
}

pass(mode === 'green' ? 'Green exploration-stable-contract smoke passed.' : 'Exploration-stable-contract verify smoke passed.');
