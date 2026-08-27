import { projectRoot } from '../../runtime/lib/checks.mjs';
import { recordPromptReceipt } from '../../runtime/lib/prompt-receipts.mjs';
import { sessionDedupGuard, userPromptEventIdentity } from '../../runtime/lib/hook-dedup.mjs';

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
try {
  const event = JSON.parse(Buffer.concat(chunks).toString('utf-8').trim() || '{}');
  if (sessionDedupGuard('user-prompt-receipt', userPromptEventIdentity(event), event.cwd)) process.exit(0);
  recordPromptReceipt(projectRoot(), event);
  process.exit(0);
} catch (error) {
  // Prompt submission must remain available. Clarify later fails closed with a
  // recovery action if the host receipt could not be captured.
  process.stderr.write(`[EH-PROMPT-RECEIPT-154] ${error.message}\n`);
  process.exit(0);
}
