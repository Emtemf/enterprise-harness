import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const mode = process.argv[2];
const files = {
  requirements: path.join(repoRoot, 'skills', 'harness', 'assets', 'requirements.md.tmpl'),
  design: path.join(repoRoot, 'skills', 'design', 'assets', 'design.md.tmpl'),
  tasks: path.join(repoRoot, 'skills', 'plan', 'assets', 'tasks.md.tmpl'),
  validation: path.join(repoRoot, 'skills', 'verify', 'assets', 'validation.md.tmpl'),
};
const expected = {
  requirements: ['## 目标与验收', '## 组件拓扑', '## Frontier', '## 事实、约束与条件分支', '## Classification'],
  design: [
    '## 目标与验收',
    '## 事实与约束',
    '## 方案与权衡',
    '## Requirement Trace',
    '## 架构边界',
    '## 交互与失败路径',
    '## API 设计',
    '## 数据与 SQL 设计',
    '## 安全、并发与可观测性',
    '## 测试设计',
    '## 风险、兼容与回滚',
    '## Design Self-Check',
  ],
  tasks: ['### Target and scope', '### Frozen inputs', '### Execution strategy', '### Commands and verification', '### Independent review'],
  validation: ['## Commands', '## Results', '## Freshness', '## Coverage and exceptions'],
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
  console.error('Usage: node runtime/test/staged-template-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const ok = Object.entries(files).every(([key, file]) => expected[key].every((token) => readText(file).includes(token)));

if (mode === 'red') {
  if (!ok) {
    fail('Expected staged workflow templates to include requirements/design/plan/validation mandatory sections');
  }
  pass('Red precondition no longer holds.');
}

if (!ok) {
  fail('Expected staged workflow templates to include requirements/design/plan/validation mandatory sections');
}

pass(mode === 'green' ? 'Green staged-template smoke passed.' : 'Staged-template verify smoke passed.');
