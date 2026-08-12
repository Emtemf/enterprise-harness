import { projectRoot } from '../../runtime/lib/checks.mjs';
import { readHookEvent, runHookResult } from '../../runtime/lib/hook-input.mjs';
import { agentFailure } from '../../runtime/lib/hooks/agent-failure.mjs';

const root = projectRoot();
const input = await readHookEvent('EH-HOOK-INPUT-017');
if (!input.ok) runHookResult({ exitCode: 2, stderr: input.error });
runHookResult(agentFailure({ root, event: input.event }));
