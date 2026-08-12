import fs from 'node:fs';
import path from 'node:path';
import { loadActiveChange } from './gates.mjs';
import { buildWorkflowResult } from './workflow.mjs';
import { renderTECPCCard } from './tecp-card.mjs';

function readText(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : '';
}

function parseDevelopmentSnapshot(text) {
  const currentPhase = text.match(/^- 当前阶段：(.+)$/m)?.[1]?.trim() || '未记录';
  const currentGoal = text.match(/^- 当前目标：(.+)$/m)?.[1]?.trim() || null;
  const nextFocus = Array.from(text.matchAll(/^- (.+)$/gm))
    .map((m) => m[1].trim())
    .filter((line) => !line.startsWith('当前阶段：') && !line.startsWith('进度定位：') && !line.startsWith('当前 active change：') && !line.startsWith('当前目标：') && !line.startsWith('动态真相优先级：') && !line.startsWith('本文件用途：'));
  return {
    file: 'docs/internal/current-development-status.md',
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
      currentGap: '当前没有 active change。',
    };
  }
  const data = active.data;
  const workflow = buildWorkflowResult(root, active.changeId, data);
  return {
    present: true,
    changeId: active.changeId,
    state: data.state ?? null,
    validationStatus: data.validation?.status ?? null,
    blockers: workflow.blockers,
    approvals: data.approvals ?? {},
    currentTask: data.currentTask ?? null,
    workflowStage: workflow.stage,
    nextEntry: workflow.nextEntry,
    recommendedLane: workflow.recommendedLane,
    currentGap: workflow.currentGap,
    nextAction: workflow.nextAction,
    workflowStatus: workflow.status,
    audit: workflow.audit,
  };
}

export function buildStatusSummary(root) {
  const snapshotPath = path.join(root, 'docs', 'internal', 'current-development-status.md');
  const snapshotText = readText(snapshotPath);
  const progressSnapshot = parseDevelopmentSnapshot(snapshotText);
  const activeChange = activeChangeSummary(root);
  let tecpCard = null;
  if (activeChange.present) {
    const active = loadActiveChange(root);
    if (active.ok) {
      try {
        tecpCard = renderTECPCCard(root, active.changeId, active.data, {
          workflowResult: {
            stage: activeChange.workflowStage,
            currentGap: activeChange.currentGap,
            nextAction: activeChange.nextAction,
            audit: activeChange.audit,
          },
        });
      } catch (error) {
        tecpCard = `EH-STATUS-TECP-001: ${error.message}`;
      }
    }
  }
  return {
    summaryVersion: 1,
    status: activeChange.present ? activeChange.workflowStatus : 'idle',
    blockers: activeChange.present ? activeChange.blockers : [],
    currentPhase: progressSnapshot.currentPhase,
    progressSnapshot,
    activeChange,
    _tecpCard: tecpCard,
    nextStage: activeChange.present && activeChange.workflowStatus !== 'blocked' ? activeChange.workflowStage : null,
    projectedStage: activeChange.present ? activeChange.workflowStage : null,
    recommendedEntry: activeChange.present ? activeChange.nextEntry : '/harness',
    recommendedLane: activeChange.present ? activeChange.recommendedLane : null,
    currentGap: activeChange.currentGap,
    nextAction: activeChange.present ? activeChange.nextAction : '/harness',
    truthSources: [
      {
        kind: 'dynamic',
        paths: ['harness/ACTIVE_CHANGE', 'harness/changes/*/state.json'],
        note: '当前动态状态以 active change 与 state.json 为准',
      },
      {
        kind: 'static',
        paths: ['docs/internal/current-development-status.md'],
        note: '可选开发快照仅供维护者阅读，不参与 workflow 判定',
      },
    ],
    nextRead: [
      'README.md',
      'docs/user/quickstart.md',
      'docs/user/workflow.md',
    ],
    nextCommands: [
      '/enterprise-harness:harness（plugin）或 /harness（本仓库开发）',
    ],
    maintainerCommands: [
      'node runtime/cli.mjs status',
      'node runtime/cli.mjs doctor',
      'node runtime/cli.mjs verify',
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
    'Workflow 状态',
    `- ${summary.status}`,
    summary.nextStage ? '当前 workflow stage' : null,
    summary.nextStage ? `- ${summary.nextStage}` : null,
    '当前缺口',
    `- ${summary.currentGap}`,
    summary.recommendedLane ? '推荐探索通道' : null,
    summary.recommendedLane ? `- ${summary.recommendedLane}` : null,
    '推荐恢复入口',
    `- ${summary.recommendedEntry || '/enterprise-harness:harness'}`,
    '当前动作顺序',
    `- ${summary.nextAction || '/enterprise-harness:harness'}`,
    '普通用户下一步',
    '- plugin：/enterprise-harness:harness',
    '- 本仓库开发：/harness',
    '普通用户先看这些',
    ...summary.nextRead.map((item) => `- ${item}`),
    '普通用户下一步命令',
    ...summary.nextCommands.map((item) => `- ${item}`),
    '维护命令（如需排障）',
    ...summary.maintainerCommands.map((item) => `- ${item}`),
    '',
    ...(summary.activeChange.present && summary._tecpCard ? ['闭环五检 (TECPC)', summary._tecpCard] : []),
  ].filter(Boolean).join('\n');
}
