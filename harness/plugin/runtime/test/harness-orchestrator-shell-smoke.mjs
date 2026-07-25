import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const mode = process.argv[2];
const harnessSkillPath = path.join(repoRoot, '.claude', 'skills', 'harness', 'SKILL.md');

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
  console.error('Usage: node harness/plugin/runtime/test/harness-orchestrator-shell-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const text = readText(harnessSkillPath);
const ok = text.includes('当前动作顺序')
  && text.includes('clarify：先补 repo/documentation facts')
  && text.includes('design：先消费 requirements / exploration')
  && text.includes('plan：先消费 design')
  && text.includes('tdd：先派 `tdd-executor`')
  && text.includes('verify：先消费 `validation.md` / reviewer verdict')
  && text.includes('会派哪个 agent')
  && text.includes('返回后主对话会消费什么结论');

if (mode === 'red') {
  if (!ok) {
    fail('Expected /harness to explicitly describe orchestrator sequencing and subagent dispatch order');
  }
  pass('Red precondition no longer holds.');
}

if (!ok) {
  fail('Expected /harness to explicitly describe orchestrator sequencing and subagent dispatch order');
}

pass(mode === 'green' ? 'Green harness orchestrator shell smoke passed.' : 'Harness orchestrator shell verify smoke passed.');
