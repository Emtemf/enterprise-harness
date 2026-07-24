import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const mode = process.argv[2];
const files = {
  stagedWorkflow: path.join(repoRoot, 'harness', 'specs', 'staged-workflow.md'),
  contextPacket: path.join(repoRoot, 'harness', 'specs', 'context-packet.md'),
  stableExploration: path.join(repoRoot, 'harness', 'specs', 'exploration-packet.md'),
  stableAmbiguity: path.join(repoRoot, 'harness', 'specs', 'ambiguity-scoring.md'),
};
const expected = {
  stagedWorkflow: ['`code-explore`', '`doc-research`', 'Context Packet'],
  contextPacket: ['businessGoal', 'scope', 'nonGoals', 'constraints', 'acceptanceCriteria', 'domainGlossary'],
  stableExploration: ['`question`', '`scope`', '`facts`', '`uncertainties`', '`impact`', '`suggestedUserQuestion`', '`sources`'],
  stableAmbiguity: ['一次只问一个问题', 'weakest dimension', '所有关键维度 >= 4', '用户已显式确认执行范围'],
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
  console.error('Usage: node harness/plugin/runtime/test/exploration-contract-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const ok = Object.entries(files).every(([key, file]) => expected[key].every((token) => readText(file).includes(token)));

if (mode === 'red') {
  if (!ok) {
    fail('Expected clarify-first contract to define ambiguity scoring and exploration/context packet boundaries');
  }
  pass('Red precondition no longer holds.');
}

if (!ok) {
  fail('Expected clarify-first contract to define ambiguity scoring and exploration/context packet boundaries');
}

pass(mode === 'green' ? 'Green exploration-contract smoke passed.' : 'Exploration-contract verify smoke passed.');
