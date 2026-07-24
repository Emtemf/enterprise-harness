import fs from 'node:fs';
import path from 'node:path';
import { projectRoot, validateCompletionReviewers } from '../lib/checks.mjs';
import { loadActiveChange } from '../lib/gates.mjs';
import { inferWorkflowStage } from '../lib/workflow.mjs';
import { renderG4CCard } from '../lib/g4c-card.mjs';

function recommendNextEntry(_stage) {
  return '/harness';
}

function activeChangeGuidance(root) {
  const active = loadActiveChange(root);
  if (!active.ok) {
    return {
      assetGuidance: 'change-specific 结论：优先写回当前 active change 资产；若当前没有 active change，请先补足对应 change bundle。',
      workflowStage: null,
      nextEntry: '/harness',
    };
  }
  const workflowStage = inferWorkflowStage(active.changeId, active.data);
  return {
    assetGuidance: `change-specific 结论：优先写回 harness/changes/${active.changeId}/ 下的 change.md / design.md / tasks.md / validation.md / evidence/*.md / reviews/*.json。`,
    workflowStage,
    nextEntry: recommendNextEntry(workflowStage),
  };
}

function printHandoffGuidance(root) {
  const guidance = activeChangeGuidance(root);
  console.error('Stop handoff guidance:');
  console.error(`- ${guidance.assetGuidance}`);
  if (guidance.workflowStage) {
    console.error(`- 当前 workflow stage：${guidance.workflowStage}`);
    console.error(`- 建议下次从：${guidance.nextEntry} 恢复`);
  }
  // 闭环五检进度卡
  try {
    const active = loadActiveChange(root);
    if (active.ok) {
      const card = renderG4CCard(root, active.changeId, active.data);
      console.error(card);
    }
  } catch {}
  console.error('- repo-level 阶段信息：写回 PROGRESS.md，更新整体阶段、当前目标与下一步重点。');
  console.error('- Claude memory：只保存 repo 中没有记录、但跨会话仍有价值的非仓库事实，而且必须通过显式动作触发。');
  console.error('- 聊天记录：可以作为来源，但不是仓库真相，也不能替代 change 资产、PROGRESS.md 或 Claude memory。');
  console.error('- 如需重新确认当前状态，可运行 node harness/plugin/runtime/cli.mjs status。');
}

const root = projectRoot();
const changesDir = path.join(root, 'harness', 'changes');
// Stop hook 契约：exit 0 放行时，Claude Code 会按 {decision?, reason?, systemMessage?}
// 校验 stdout，空 stdout 不是合法 JSON 会触发 "JSON validation failed"，因此放行必须输出 {}。
// 阻断走 exit 2 + stderr（此时 stdout 的 JSON 被忽略）。
function allow() {
  process.stdout.write('{}\n');
  process.exit(0);
}
if (!fs.existsSync(changesDir)) allow();
let warned = false;
for (const entry of fs.readdirSync(changesDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const changeDir = path.join(changesDir, entry.name);
  const statePath = path.join(changeDir, 'state.json');
  const validationPath = path.join(changeDir, 'validation.md');
  if (!fs.existsSync(statePath)) continue;
  const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
  if (!fs.existsSync(validationPath)) {
    console.error(`BLOCK: ${changeDir} 缺少 validation.md，不能作为完成状态结束。`);
    process.exit(2);
  }
  if ((state.state === 'VALIDATED' || state.state === 'REVIEWED') && state.validation?.status !== 'fresh') {
    console.error(`BLOCK: ${changeDir} 的 validation.status=${state.validation?.status}，请先刷新验证证据。`);
    process.exit(2);
  }
  const reviewerProblems = validateCompletionReviewers(root, entry.name, state);
  if (reviewerProblems.length) {
    console.error(`BLOCK: ${changeDir} 的 reviewer verdict 未满足完成态要求。`);
    for (const problem of reviewerProblems) {
      console.error(`- ${problem}`);
    }
    process.exit(2);
  }
  if (state.state === 'EXECUTING') {
    warned = true;
  }
}
if (warned) {
  console.error('Stop gate 提醒：仍有 change 处于 EXECUTING，请确认是否要结束在当前中间状态。');
}
printHandoffGuidance(root);
allow();
