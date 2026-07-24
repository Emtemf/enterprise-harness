import { projectRoot, exists, isHarnessManaged } from '../lib/checks.mjs';
import { buildStatusSummary } from '../lib/status-summary.mjs';
import { highSeverityLessons } from '../lib/lessons.mjs';
import { loadActiveChange } from '../lib/gates.mjs';
import { renderG4CCard } from '../lib/g4c-card.mjs';
import fs from 'node:fs';
import path from 'node:path';

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
const guideReminder = summary.activeChange?.guideReminder || null;
const recommendedLane = summary.recommendedLane || null;
const recommendedEntry = summary.recommendedEntry || '/harness';
const nextAction = summary.activeChange?.present && workflowStage === 'design' && summary.currentGap === 'execution deepening 第一批切片待冻结。'
  ? `workflow decide ${summary.activeChange.changeId} freeze-slice`
  : '/harness';
console.log(`[Harness 启动检查] ${parts.join(' | ')}`);
console.log(`[Harness 入口] 普通用户入口: ${userEntry}`);
console.log(`[Harness 强制约束] 所有请求必须先走 ${userEntry} 进入 SOP，不得跳过。`);

// 项目技术栈信息
const projectInfoPath = path.join(root, 'harness', 'project-info.json');
if (fs.existsSync(projectInfoPath)) {
  try {
    const pi = JSON.parse(fs.readFileSync(projectInfoPath, 'utf-8'));
    const items = [];
    if (pi.language && !pi.language.startsWith('<')) items.push(`language=${pi.language}`);
    if (pi.buildTool && !pi.buildTool.startsWith('<')) items.push(`buildTool=${pi.buildTool}`);
    if (pi.testCommand && !pi.testCommand.startsWith('<')) items.push(`testCommand=${pi.testCommand}`);
    if (pi.buildCommand && !pi.buildCommand.startsWith('<')) items.push(`buildCommand=${pi.buildCommand}`);
    if (items.length > 0) {
      console.log(`[Harness 项目技术栈] ${items.join(' | ')}`);
    } else {
      console.log('[Harness 项目技术栈] 未配置（project-info.json 存在但字段未填写），建议运行 setup-local-adapter --write 并编辑 harness/project-info.json 填写项目技术栈');
    }
  } catch {
    // ignore parse errors
  }
} else {
  console.log('[Harness 项目技术栈] 未找到 harness/project-info.json，建议运行 setup-local-adapter --write 生成并填写');
}

console.log(`[Harness 进度] 当前阶段: ${summary.currentPhase}`);
console.log(`[Harness 进度] 静态快照: ${progressFile}`);
console.log(`[Harness 进度] 动态真相: ${activeChange}`);
console.log(`[Harness Workflow] 当前 stage: ${workflowStage}`);
console.log(`[Harness Workflow] 当前缺口: ${currentGap}`);
if (guideReminder) {
  console.log(`[Harness Workflow] GUIDE 提醒: ${guideReminder}`);
}
if (recommendedLane) {
  console.log(`[Harness Workflow] 推荐探索通道: ${recommendedLane}`);
}
console.log(`[Harness Workflow] 推荐恢复入口: ${recommendedEntry}`);
console.log(`[Harness Workflow] 下一步动作: ${nextAction}`);
console.log(`[Harness Workflow] 普通用户先看: ${summary.nextRead.join(' / ')}`);
console.log(`[Harness 维护] 如需排障再用: ${maintainerStatusCommand}`);

// G4C 进度卡
try {
  const active = loadActiveChange(root);
  if (active.ok) {
    const card = renderG4CCard(root, active.changeId, active.data);
    console.log(`[Harness 闭环五检]\n${card}`);
  }
} catch {}

// 代码探索工具可用性提醒
console.log('[Harness 工具提醒] 代码探索时请优先使用 codegraph_explore/codegraph_search 等 MCP 工具，不要用 grep/Read 替代。');

// 强制层的"不再犯"：开会话即把高危教训推到上下文，弱模型也漏不掉。
if (isHarnessManaged(root)) {
  const lessons = highSeverityLessons(root);
  if (lessons.length > 0) {
    console.log(`[Harness 经验] 高危教训 ${lessons.length} 条，动手前务必先规避（详见 harness/lessons/）：`);
    for (const lesson of lessons) {
      console.log(`[Harness 经验] - ${lesson.id}（${lesson.tags}）`);
    }
    console.log('[Harness 经验] 涉及相关主题时，先 lifecycle lesson-list <tag> 查规避方式，再动手。');
  }
}
