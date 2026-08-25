import { authorizeClarifyQuestion } from '../../runtime/core/clarify-question.mjs';
import { activeChangeId } from '../../runtime/lib/agent-evidence.mjs';
import { projectRoot } from '../../runtime/lib/checks.mjs';
import { formatDiagnostic } from '../../runtime/lib/diagnostics.mjs';
import { readHookEvent, runHookResult } from '../../runtime/lib/hook-input.mjs';

function payload(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event) || !Object.hasOwn(event, 'tool_input')) {
    throw new Error('EH-QUESTION-INPUT-115: payload must be an object with tool_input');
  }
  return event;
}

function blocked(error) {
  const message = String(error?.message || error);
  const code = message.match(/EH-[A-Z0-9-]+-\d+/u)?.[0] || 'EH-HOOK-INPUT-017';
  return {
    exitCode: 2,
    stderr: formatDiagnostic(code, message.replace(new RegExp(`^${code}:\\s*`, 'u'), '')),
  };
}

const root = projectRoot();
const input = await readHookEvent('EH-HOOK-INPUT-017');
if (!input.ok) runHookResult({ exitCode: 2, stderr: input.error });

try {
  if (!activeChangeId(root)) runHookResult({ exitCode: 0 });
  authorizeClarifyQuestion(root, payload(input.event).tool_input);
  runHookResult({ exitCode: 0 });
} catch (error) {
  runHookResult(blocked(error));
}
