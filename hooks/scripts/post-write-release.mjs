import { releaseHookWriteLease } from '../../runtime/lib/hooks/post-write.mjs';
import { projectRoot } from '../../runtime/lib/checks.mjs';
import { dedupGuard } from '../../runtime/lib/hook-dedup.mjs';

// PostToolUseFailure has no write to invalidate, but it must release the lease
// acquired by PreToolUse so a failed tool cannot strand stage transitions.
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const raw = Buffer.concat(chunks).toString('utf-8').trim();

try {
  const event = raw ? JSON.parse(raw) : null;
  if (!event || typeof event !== 'object' || Array.isArray(event)
      || typeof event.tool_use_id !== 'string' || !event.tool_use_id.trim()) {
    throw new Error('PostToolUseFailure requires a non-empty tool_use_id');
  }
  if (dedupGuard('post-write-release', event?.tool_use_id, event?.cwd)) process.exit(0);
  const result = releaseHookWriteLease(projectRoot(), event);
  if (result.engaged && !result.released) throw new Error('active change write lease was not found');
  process.exit(0);
} catch (error) {
  process.stderr.write(`BLOCK [EH-CHANGE-WRITE-LEASE-153] ${error.message}\n`);
  process.exit(2);
}
