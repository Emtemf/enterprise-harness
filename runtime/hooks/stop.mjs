import { projectRoot } from '../lib/checks.mjs';
import { readHookEvent, runHookResult } from '../lib/hook-input.mjs';
import { stop } from '../lib/hooks/stop.mjs';

const root = projectRoot();
const input = await readHookEvent('EH-HOOK-INPUT-017');
if (!input.ok) runHookResult({ exitCode: 2, stderr: input.error });
runHookResult(stop({ root, event: input.event }));
