import { projectRoot } from '../lib/checks.mjs';
import { readHookEvent, runHookResult } from '../lib/hook-input.mjs';
import { subagentStart } from '../lib/hooks/subagent-start.mjs';

const root = projectRoot();
const input = await readHookEvent('EH-HOOK-INPUT-017');
if (!input.ok) runHookResult({ exitCode: 2, stderr: input.error });
runHookResult(subagentStart({ root, event: input.event }));
