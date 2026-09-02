import { projectRoot } from '../../runtime/lib/checks.mjs';
import {
  instructionLoadEventIdentity,
  recordInstructionLoad,
} from '../../runtime/lib/instruction-load-observations.mjs';
import { sessionDedupGuard } from '../../runtime/lib/hook-dedup.mjs';

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
try {
  const event = JSON.parse(Buffer.concat(chunks).toString('utf-8').trim() || '{}');
  if (sessionDedupGuard(
    'instructions-loaded',
    instructionLoadEventIdentity(projectRoot(), event),
    event.cwd,
  )) process.exit(0);
  recordInstructionLoad(projectRoot(), event);
  process.exit(0);
} catch (error) {
  // InstructionsLoaded is observability only. It must never prevent Claude Code
  // from loading project instructions or continuing the session.
  process.stderr.write(`[EH-INSTRUCTION-OBSERVE-165] ${error.message}\n`);
  process.exit(0);
}
