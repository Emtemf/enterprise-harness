import { projectRoot } from '../lib/checks.mjs';
import { readHookEvent, runHookResult } from '../lib/hook-input.mjs';
import { researchEvidence } from '../lib/hooks/research-evidence.mjs';

const root = projectRoot();
const input = await readHookEvent('EH-HOOK-INPUT-017');
if (!input.ok) runHookResult({ exitCode: 2, stderr: input.error });
runHookResult(researchEvidence({
  root,
  event: input.event,
  success: input.event.hook_event_name !== 'PostToolUseFailure',
}));
