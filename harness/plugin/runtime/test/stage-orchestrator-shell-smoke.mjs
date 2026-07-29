import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const mode = process.argv[2];
const files = {
  intake: path.join(repoRoot, '.claude', 'skills', 'harness-intake', 'SKILL.md'),
  design: path.join(repoRoot, '.claude', 'skills', 'harness-design', 'SKILL.md'),
  plan: path.join(repoRoot, '.claude', 'skills', 'harness-plan', 'SKILL.md'),
  verify: path.join(repoRoot, '.claude', 'skills', 'harness-verify', 'SKILL.md'),
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
  console.error('Usage: node harness/plugin/runtime/test/stage-orchestrator-shell-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const intake = readText(files.intake);
const design = readText(files.design);
const plan = readText(files.plan);
const verifyText = readText(files.verify);
const ok = intake.includes('当前动作顺序（orchestrator shell 显示要求）')
  && intake.includes('生成 exploration brief，再派 `enterprise-harness:code-explore`')
  && intake.includes('生成文档调研 brief，再派 `enterprise-harness:doc-research`')
  && design.includes('生成 design exploration brief，再派 `enterprise-harness:code-explore` / `enterprise-harness:doc-research`')
  && design.includes('design.produce execute')
  && design.includes('role=check handoff')
  && plan.includes('plan.produce')
  && plan.includes('enterprise-harness:plan-critic')
  && verifyText.includes('enterprise-harness:verification-executor')
  && verifyText.includes('enterprise-harness:verification-reviewer')
  && verifyText.includes('只消费 `pass` / `block` / `advisory` 结论');

if (mode === 'red') {
  if (!ok) {
    fail('Expected stage skills to expose explicit orchestrator shell sequencing and subagent dispatch order');
  }
  pass('Red precondition no longer holds.');
}

if (!ok) {
  fail('Expected stage skills to expose explicit orchestrator shell sequencing and subagent dispatch order');
}

pass(mode === 'green' ? 'Green stage orchestrator shell smoke passed.' : 'Stage orchestrator shell verify smoke passed.');
