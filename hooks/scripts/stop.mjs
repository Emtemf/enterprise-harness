import { projectRoot } from '../../runtime/lib/checks.mjs';
import { readHookEvent, runHookResult } from '../../runtime/lib/hook-input.mjs';
import { stop } from '../../runtime/lib/hooks/stop.mjs';

const root = projectRoot();
const input = await readHookEvent('EH-HOOK-INPUT-017');
if (!input.ok) runHookResult({ exitCode: 2, stderr: input.error });
const terminalFallbackScope = process.argv.slice(2).includes('--terminal-fallback-scope');
runHookResult(stop({ root, event: input.event, terminalFallbackScope }));
