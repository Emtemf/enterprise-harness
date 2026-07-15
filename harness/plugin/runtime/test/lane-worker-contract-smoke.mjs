import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const mode = process.argv[2];
const files = {
  codeExplore: path.join(repoRoot, '.claude', 'agents', 'code-explore.md'),
  docResearch: path.join(repoRoot, '.claude', 'agents', 'doc-research.md'),
  impactExplore: path.join(repoRoot, '.claude', 'agents', 'impact-explore.md'),
  workflowHelper: path.join(repoRoot, 'harness', 'plugin', 'runtime', 'lib', 'workflow.mjs'),
  harnessSkill: path.join(repoRoot, '.claude', 'skills', 'harness', 'SKILL.md'),
};
const expected = {
  codeExplore: ['只读代码探索 worker', '`question`', '`scope`', '`facts`', '`suggestedUserQuestion`'],
  docResearch: ['只读文档调研 worker', '`question`', '`scope`', '`facts`', '`suggestedUserQuestion`'],
  impactExplore: ['只读影响面探索 worker', '`question`', '`scope`', '`facts`', '`suggestedUserQuestion`'],
  workflowHelper: ['export function recommendExplorationLane', "return 'code-explore'", "return 'doc-research'", "return 'impact-explore'"],
  harnessSkill: ['code-explore', 'doc-research', 'impact-explore', '优先补事实再问用户'],
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
  console.error('Usage: node harness/plugin/runtime/test/lane-worker-contract-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const ok = Object.entries(files).every(([key, file]) => expected[key].every((token) => readText(file).includes(token)));

if (mode === 'red') {
  if (!ok) {
    fail('Expected exploration lane worker contracts and lane routing logic to stay aligned');
  }
  pass('Red precondition no longer holds.');
}

if (!ok) {
  fail('Expected exploration lane worker contracts and lane routing logic to stay aligned');
}

pass(mode === 'green' ? 'Green lane-worker-contract smoke passed.' : 'Lane-worker-contract verify smoke passed.');
