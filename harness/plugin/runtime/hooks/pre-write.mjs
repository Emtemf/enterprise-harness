import fs from 'node:fs';
import path from 'node:path';
import { projectRoot } from '../lib/checks.mjs';
import { hasCurrentTaskRedVerification, loadActiveChange, isGovernedTarget, requiredGateForTarget } from '../lib/gates.mjs';
import { inferWorkflowStage } from '../lib/workflow.mjs';
import { renderG4CCard } from '../lib/g4c-card.mjs';

const root = projectRoot();

function blockWithCard(message) {
  console.error(message);
  try {
    const active = loadActiveChange(root);
    if (active.ok) {
      const card = renderG4CCard(root, active.changeId, active.data);
      console.error(card);
    }
  } catch {}
  process.exit(2);
}

function blockGoverned(message, activeData) {
  console.error(message);
  try {
    if (activeData) {
      const card = renderG4CCard(root, activeData.changeId, activeData);
      console.error(card);
    }
  } catch {}
  process.exit(2);
}

const payload = process.stdin.read ? process.stdin.read() : '';
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const raw = (payload || Buffer.concat(chunks).toString('utf-8')).trim();
if (!raw) process.exit(0);
let event;
try { event = JSON.parse(raw); } catch { process.exit(0); }
const toolInput = event.tool_input || {};
const filePath = toolInput.file_path || toolInput.path;
if (!filePath) process.exit(0);
const target = path.resolve(filePath);
const legacyRulesRoot = path.resolve(path.join(root, 'rules'));
const legacyAgentsRoot = path.resolve(path.join(root, 'agents'));
const pluginAgentSurface = new Set([
  path.resolve(path.join(root, 'agents', 'api-consistency-reviewer.md')),
  path.resolve(path.join(root, 'agents', 'design-reviewer.md')),
  path.resolve(path.join(root, 'agents', 'plan-critic.md')),
  path.resolve(path.join(root, 'agents', 'requirement-reviewer.md')),
  path.resolve(path.join(root, 'agents', 'verification-reviewer.md')),
  path.resolve(path.join(root, 'agents', 'code-explore.md')),
  path.resolve(path.join(root, 'agents', 'doc-research.md')),
  path.resolve(path.join(root, 'agents', 'impact-explore.md')),
]);
const archiveRoot = path.resolve(path.join(root, 'harness', 'archive'));
if (target.startsWith(legacyRulesRoot + path.sep) || target === legacyRulesRoot) {
  blockWithCard(`BLOCK: 请不要继续把运行时规范写入历史目录 ${legacyRulesRoot} 。当前自动加载层以 .claude/ 为准。`);
}
if ((target.startsWith(legacyAgentsRoot + path.sep) || target === legacyAgentsRoot) && !pluginAgentSurface.has(target)) {
  blockWithCard(`BLOCK: 请不要继续把运行时规范写入历史目录 ${legacyAgentsRoot} 。当前自动加载层以 .claude/ 为准。`);
}
if (target.startsWith(archiveRoot + path.sep) || target === archiveRoot) {
  blockWithCard('BLOCK: harness/archive/ 视为冻结历史，不允许直接编辑。');
}
const governedRoot = isGovernedTarget(root, target);
if (!governedRoot && target.endsWith('.java')) {
  console.error(`REMINDER: ${target} 看起来是 Java 源码，但未匹配到 src/main/java|src/test/java|openapi 常见约定，机械门禁（designApproved/RED 校验）不会保护此路径。如目录结构非标准，请检查是否符合 Maven/Gradle 约定。`);
}
if (governedRoot) {
  const active = loadActiveChange(root);
  if (!active.ok) {
    blockWithCard('BLOCK: 修改受治理路径（src/main/java、src/test/java、openapi 等）前，必须先设置且保持有效的 harness/ACTIVE_CHANGE。');
  }
  const state = active.data;
  const current = state.state;
  const data = { ...state, changeId: active.changeId };
  if (current === 'DRAFT') {
    blockGoverned('BLOCK: 当前 active change 仍处于 DRAFT。请至少推进到 DISCOVERED 后再修改受治理路径。', data);
  }
  if (current === 'ARCHIVED' || current === 'REJECTED') {
    blockGoverned(`BLOCK: 当前 active change 处于 ${current}，不能继续修改受治理路径。`, data);
  }

  // ── Stage-level artifact guards ──
  const changeDir = path.join(root, 'harness', 'changes', active.changeId);
  const stage = inferWorkflowStage(active.changeId, state);

  if (stage === 'clarify') {
    const missing = [];
    if (!fs.existsSync(path.join(changeDir, 'requirements.md'))) missing.push('requirements.md');
    if (!state.workflow?.userConfirmedScope) missing.push('workflow.userConfirmedScope');
    if (missing.length > 0) {
      blockGoverned(`BLOCK: 当前仍处于 clarify 阶段，缺少: ${missing.join(', ')}。必须先完成需求澄清并获得用户确认，再修改受治理路径。`, data);
    }
  }

  if (stage === 'route') {
    if (!state.tier || !['L0', 'L1', 'L2', 'L3'].includes(state.tier)) {
      blockGoverned('BLOCK: 当前仍处于 route 阶段，tier 未设置。必须先完成路由决策，再修改受治理路径。', data);
    }
  }

  if (stage === 'design') {
    if (!fs.existsSync(path.join(changeDir, 'design.md'))) {
      blockGoverned('BLOCK: 当前仍处于 design 阶段，design.md 不存在。必须先完成设计文档，再修改受治理路径。', data);
    }
  }

  if (stage === 'plan') {
    if (!fs.existsSync(path.join(changeDir, 'tasks.md'))) {
      blockGoverned('BLOCK: 当前仍处于 plan 阶段，tasks.md 不存在。必须先完成任务拆分，再修改受治理路径。', data);
    }
  }

  // ── Gate-level checks ──
  const gate = requiredGateForTarget(root, target);
  const gates = state.gates || {};
  if (gate?.needsDesignApproved && !gates.designApproved) {
    blockGoverned('BLOCK: 当前目标路径需要 designApproved=true。请先完成设计并标记 design gate 通过。', data);
  }
  if (gate?.needsRedVerified && !hasCurrentTaskRedVerification(state)) {
    blockGoverned('BLOCK: 当前目标路径需要 currentTask-scoped red verification。请先为当前 currentTask 记录 RED 证据，再修改生产源码或 OpenAPI。', data);
  }
}
process.exit(0);
