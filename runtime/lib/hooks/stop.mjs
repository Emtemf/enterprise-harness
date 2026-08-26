import fs from 'node:fs';
import path from 'node:path';
import { loadHookChange } from '../hook-change.mjs';
import { renderTECPCCard } from '../tecp-card.mjs';
import { buildRecoveryGuidance } from '../recovery-guidance.mjs';
import { sessionDedupGuard, stopEventIdentity } from '../hook-dedup.mjs';
import { buildClarifyReadiness } from '../clarify-readiness.mjs';
import {
  evaluateTerminalFactGateShape,
  terminalFactGateFallbackRequired,
  TERMINAL_FACT_GATE_CORRECTION,
} from '../terminal-fact-gate.mjs';

export function stop({ root, event }) {
  // Stop hook 契约：Claude Code 会按 {decision?, reason?, systemMessage?} 校验 stdout；
  // 空 stdout 会触发 "JSON validation failed"，因此放行必须输出 {}，纠偏使用 decision:block。
  const allow = () => ({ exitCode: 0, stdout: '{}\n' });

  // 重复注册（plugin + settings.json）时同一次 stop 会被触发两遍。第二遍仍要满足
  // stdout 契约，但不重复跑门禁和 handoff 输出。
  if (sessionDedupGuard('stop', stopEventIdentity(event), event.cwd || root)) return allow();

  const active = loadHookChange(root, event);
  try {
    const clarifyRoute = active.ok
      && active.data?.schemaVersion === 6
      && active.data?.stage === 'clarify'
      ? buildClarifyReadiness(path.resolve(path.dirname(active.statePath), '..', '..', '..'), active.changeId).route
      : null;
    if (terminalFactGateFallbackRequired({ event, active, clarifyRoute })
      && !evaluateTerminalFactGateShape(event.last_assistant_message).pass) {
      return {
        exitCode: 0,
        stdout: `${JSON.stringify({ decision: 'block', reason: TERMINAL_FACT_GATE_CORRECTION })}\n`,
      };
    }
  } catch (error) {
    // This is a presentation-only correction. Internal failures must never become
    // lifecycle authority or prevent the user from ending the turn.
    console.error(`EH-STOP-FALLBACK-149: terminal fallback check failed open: ${error.message}`);
  }

  const changesDir = path.join(root, 'harness', 'changes');
  if (!fs.existsSync(changesDir)) return allow();
  if (!active.ok) {
    printHandoffGuidance(root, event);
    return allow();
  }
  // Stop is never a lifecycle correctness authority. Runtime transition and completion
  // commands consume fresh structured evidence; this hook only records recovery context.
  printHandoffGuidance(root, event);
  return allow();
}

function printHandoffGuidance(root, event = {}) {
  const guidance = buildRecoveryGuidance(root, event);
  console.error('Stop handoff guidance:');
  console.error(`- ${guidance.assetGuidance}`);
  if (guidance.workflowStage) {
    console.error(`- 当前 workflow stage：${guidance.workflowStage}`);
    console.error(`- 建议下次从：${guidance.nextEntry} 恢复`);
    console.error(`- 下一步动作：${guidance.nextAction}`);
  }
  // 闭环五检进度卡
  try {
    const active = loadHookChange(root, event);
    if (active.ok) {
      const card = renderTECPCCard(root, active.changeId, active.data, {
        workflowResult: {
          stage: guidance.workflowStage,
          currentGap: guidance.currentGap,
          nextAction: guidance.nextAction,
          audit: guidance.audit,
        },
      });
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
