// TECPC 结果校验必须拒绝空值，且 behavior registry 必须与 SKILL.md 的派发一致。
//
// 回归背景：
// 1. validateHandoffResult 只做 presence 检查，`evidence: []` 合法通过——
//    TECPC 的"消费了什么真实证据"因此毫无约束力。
// 2. harness-verify 派发 `api-consistency-reviewer`，但该 agent 在 registry 里只绑定
//    design.check-api，handoff create 必然 BLOCK；同时 design.check-api 无人派发。
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { validateHandoffResult } from '../lib/handoff.mjs';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) {
  console.error('Usage: node runtime/test/tecpc-and-registry-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const failures = [];

const input = {
  handoffVersion: 1,
  runId: 'run_x',
  changeId: 'c1',
  stage: 'design',
  behavior: 'design.produce',
  role: 'execute',
  agent: { type: 'enterprise-harness:design-executor', skill: 'harness' },
};
const withTecpc = (tecpc) => ({
  ...input,
  tecpc,
  outputRefs: ['harness/changes/c1/design.md'],
  blockers: [],
  summary: 'did it',
});

const tecpcCases = [
  ['空数组 evidence/context 必须被拒', withTecpc({ target: 't', evidence: [], context: [], path: 'p', correction: 'c' }), 'reject'],
  ['空白字符串字段必须被拒', withTecpc({ target: '   ', evidence: ['e'], context: ['x'], path: 'p', correction: 'c' }), 'reject'],
  ['数组含空项必须被拒', withTecpc({ target: 't', evidence: ['', ' '], context: ['x'], path: 'p', correction: 'c' }), 'reject'],
  ['完整 TECPC 必须通过', withTecpc({ target: 't', evidence: ['ran ./mvnw test'], context: ['design.md'], path: 'p', correction: 'c' }), 'accept'],
];

for (const [name, result, expected] of tecpcCases) {
  const problems = validateHandoffResult(result, input, 'enterprise-harness:design-executor');
  const actual = problems.length ? 'reject' : 'accept';
  if (actual !== expected) {
    failures.push(`${name}: expected ${expected}, got ${actual} (${problems.join('; ') || 'no problems'})`);
  }
}

// registry 与 skill 派发的一致性：SKILL.md 里提到的每个 reviewer/executor agent，
// 都必须在该阶段的 registry behavior 中真实可用，否则 handoff create 必然失败。
const registry = JSON.parse(fs.readFileSync(path.join(repoRoot, 'runtime', 'test', 'fixtures', 'behavior-checks.json'), 'utf-8'));
const agentsByStage = new Map();
for (const contract of Object.values(registry.behaviors || {})) {
  if (!agentsByStage.has(contract.stage)) agentsByStage.set(contract.stage, new Set());
  agentsByStage.get(contract.stage).add(contract.executor);
  agentsByStage.get(contract.stage).add(contract.checker);
}

const skillsDir = path.join(repoRoot, 'skills');
for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const stage = entry.name.match(/^harness-(clarify|route|design|plan|tdd|verify)$/u)?.[1];
  if (!stage) continue;
  const skillPath = path.join(skillsDir, entry.name, 'SKILL.md');
  if (!fs.existsSync(skillPath)) continue;
  const lines = fs.readFileSync(skillPath, 'utf-8').split('\n');
  const allowed = agentsByStage.get(stage) ?? new Set();
  lines.forEach((line, index) => {
    // 只看“派 `agent-name`”这种明确派发语句。
    for (const match of line.matchAll(/派\s*`(?:enterprise-harness:)?([a-z][a-z-]+)`/gu)) {
      const agent = `enterprise-harness:${match[1]}`;
      if (!allowed.has(agent)) {
        failures.push(`${path.relative(repoRoot, skillPath)}:${index + 1} 在 ${stage} 阶段派发 ${agent}，但 registry 未在该阶段绑定它`);
      }
    }
  });
}

// registry 里声明的每个 behavior 都应有对应 stage skill 会去派发，否则是死条目。
for (const [behavior, contract] of Object.entries(registry.behaviors || {})) {
  const skillPath = path.join(skillsDir, `harness-${contract.stage}`, 'SKILL.md');
  if (!fs.existsSync(skillPath)) continue;
  const text = fs.readFileSync(skillPath, 'utf-8');
  const checkerName = contract.checker.replace('enterprise-harness:', '');
  const executorName = contract.executor.replace('enterprise-harness:', '');
  if (!text.includes(checkerName) && !text.includes(executorName) && !text.includes(behavior)) {
    failures.push(`registry behavior ${behavior} 没有任何 stage skill 会派发（${contract.stage} skill 未提及）`);
  }
}

if (failures.length) {
  for (const failure of failures) console.error(failure);
  console.error('tecpc and registry smoke failed');
  process.exit(1);
}

console.log('TECPC strictness and behavior-registry consistency smoke passed.');
