import path from 'node:path';
import { loadHookChange } from '../hook-change.mjs';
import { isGovernedTarget } from '../gates.mjs';
import { stageGateIsFresh, validateDynamicWriteGates } from '../execution-prerequisites.mjs';
import { extractHookTargets, isPotentialWriteBash } from '../hook-targets.mjs';
import { captureGovernedSnapshot, writeHookSnapshot } from '../hook-snapshots.mjs';
import { validateTaskRunLauncher } from '../task-run-authorization.mjs';
import { boundHarnessAgent } from '../agent-evidence.mjs';
import { renderTECPCCard } from '../tecp-card.mjs';
import { dedupGuard } from '../hook-dedup.mjs';

export function preWrite({ root, event }) {
  if (dedupGuard('pre-write', event.tool_use_id, event.cwd)) return { exitCode: 0 };

  const activeForRunner = loadHookChange(root, event);
  const agentId = String(event.agent_id || '').trim();
  const v6Implementer = activeForRunner.ok
    && activeForRunner.data?.schemaVersion === 6
    && activeForRunner.data?.stage === 'implement'
    && boundHarnessAgent(
      root,
      activeForRunner.changeId,
      agentId,
      'enterprise-harness:implementer',
    );
  if (event.tool_name === 'Bash' && v6Implementer) {
    const launcher = validateTaskRunLauncher(
      root,
      event.tool_input?.command,
      event,
    );
    if (!launcher.ok) {
      return block(
        root,
        `受治理 implementer 的 Bash 只能启动 canonical task-run：${launcher.problems.join(' | ')}`,
        activeForRunner,
      );
    }
    const stageGate = stageGateIsFresh(
      root,
      activeForRunner.changeId,
      activeForRunner.data,
    );
    if (!stageGate.fresh) {
      return block(
        root,
        `静态阶段链未通过验证（${stageGate.reason}）。先运行: enterprise-harness validate ${activeForRunner.changeId}`,
        activeForRunner,
      );
    }
    try {
      writeHookSnapshot(root, event.tool_use_id, captureGovernedSnapshot(root));
    } catch (error) {
      return block(root, `EH-HOOK-SNAPSHOT-010 无法建立 task-run 写入前快照：${error.message}`);
    }
    return { exitCode: 0 };
  }

  if (event.tool_name === 'Bash' && isPotentialWriteBash(event.tool_input?.command)) {
    try {
      writeHookSnapshot(root, event.tool_use_id, captureGovernedSnapshot(root));
    } catch (error) {
      return block(root, `EH-HOOK-SNAPSHOT-010 无法建立 Bash 写入前快照：${error.message}`);
    }
  }

  const targets = extractHookTargets(root, event);
  for (const target of targets) {
    const legacyRulesRoot = path.resolve(root, 'rules');
    const legacyAgentsRoot = path.resolve(root, 'agents');
    const archiveRoot = path.resolve(root, 'harness/archive');
    if (target === legacyRulesRoot || target.startsWith(`${legacyRulesRoot}${path.sep}`)) {
      return block(root, 'rules/ 是历史目录；运行时规则必须写入 rules/。');
    }
    if (target === archiveRoot || target.startsWith(`${archiveRoot}${path.sep}`)) {
      return block(root, 'harness/archive/ 是冻结历史，不允许直接编辑。');
    }
    if ((target === legacyAgentsRoot || target.startsWith(`${legacyAgentsRoot}${path.sep}`))
        && !target.endsWith('.md')) {
      return block(root, 'agents/ 中非插件 agent 资产属于历史目录。');
    }
    if (!isGovernedTarget(root, target)) {
      if (target.endsWith('.java')) {
        console.error(`REMINDER: ${target} 未匹配 src/main/java、src/test/java 或 openapi 受治理约定。`);
      }
      continue;
    }
    const active = loadHookChange(root, event);
    if (!active.ok) return block(root, '修改受治理路径前必须设置有效的 harness/ACTIVE_CHANGE。');
    if (['DRAFT', 'ARCHIVED', 'REJECTED'].includes(active.data.state)) {
      return block(root, `active change 状态 ${active.data.state} 不允许受治理写入。`, active);
    }
    // 动态瞬间 gate：agent 归属 / RED / currentTask，必须当场强制。
    const dynamic = validateDynamicWriteGates(root, active.changeId, active.data, target, event);
    if (dynamic.length) {
      return block(root, `写前置未满足：${dynamic.join(' | ')}`, active);
    }
    // 静态阶段链：不在这里重算。skill 在阶段边界跑 `validate` 落 marker，这里只轻查。
    const stageGate = stageGateIsFresh(root, active.changeId, active.data);
    if (!stageGate.fresh) {
      return block(root,
        `静态阶段链未通过验证（${stageGate.reason}）。先运行: enterprise-harness validate ${active.changeId}`, active);
    }
  }
  return { exitCode: 0 };
}

function block(root, message, active = null) {
  const lines = [`BLOCK: ${message}`];
  try {
    if (active?.ok) lines.push(renderTECPCCard(root, active.changeId, active.data));
  } catch (error) {
    lines.push(`EH-HOOK-TECP-018: ${error.message}`);
  }
  return { exitCode: 2, stderr: lines.join('\n') };
}
