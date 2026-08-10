import { cleanupWorktree } from '../lib/worktree.mjs';
import { readHookEvent, runHookResult } from '../lib/hook-input.mjs';

// Thin hook: read the event, delegate WorktreeRemove cleanup to lib/worktree.mjs.
// Best-effort side effect — failures must not block the removal (fail-open).

const input = await readHookEvent('EH-HOOK-INPUT-017');
if (!input.ok) runHookResult({ exitCode: 0 });
runHookResult(cleanupWorktree(input.event));
