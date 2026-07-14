import fs from 'node:fs';
import path from 'node:path';
import { projectRoot } from '../lib/checks.mjs';
import { loadActiveChange, isGovernedTarget, requiredGateForTarget } from '../lib/gates.mjs';

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
const legacyRoots = [path.join(root, 'rules'), path.join(root, 'agents')].map((p) => path.resolve(p));
const archiveRoot = path.resolve(path.join(root, 'harness', 'archive'));
for (const legacy of legacyRoots) {
  if (target.startsWith(legacy + path.sep) || target === legacy) {
    console.error(`BLOCK: 请不要继续把运行时规范写入历史目录 ${legacy} 。当前自动加载层以 .claude/ 为准。`);
    process.exit(2);
  }
}
if (target.startsWith(archiveRoot + path.sep) || target === archiveRoot) {
  console.error('BLOCK: harness/archive/ 视为冻结历史，不允许直接编辑。');
  process.exit(2);
}
const governedRoot = isGovernedTarget(root, target);
if (governedRoot) {
  const active = loadActiveChange(root);
  if (!active.ok) {
    console.error('BLOCK: 修改 reference-service 受治理路径前，必须先设置且保持有效的 harness/ACTIVE_CHANGE。');
    process.exit(2);
  }
  const state = active.data;
  const current = state.state;
  if (current === 'DRAFT') {
    console.error('BLOCK: 当前 active change 仍处于 DRAFT。请至少推进到 DISCOVERED 后再修改 reference-service。');
    process.exit(2);
  }
  if (current === 'ARCHIVED' || current === 'REJECTED') {
    console.error(`BLOCK: 当前 active change 处于 ${current}，不能继续修改 reference-service。`);
    process.exit(2);
  }

  const gate = requiredGateForTarget(root, target);
  const gates = state.gates || {};
  if (gate?.needsDesignApproved && !gates.designApproved) {
    console.error('BLOCK: 当前目标路径需要 designApproved=true。请先完成设计并标记 design gate 通过。');
    process.exit(2);
  }
  if (gate?.needsRedVerified && !gates.redVerified) {
    console.error('BLOCK: 当前目标路径需要 redVerified=true。请先记录 RED 证据再修改生产源码或 OpenAPI。');
    process.exit(2);
  }
}
process.exit(0);
