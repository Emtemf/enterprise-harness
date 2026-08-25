import { authorizeClarifyQuestion } from '../../runtime/core/clarify-question.mjs';
import { activeChangeId } from '../../runtime/lib/agent-evidence.mjs';
import { projectRoot } from '../../runtime/lib/checks.mjs';
import { dedupGuard } from '../../runtime/lib/hook-dedup.mjs';
import { readHookEvent, runHookResult } from '../../runtime/lib/hook-input.mjs';

function blocked(error) {
  const message = String(error?.message || error);
  const code = message.match(/EH-[A-Z0-9-]+-\d+/u)?.[0] || 'EH-HOOK-INPUT-017';
  return {
    exitCode: 2,
    stderr: `BLOCK [${code}] ${message.replace(new RegExp(`^${code}:\\s*`, 'u'), '')}`,
  };
}

const root = projectRoot();
const input = await readHookEvent('EH-HOOK-INPUT-017');
if (!input.ok) runHookResult({ exitCode: 2, stderr: input.error });
if (!activeChangeId(root)) runHookResult({ exitCode: 0 });
if (dedupGuard('pre-question', input.event.tool_use_id, input.event.cwd)) runHookResult({ exitCode: 0 });

try {
  authorizeClarifyQuestion(root, input.event.tool_input);
  runHookResult({ exitCode: 0 });
} catch (error) {
  runHookResult(blocked(error));
}
