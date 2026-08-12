import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const mode = process.argv[2];
const agentPath = path.join(repoRoot, 'agents', 'tdd-executor.md');
const specPath = path.join(repoRoot, 'harness', 'specs', 'tdd-execution.md');

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
  console.error('Usage: node runtime/test/tdd-executor-output-contract-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const agent = readText(agentPath);
const spec = readText(specPath);
const requiredInput = ['change-id', 'task-id', 'touched-files', 'test-first-order', 'red-evidence-point', 'green-evidence-point', 'project-native-build-command', 'scope'];
const requiredOutput = ['task-id', 'agent-id', 'worktree', 'receipt refs', 'implementation commit', 'changed paths', 'blockers'];
const ok = requiredInput.every((token) => agent.includes(`\`${token}\``))
  && requiredOutput.every((token) => agent.includes(token) || spec.includes(token))
  && spec.includes('worker 文本')
  && agent.includes('必须返回 blocker')
  && spec.includes('不接受 worker 自报');

if (mode === 'red') {
  if (!ok) {
    fail('Expected tdd-executor input/output contract to be explicit and aligned between agent and spec');
  }
  pass('Red precondition no longer holds.');
}

if (!ok) {
  fail('Expected tdd-executor input/output contract to be explicit and aligned between agent and spec');
}

pass(mode === 'green' ? 'Green tdd-executor output contract smoke passed.' : 'Tdd-executor output contract verify smoke passed.');
