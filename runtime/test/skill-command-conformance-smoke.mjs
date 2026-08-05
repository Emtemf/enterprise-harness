// SKILL.md 里出现的每个 `workflow decide <...> <decision>` 都必须是 runtime 真实支持的决策。
//
// 回归背景：4 个 stage skill 都把 `freeze-slice` 当作通用推进命令，但它只在 design 阶段
// 存在；在 plan/tdd/verify 执行会直接 exit 1。全部 smoke 通过，因为没有任何测试把
// SKILL.md 的指令和 runtime 的决策集合对照过——文档与实现各自自洽，合起来是断的。
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const mode = process.argv[2];

if (!['red', 'green', 'verify'].includes(mode)) {
  console.error('Usage: node runtime/test/skill-command-conformance-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const workflowLib = fs.readFileSync(path.join(repoRoot, 'runtime', 'lib', 'workflow.mjs'), 'utf-8');

// 决策集合的真相源是 inferPendingDecision 里的 options 字面量，且必须按 stage 归属，
// 否则 "在 design 合法" 的决策会被误判为在 plan/tdd/verify 也合法——这正是原缺陷。
const knownDecisions = new Set();
const decisionsByStage = new Map();
const inferBody = workflowLib.slice(workflowLib.indexOf('export function inferPendingDecision'));
let currentStage = null;
for (const line of inferBody.split('\n')) {
  const stageMatch = line.match(/if\s*\(stage === '(\w+)'/u);
  if (stageMatch) currentStage = stageMatch[1];
  const optionsMatch = line.match(/options:\s*\[([^\]]+)\]/u);
  if (!optionsMatch) continue;
  for (const raw of optionsMatch[1].split(',')) {
    const value = raw.trim().replace(/^['"]|['"]$/gu, '');
    if (!value) continue;
    knownDecisions.add(value);
    if (currentStage) {
      if (!decisionsByStage.has(currentStage)) decisionsByStage.set(currentStage, new Set());
      decisionsByStage.get(currentStage).add(value);
    }
  }
}

// stage skill 的文件名后缀即它负责的阶段。
function stageForSkill(skillDirName) {
  const match = skillDirName.match(/^harness-(clarify|route|design|plan|tdd|verify)$/u);
  return match ? match[1] : null;
}

if (knownDecisions.size === 0) {
  console.error('Could not extract any decision options from runtime/lib/workflow.mjs');
  process.exit(1);
}

const skillsDir = path.join(repoRoot, '.claude', 'skills');
const failures = [];

for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const skillPath = path.join(skillsDir, entry.name, 'SKILL.md');
  if (!fs.existsSync(skillPath)) continue;
  const stage = stageForSkill(entry.name);
  const lines = fs.readFileSync(skillPath, 'utf-8').split('\n');
  lines.forEach((line, index) => {
    // 只看形如 `workflow decide <change-id> <decision>` 的具体命令；占位符形式跳过。
    const match = line.match(/workflow\s+decide\s+\S+\s+([a-z][a-z-]*)/u);
    if (!match) return;
    const decision = match[1];
    const where = `${path.relative(repoRoot, skillPath)}:${index + 1}`;
    if (!knownDecisions.has(decision)) {
      failures.push(`${where} 使用了 runtime 不支持的决策 "${decision}"`);
      return;
    }
    // stage skill 只能使用本阶段真实提供的决策；否则该命令一定 exit 1。
    if (stage && !decisionsByStage.get(stage)?.has(decision)) {
      const allowed = [...(decisionsByStage.get(stage) ?? [])].sort().join(', ') || '（该阶段无决策）';
      failures.push(`${where} 在 ${stage} 阶段使用了 "${decision}"，但该阶段只支持：${allowed}`);
    }
  });
}

// gate 名同样要真实存在，否则模型会去等一个永远不会出现的字段。
const stateFields = new Set(['clarifyReady', 'userConfirmedScope', 'routeReady', 'planReady', 'tddStatus', 'designApproved', 'redVerified']);
const harnessSkill = path.join(skillsDir, 'harness', 'SKILL.md');
if (fs.existsSync(harnessSkill)) {
  const text = fs.readFileSync(harnessSkill, 'utf-8');
  for (const match of text.matchAll(/`(\w+Verified|\w+Ready|designApproved)`/gu)) {
    const name = match[1];
    if (!stateFields.has(name)) {
      failures.push(`.claude/skills/harness/SKILL.md 引用了不存在的 gate "${name}"`);
    }
  }
}

if (failures.length) {
  for (const failure of failures) console.error(failure);
  console.error('skill command conformance failed');
  process.exit(1);
}

console.log(`Skill command conformance smoke passed (decisions: ${[...knownDecisions].sort().join(', ')}).`);
