import path from 'node:path';
import { projectRoot } from '../lib/checks.mjs';
import { loadActiveChange, isGovernedTarget } from '../lib/gates.mjs';
import { validateExecutionPrerequisites } from '../lib/execution-prerequisites.mjs';
import { extractHookTargets } from '../lib/hook-targets.mjs';
import { isPotentialWriteBash } from '../lib/hook-targets.mjs';
import { captureGovernedSnapshot, writeHookSnapshot } from '../lib/hook-snapshots.mjs';
import { renderTECPCCard } from '../lib/tecp-card.mjs';
import { dedupGuard } from '../lib/hook-dedup.mjs';

const root = projectRoot();
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const raw = Buffer.concat(chunks).toString('utf-8').trim();
if (!raw) process.exit(0);
let event;
try {
  event = JSON.parse(raw);
} catch (error) {
  console.error(`BLOCK [EH-HOOK-INPUT-017] invalid PreToolUse JSON: ${error.message}`);
  process.exit(2);
}
if (dedupGuard('pre-write', event.tool_use_id, event.cwd)) process.exit(0);

if (event.tool_name === 'Bash' && isPotentialWriteBash(event.tool_input?.command)) {
  try {
    writeHookSnapshot(root, event.tool_use_id, captureGovernedSnapshot(root));
  } catch (error) {
    block(`EH-HOOK-SNAPSHOT-010 无法建立 Bash 写入前快照：${error.message}`);
  }
}

function block(message, active = null) {
  console.error(`BLOCK: ${message}`);
  try {
    if (active?.ok) console.error(renderTECPCCard(root, active.changeId, active.data));
  } catch (error) {
    console.error(`EH-HOOK-TECP-018: ${error.message}`);
  }
  process.exit(2);
}

const targets = extractHookTargets(root, event);
for (const target of targets) {
  const legacyRulesRoot = path.resolve(root, 'rules');
  const legacyAgentsRoot = path.resolve(root, 'agents');
  const archiveRoot = path.resolve(root, 'harness/archive');
  if (target === legacyRulesRoot || target.startsWith(`${legacyRulesRoot}${path.sep}`)) {
    block('rules/ 是历史目录；运行时规则必须写入 .claude/rules/。');
  }
  if (target === archiveRoot || target.startsWith(`${archiveRoot}${path.sep}`)) {
    block('harness/archive/ 是冻结历史，不允许直接编辑。');
  }
  if ((target === legacyAgentsRoot || target.startsWith(`${legacyAgentsRoot}${path.sep}`))
      && !target.endsWith('.md')) block('agents/ 中非插件 agent 资产属于历史目录。');
  if (!isGovernedTarget(root, target)) {
    if (target.endsWith('.java')) console.error(`REMINDER: ${target} 未匹配 src/main/java、src/test/java 或 openapi 受治理约定。`);
    continue;
  }
  const active = loadActiveChange(root);
  if (!active.ok) block('修改受治理路径前必须设置有效的 harness/ACTIVE_CHANGE。');
  if (['DRAFT', 'ARCHIVED', 'REJECTED'].includes(active.data.state)) {
    block(`active change 状态 ${active.data.state} 不允许受治理写入。`, active);
  }
  const problems = validateExecutionPrerequisites(root, active.changeId, active.data, target, event);
  if (problems.length) block(`累计执行前置条件未满足：${problems.join(' | ')}`, active);
}
process.exit(0);
