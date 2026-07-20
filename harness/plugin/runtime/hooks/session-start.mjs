import { projectRoot, exists } from '../lib/checks.mjs';
import { buildStatusSummary } from '../lib/status-summary.mjs';

const root = projectRoot();
const parts = [
  `.claude/rules=${exists(root, '.claude/rules') ? '存在' : '缺失'}`,
  `.claude/agents=${exists(root, '.claude/agents') ? '存在' : '缺失'}`,
  `.claude/skills=${exists(root, '.claude/skills') ? '存在' : '缺失'}`,
  `templates=${exists(root, 'harness/templates') ? '存在' : '缺失'}`,
  `changes=${exists(root, 'harness/changes') ? '存在' : '缺失'}`,
  `specs=${exists(root, 'harness/specs') ? '存在' : '缺失'}`,
];
const summary = buildStatusSummary(root);
const activeChange = summary.activeChange.present
  ? `${summary.activeChange.changeId} | state=${summary.activeChange.state} | validation=${summary.activeChange.validationStatus}`
  : '当前没有 active change';
const progressFile = summary.progressSnapshot.file || 'PROGRESS.md';
const maintainerStatusCommand = summary.maintainerCommands?.find((command) => command.includes('status')) || 'node harness/plugin/runtime/cli.mjs status';
const userEntry = '/harness';
const workflowStage = summary.nextStage || '未识别';
const currentGap = summary.currentGap || '未识别当前缺口';
const recommendedLane = summary.recommendedLane || null;
const recommendedEntry = summary.recommendedEntry || '/harness';
const nextAction = summary.activeChange?.present && workflowStage === 'design' && summary.currentGap === 'execution deepening 第一批切片待冻结。'
  ? `workflow decide ${summary.activeChange.changeId} freeze-slice`
  : '/harness';
console.log(`[Harness 启动检查] ${parts.join(' | ')}`);
console.log(`[Harness 入口] 普通用户入口: ${userEntry}`);
console.log(`[Harness 强制约束] 所有请求必须先走 ${userEntry} 进入 SOP，不得跳过。`);
console.log(`[Harness 进度] 当前阶段: ${summary.currentPhase}`);
console.log(`[Harness 进度] 静态快照: ${progressFile}`);
console.log(`[Harness 进度] 动态真相: ${activeChange}`);
console.log(`[Harness Workflow] 当前 stage: ${workflowStage}`);
console.log(`[Harness Workflow] 当前缺口: ${currentGap}`);
if (recommendedLane) {
  console.log(`[Harness Workflow] 推荐探索通道: ${recommendedLane}`);
}
console.log(`[Harness Workflow] 推荐恢复入口: ${recommendedEntry}`);
console.log(`[Harness Workflow] 下一步动作: ${nextAction}`);
console.log(`[Harness Workflow] 普通用户先看: ${summary.nextRead.join(' / ')}`);
console.log(`[Harness 维护] 如需排障再用: ${maintainerStatusCommand}`);
