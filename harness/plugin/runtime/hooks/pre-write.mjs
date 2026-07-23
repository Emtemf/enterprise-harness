import fs from 'node:fs';
import path from 'node:path';
import { projectRoot } from '../lib/checks.mjs';
import { hasCurrentTaskRedVerification, loadActiveChange, isGovernedTarget, requiredGateForTarget } from '../lib/gates.mjs';

const root = projectRoot();
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
  console.error(`BLOCK: 请不要继续把运行时规范写入历史目录 ${legacyRulesRoot} 。当前自动加载层以 .claude/ 为准。`);
  process.exit(2);
}
if ((target.startsWith(legacyAgentsRoot + path.sep) || target === legacyAgentsRoot) && !pluginAgentSurface.has(target)) {
  console.error(`BLOCK: 请不要继续把运行时规范写入历史目录 ${legacyAgentsRoot} 。当前自动加载层以 .claude/ 为准。`);
  process.exit(2);
}
if (target.startsWith(archiveRoot + path.sep) || target === archiveRoot) {
  console.error('BLOCK: harness/archive/ 视为冻结历史，不允许直接编辑。');
  process.exit(2);
}
const governedRoot = isGovernedTarget(root, target);
if (!governedRoot && target.endsWith('.java')) {
  console.error(`REMINDER: ${target} 看起来是 Java 源码，但未匹配到 src/main/java|src/test/java|openapi 常见约定，机械门禁（designApproved/RED 校验）不会保护此路径。如目录结构非标准，请检查是否符合 Maven/Gradle 约定。`);
}
if (governedRoot) {
  const active = loadActiveChange(root);
  if (!active.ok) {
    console.error('BLOCK: 修改受治理路径（src/main/java、src/test/java、openapi 等）前，必须先设置且保持有效的 harness/ACTIVE_CHANGE。');
    process.exit(2);
  }
  const state = active.data;
  const current = state.state;
  if (current === 'DRAFT') {
    console.error('BLOCK: 当前 active change 仍处于 DRAFT。请至少推进到 DISCOVERED 后再修改受治理路径。');
    process.exit(2);
  }
  if (current === 'ARCHIVED' || current === 'REJECTED') {
    console.error(`BLOCK: 当前 active change 处于 ${current}，不能继续修改受治理路径。`);
    process.exit(2);
  }

  // design.md 存在性检查：如果 active change 已建立但 design.md 不存在，说明模型跳过了 design 阶段
  // 这是程序级拦截，不依赖模型自觉
  const changeDir = path.join(root, 'harness', 'changes', active.changeId);
  const designPath = path.join(changeDir, 'design.md');
  if (!fs.existsSync(designPath)) {
    console.error('BLOCK: 当前 active change 缺少 design.md。必须先完成设计阶段（创建 design.md）再修改受治理路径的生产代码。这是 orchestration 级门禁，不得跳过。');
    process.exit(2);
  }

  const gate = requiredGateForTarget(root, target);
  const gates = state.gates || {};
  if (gate?.needsDesignApproved && !gates.designApproved) {
    console.error('BLOCK: 当前目标路径需要 designApproved=true。请先完成设计并标记 design gate 通过。');
    process.exit(2);
  }
  if (gate?.needsRedVerified && !hasCurrentTaskRedVerification(state)) {
    console.error('BLOCK: 当前目标路径需要 currentTask-scoped red verification。请先为当前 currentTask 记录 RED 证据，再修改生产源码或 OpenAPI。');
    process.exit(2);
  }
}
process.exit(0);
