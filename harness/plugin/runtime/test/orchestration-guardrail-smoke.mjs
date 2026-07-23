import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const mode = process.argv[2];

const files = {
  harnessSkill: path.join(repoRoot, '.claude', 'skills', 'harness', 'SKILL.md'),
  intakeSkill: path.join(repoRoot, '.claude', 'skills', 'harness-intake', 'SKILL.md'),
  claudeMd: path.join(repoRoot, 'CLAUDE.md'),
  stagedWorkflow: path.join(repoRoot, 'harness', 'specs', 'staged-workflow.md'),
  expectedBehavior: path.join(repoRoot, 'docs', 'zh-cn', 'expected-behavior-checklist.md'),
  lifecycleTruth: path.join(repoRoot, 'docs', 'zh-cn', 'full-lifecycle-truth.md'),
};

const expected = {
  harnessSkill: [
    '实现前 orchestration guardrail（硬约束）',
    '已进入 `/harness` 或显式 staged workflow 入口',
    '不得在未完成 clarify / route 前直接进入实现',
  ],
  intakeSkill: [
    '实现前 orchestration guardrail（硬约束）',
    '不得开始实现',
  ],
  claudeMd: [
    '实现前 orchestration guardrail（硬约束）',
    '不得开始写业务代码、设计落地代码、任务推进代码或任何实现动作',
  ],
  stagedWorkflow: ['不得在未完成 clarify / route 前直接进入实现'],
  expectedBehavior: [
    'Claude 直接开始写 Java 代码，没有先写 design → **不符合预期**',
    'Claude 直接开始写代码，没问过任何问题 → **不符合预期**',
  ],
  lifecycleTruth: [
    'Claude 直接开始写 Java 代码，没有任何探索和澄清 → **不符合预期**',
    'Claude 直接开始写 Java 代码，从未创建 `design.md` → **不符合预期**',
  ],
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
  console.error('Usage: node harness/plugin/runtime/test/orchestration-guardrail-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const ok = Object.entries(files).every(([key, file]) => expected[key].every((token) => readText(file).includes(token)));

if (mode === 'red') {
  if (!ok) {
    fail('Expected orchestration guardrails to be explicitly present and machine-checked');
  }
  pass('Red precondition no longer holds.');
}

if (!ok) {
  fail('Expected orchestration guardrails to be explicitly present and machine-checked');
}

pass(mode === 'green' ? 'Green orchestration-guardrail smoke passed.' : 'Orchestration-guardrail verify smoke passed.');
