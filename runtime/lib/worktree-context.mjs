import fs from 'node:fs';
import path from 'node:path';
import { gitCommonDir } from './agent-evidence.mjs';
import { canonicalPath } from './safe-paths.mjs';
import { readSession, sessionIdFromEnv } from './sessions.mjs';

function samePath(left, right) {
  return canonicalPath(left) === canonicalPath(right);
}

/**
 * Resolve the two roots used by an isolated implementation run.
 *
 * executionRoot is the native Claude Code worktree and is the only cwd used
 * for frozen commands. subjectRoot is the main checkout that owns change
 * artifacts and durable evidence. Both roots must share one git common-dir.
 */
export function resolveWorktreeContext(executionRoot, {
  env = process.env,
  requireIsolatedWhenBound = false,
} = {}) {
  const resolvedExecutionRoot = path.resolve(executionRoot);
  if (!fs.existsSync(resolvedExecutionRoot)) {
    throw new Error('EH-WORKTREE-CONTEXT-001: execution root does not exist');
  }
  const sessionId = sessionIdFromEnv(env);
  const binding = sessionId ? readSession(resolvedExecutionRoot, sessionId) : null;
  if (sessionId && !binding) {
    throw new Error(`EH-WORKTREE-CONTEXT-001: session ${sessionId} has no valid binding`);
  }
  const subjectRoot = path.resolve(binding?.subjectRoot || resolvedExecutionRoot);
  if (!fs.existsSync(subjectRoot)) {
    throw new Error('EH-WORKTREE-CONTEXT-001: bound subject root does not exist');
  }
  const executionCommonDir = path.resolve(gitCommonDir(resolvedExecutionRoot));
  const subjectCommonDir = path.resolve(gitCommonDir(subjectRoot));
  if (!samePath(executionCommonDir, subjectCommonDir)) {
    throw new Error('EH-WORKTREE-CONTEXT-002: execution and subject roots do not share a git common-dir');
  }
  const isolated = !samePath(resolvedExecutionRoot, subjectRoot);
  if (requireIsolatedWhenBound && binding && !isolated) {
    throw new Error('EH-WORKTREE-CONTEXT-003: bound implement execution requires a native isolated worktree');
  }
  return Object.freeze({
    executionRoot: resolvedExecutionRoot,
    subjectRoot,
    gitCommonDir: executionCommonDir,
    isolated,
    sessionId,
    binding,
  });
}
