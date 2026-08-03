import fs from 'node:fs';
import path from 'node:path';
import { projectRoot, validateCompletionPredicate, validateCompletionReviewers } from '../lib/checks.mjs';
import { loadActiveChange } from '../lib/gates.mjs';
import { renderTECPCCard } from '../lib/tecp-card.mjs';
import { buildRecoveryGuidance } from '../lib/recovery-guidance.mjs';
import { sessionDedupGuard, stopEventIdentity } from '../lib/hook-dedup.mjs';

function printHandoffGuidance(root) {
  const guidance = buildRecoveryGuidance(root);
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
      const card = renderTECPCCard(root, active.changeId, active.data);
      console.error(card);
    }
  } catch (error) {
    console.error(`- EH-STOP-TECP-001：TECPC 卡片无法渲染：${error.message}`);
  }
  console.error('- 动态状态：写回 active change 的 state.json、evidence、reviews 与 validation.md。');
  console.error('- 可选维护快照：如确有必要，更新 docs/internal/current-development-status.md；它不参与 gate。');
  console.error('- Claude memory：只保存 repo 中没有记录、但跨会话仍有价值的非仓库事实，而且必须通过显式动作触发。');
  console.error('- 聊天记录：可以作为来源，但不是仓库真相，也不能替代 change 资产或 Claude memory。');
  console.error('- 如需重新确认当前状态，可运行 node runtime/cli.mjs status。');
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

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
let event = {};
try {
  event = JSON.parse(Buffer.concat(chunks).toString('utf-8').trim() || '{}');
} catch {
  event = {};
}
// 重复注册（plugin + settings.json）时同一次 stop 会被触发两遍。第二遍仍要满足
// stdout 契约，但不重复跑门禁和 handoff 输出。
if (sessionDedupGuard('stop', stopEventIdentity(event), event.cwd || root)) allow();

if (!fs.existsSync(changesDir)) allow();
const active = loadActiveChange(root);
if (!active.ok) {
  printHandoffGuidance(root);
  allow();
}
const changeDir = path.join(changesDir, active.changeId);
const validationPath = path.join(changeDir, 'validation.md');
const state = active.data;
if (!fs.existsSync(validationPath)) {
  console.error(`BLOCK: ${changeDir} 缺少 validation.md，不能作为完成状态结束。`);
  process.exit(2);
}
if ((state.state === 'VALIDATED' || state.state === 'REVIEWED') && state.validation?.status !== 'fresh') {
  console.error(`BLOCK: ${changeDir} 的 validation.status=${state.validation?.status}，请先刷新验证证据。`);
  process.exit(2);
}
const completionProblems = state.state === 'VALIDATED'
  ? validateCompletionPredicate(root, active.changeId, state)
  : state.state === 'REVIEWED'
    ? validateCompletionReviewers(root, active.changeId, state)
    : [];
if (completionProblems.length) {
  console.error(`BLOCK: ${changeDir} 的统一完成态条件未满足。`);
  for (const problem of completionProblems) console.error(`- ${problem}`);
  process.exit(2);
}
if (state.state === 'EXECUTING') {
  console.error('Stop gate 提醒：仍有 change 处于 EXECUTING，请确认是否要结束在当前中间状态。');
}
printHandoffGuidance(root);
allow();
