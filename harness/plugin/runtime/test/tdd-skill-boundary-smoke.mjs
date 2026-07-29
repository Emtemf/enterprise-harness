import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const mode = process.argv[2];
const skillPath = path.join(repoRoot, '.claude', 'skills', 'harness-tdd', 'SKILL.md');
const specPath = path.join(repoRoot, 'harness', 'specs', 'tdd-execution.md');
const agentPath = path.join(repoRoot, '.claude', 'agents', 'tdd-executor.md');

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
  console.error('Usage: node harness/plugin/runtime/test/tdd-skill-boundary-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const skill = readText(skillPath);
const spec = readText(specPath);
const agent = readText(agentPath);
const ok = skill.includes('TDD 默认应下沉给专职 worker / subagent 执行 RED/GREEN/REFACTOR')
  && skill.includes('只负责派遣 executor、消费结果、推进子状态')
  && spec.includes('plugin 阶段入口')
  && spec.includes('plugin executor subtype')
  && spec.includes('主 orchestrator')
  && agent.includes('你不是总编排器；只负责单个 task 的 TDD 执行');

if (mode === 'red') {
  if (!ok) {
    fail('Expected harness-tdd skill, tdd spec, and tdd-executor agent to keep orchestration and execution boundaries clear');
  }
  pass('Red precondition no longer holds.');
}

if (!ok) {
  fail('Expected harness-tdd skill, tdd spec, and tdd-executor agent to keep orchestration and execution boundaries clear');
}

pass(mode === 'green' ? 'Green tdd skill boundary smoke passed.' : 'Tdd skill boundary verify smoke passed.');
