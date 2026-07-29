import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const mode = process.argv[2];
const agentPath = path.join(repoRoot, '.claude', 'agents', 'tdd-executor.md');
const specPath = path.join(repoRoot, 'harness', 'specs', 'tdd-execution.md');
const skillPath = path.join(repoRoot, '.claude', 'skills', 'harness-tdd', 'SKILL.md');

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
  console.error('Usage: node harness/plugin/runtime/test/tdd-executor-agent-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const agent = readText(agentPath);
const spec = readText(specPath);
const skill = readText(skillPath);
const ok = agent.includes('name: tdd-executor')
  && agent.includes('TDD 专职执行 worker')
  && agent.includes('Java / Maven 项目必须执行 `mvn test` / `mvn verify` / `mvn compile`')
  && agent.includes('receipt refs')
  && agent.includes('isolation: worktree')
  && spec.includes('tdd-executor')
  && skill.includes('enterprise-harness:tdd-executor');

if (mode === 'red') {
  if (!ok) {
    fail('Expected tdd-executor agent, spec, and skill to stay aligned');
  }
  pass('Red precondition no longer holds.');
}

if (!ok) {
  fail('Expected tdd-executor agent, spec, and skill to stay aligned');
}

pass(mode === 'green' ? 'Green tdd-executor agent smoke passed.' : 'Tdd-executor agent verify smoke passed.');
