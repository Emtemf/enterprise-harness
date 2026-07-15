import fs from 'node:fs';
import path from 'node:path';
import { loadActiveChange } from './gates.mjs';
import { inferWorkflowStage, recommendNextEntry, recommendExplorationLane, inferCurrentGap } from './workflow.mjs';

function readText(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : '';
}

function parseProgressSnapshot(text) {
  const currentPhase = text.match(/^- 当前阶段：(.+)$/m)?.[1]?.trim() || '未记录';
  const currentGoal = text.match(/^- 当前目标：(.+)$/m)?.[1]?.trim() || null;
  const nextFocus = Array.from(text.matchAll(/^- (.+)$/gm))
    .map((m) => m[1].trim())
    .filter((line) => !line.startsWith('当前阶段：') && !line.startsWith('进度定位：') && !line.startsWith('当前 active change：') && !line.startsWith('当前目标：') && !line.startsWith('动态真相优先级：') && !line.startsWith('本文件用途：'));
  return {
    file: 'PROGRESS.md',
    currentPhase,
    currentGoal,
    highlights: nextFocus.slice(0, 5),
  };
}

function activeChangeSummary(root) {
  const active = loadActiveChange(root);
  if (!active.ok) {
    return {
      present: false,
      changeId: null,
      state: null,
      validationStatus: null,
      blockers: [],
      approvals: {},
      currentTask: null,
      workflowStage: null,
      nextEntry: '/harness',
      recommendedLane: null,
      currentGap: '当前没有 active change。',
    };
  }
  const data = active.data;
  const workflowStage = inferWorkflowStage(active.changeId, data);
  return {
    present: true,
    changeId: active.changeId,
    state: data.state ?? null,
    validationStatus: data.validation?.status ?? null,
    blockers: data.blockers ?? [],
    approvals: data.approvals ?? {},
    currentTask: data.currentTask ?? null,
    workflowStage,
    nextEntry: recommendNextEntry(workflowStage, data),
    recommendedLane: recommendExplorationLane(workflowStage, data),
    currentGap: inferCurrentGap(root, active.changeId, data, workflowStage),
  };
}

export function buildStatusSummary(root) {
  const progressPath = path.join(root, 'PROGRESS.md');
  const progressText = readText(progressPath);
  const progressSnapshot = parseProgressSnapshot(progressText);
  const activeChange = activeChangeSummary(root);
  return {
    summaryVersion: 1,
    currentPhase: progressSnapshot.currentPhase,
    progressSnapshot,
    activeChange,
    nextStage: activeChange.present ? activeChange.workflowStage : null,
    recommendedEntry: activeChange.present ? activeChange.nextEntry : '/harness',
    recommendedLane: activeChange.present ? activeChange.recommendedLane : null,
    currentGap: activeChange.currentGap,
    truthSources: [
      {
        kind: 'dynamic',
        paths: ['harness/ACTIVE_CHANGE', 'harness/changes/*/state.json'],
        note: '当前动态状态以 active change 与 state.json 为准',
      },
      {
        kind: 'static',
        paths: ['PROGRESS.md'],
        note: 'PROGRESS.md 只承载阶段快照与阅读入口',
      },
    ],
    nextRead: [
      'README.md',
      'AGENTS.md',
      'CLAUDE.md',
      'PROGRESS.md',
      'harness/specs/session-lifecycle.md',
      'harness/specs/staged-workflow.md',
    ],
    nextCommands: [
      'node harness/plugin/runtime/cli.mjs status',
      'node harness/plugin/runtime/cli.mjs doctor',
      'node harness/plugin/runtime/cli.mjs verify',
    ],
  };
}

export function renderStatusSummary(summary) {
  const active = summary.activeChange.present
    ? `${summary.activeChange.changeId} | state=${summary.activeChange.state} | validation=${summary.activeChange.validationStatus}`
    : '当前没有 active change';
  return [
    'Enterprise Harness Status',
    '当前阶段',
    `- ${summary.currentPhase}`,
    '静态快照',
    `- ${summary.progressSnapshot.file}`,
    summary.progressSnapshot.currentGoal ? `- 当前目标：${summary.progressSnapshot.currentGoal}` : '- 当前目标：未记录',
    '动态真相',
    `- ${active}`,
    summary.nextStage ? '当前 workflow stage' : null,
    summary.nextStage ? `- ${summary.nextStage}` : null,
    '当前缺口',
    `- ${summary.currentGap}`,
    summary.recommendedLane ? '推荐探索通道' : null,
    summary.recommendedLane ? `- ${summary.recommendedLane}` : null,
    '推荐恢复入口',
    `- ${summary.recommendedEntry || '/harness'}`,
    '下一步阅读',
    ...summary.nextRead.map((item) => `- ${item}`),
    '下一步命令',
    ...summary.nextCommands.map((item) => `- ${item}`),
  ].filter(Boolean).join('\n');
}
