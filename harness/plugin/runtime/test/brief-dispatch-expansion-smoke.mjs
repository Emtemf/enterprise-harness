import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const mode = process.argv[2];
const docResearchPath = path.join(repoRoot, '.claude', 'agents', 'doc-research.md');
const tddExecutorPath = path.join(repoRoot, '.claude', 'agents', 'tdd-executor.md');
const specPath = path.join(repoRoot, 'harness', 'specs', 'brief-contract.md');

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
  console.error('Usage: node harness/plugin/runtime/test/brief-dispatch-expansion-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const docResearch = readText(docResearchPath);
const tddExecutor = readText(tddExecutorPath);
const spec = readText(specPath);
const ok = spec.includes('Exploration Brief')
  && spec.includes('Task Brief')
  && docResearch.includes('你通常会收到一个 exploration brief')
  && tddExecutor.includes('你通常会收到一个 task brief')
  && docResearch.includes('缺少最小 brief')
  && tddExecutor.includes('缺少最小 brief');

if (mode === 'red') {
  if (!ok) {
    fail('Expected brief-driven dispatch to extend from code-explore into doc-research and tdd-executor');
  }
  pass('Red precondition no longer holds.');
}

if (!ok) {
  fail('Expected brief-driven dispatch to extend from code-explore into doc-research and tdd-executor');
}

pass(mode === 'green' ? 'Green brief dispatch expansion smoke passed.' : 'Brief dispatch expansion verify smoke passed.');
