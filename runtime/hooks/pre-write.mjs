import { projectRoot } from '../lib/checks.mjs';
import { readHookEvent, runHookResult } from '../lib/hook-input.mjs';
import { preWrite } from '../lib/hooks/pre-write.mjs';

const root = projectRoot();
const input = await readHookEvent('EH-HOOK-INPUT-017');
if (!input.ok) runHookResult({ exitCode: 2, stderr: input.error });
runHookResult(preWrite({ root, event: input.event }));
