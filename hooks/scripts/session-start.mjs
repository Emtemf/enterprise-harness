import { projectRoot } from '../../runtime/lib/checks.mjs';
import { loadActiveChange } from '../../runtime/lib/gates.mjs';
import { renderTECPCCard } from '../../runtime/lib/tecp-card.mjs';
import { buildStatusSummary } from '../../runtime/lib/status-summary.mjs';
import { sessionDedupGuard, sessionStartEventIdentity } from '../../runtime/lib/hook-dedup.mjs';
import { evaluateSpawnDepth } from '../../runtime/lib/spawn-depth.mjs';
import { persistSessionId } from '../../runtime/lib/sessions.mjs';
import { recordHookHealth } from '../../runtime/lib/hook-health.mjs';

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
let event = {};
try {
  event = JSON.parse(Buffer.concat(chunks).toString('utf-8').trim() || '{}');
} catch {
  event = {};
}

const root = projectRoot();
const sessionId = typeof event.session_id === 'string' ? event.session_id.trim() : '';
if (sessionId) {
  persistSessionId(sessionId, process.env);
  try {
    recordHookHealth(root, { sessionId });
  } catch (error) {
    console.log(`[Harness Hook Health EH-HOOK-HEALTH-001] ${error.message}`);
  }
}
if (sessionDedupGuard('session-start', sessionStartEventIdentity(event), event.cwd || root)) process.exit(0);

// 启动 banner：sessionwide 去重测试以它为锚点断言并发只打印一次，不能删。
console.log('[Harness 启动检查]');

// spawn depth < 2 means forked stages can't spawn their own executor+checker — hard fail-loud.
const spawnDepth = evaluateSpawnDepth();
if (spawnDepth.ok !== true) {
  console.log(`[Harness 隔离能力 EH-SPAWN-DEPTH-020] ${spawnDepth.detail}`);
}

const summary = buildStatusSummary(root, { sessionId });

// stage/恢复入口/下一步动作在任何会话都输出（有无 active change 都用 fallback）：
// 这些是恢复指针，release worktree 等无 change 场景也必须给出来。
const workflowResult = summary.activeChange ?? {};
console.log(`[Harness Workflow] 当前 stage: ${workflowResult.workflowStage || '未识别'}`);
console.log(`[Harness Workflow] 推荐恢复入口: ${workflowResult.nextEntry || '/harness'}`);
console.log(`[Harness Workflow] 下一步动作: ${summary.nextAction}`);

// TECPC 卡：当前阶段、证据、缺口。有 active change 时才渲染，否则给入口提示。
try {
  const active = loadActiveChange(root, { sessionId });
  if (active.ok) {
    const card = renderTECPCCard(root, active.changeId, active.data, {
      workflowResult,
    });
    console.log(`[Harness 闭环五检]\n${card}`);
  } else {
    console.log('[Harness 入口] 无 active change — 运行 /harness 开始或恢复工作流。');
  }
} catch (error) {
  console.log(`[Harness 诊断 EH-SESSION-TECP-002] TECPC 卡片无法渲染：${error.message}`);
}

