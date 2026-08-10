import { projectRoot } from '../lib/checks.mjs';
import { loadActiveChange } from '../lib/gates.mjs';
import { renderTECPCCard } from '../lib/tecp-card.mjs';
import { buildStatusSummary } from '../lib/status-summary.mjs';
import { sessionDedupGuard, sessionStartEventIdentity } from '../lib/hook-dedup.mjs';
import { evaluateSpawnDepth } from '../lib/spawn-depth.mjs';
import { computeGuideReminder } from '../lib/workflow.mjs';

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
let event = {};
try {
  event = JSON.parse(Buffer.concat(chunks).toString('utf-8').trim() || '{}');
} catch {
  event = {};
}

const root = projectRoot();
if (sessionDedupGuard('session-start', sessionStartEventIdentity(event), event.cwd || root)) process.exit(0);

// 启动 banner：sessionwide 去重测试以它为锚点断言并发只打印一次，不能删。
console.log('[Harness 启动检查]');

// spawn depth < 2 means forked stages can't spawn their own executor+checker — hard fail-loud.
const spawnDepth = evaluateSpawnDepth();
if (spawnDepth.ok !== true) {
  console.log(`[Harness 隔离能力 EH-SPAWN-DEPTH-020] ${spawnDepth.detail}`);
}

const summary = buildStatusSummary(root);

// TECPC 卡：当前阶段、证据、缺口、下一步动作。这是会话首屏最有价值的单块信息。
try {
  const active = loadActiveChange(root);
  if (active.ok) {
    const card = renderTECPCCard(root, active.changeId, active.data, {
      workflowResult: summary.activeChange ?? {},
    });
    console.log(`[Harness 闭环五检]\n${card}`);
    // 下一步动作：blocked 时是 audit 恢复命令，否则是 nextEntry。测试 contract 守护这一行。
    console.log(`[Harness Workflow] 下一步动作: ${summary.nextAction}`);
    // 恢复入口 + 当前 stage：status CLI 已有完整输出，这里只给最薄的两行恢复指针。
    const workflowResult = summary.activeChange ?? {};
    console.log(`[Harness Workflow] 当前 stage: ${workflowResult.workflowStage || '未识别'}`);
    console.log(`[Harness Workflow] 推荐恢复入口: ${workflowResult.nextEntry || '/harness'}`);
    const guideReminder = computeGuideReminder(root, active.changeId);
    if (guideReminder) {
      console.log(`[Harness Workflow] GUIDE 提醒: ${guideReminder}`);
    }
  } else {
    console.log('[Harness 入口] 无 active change — 运行 /harness 开始或恢复工作流。');
  }
} catch (error) {
  console.log(`[Harness 诊断 EH-SESSION-TECP-002] TECPC 卡片无法渲染：${error.message}`);
}

