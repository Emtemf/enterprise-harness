import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { loadHandoffV2, v2ResultPath } from './core/handoff-v2.mjs';
import { gitCommonDir } from './lib/agent-evidence.mjs';
import { sha256Artifact } from './lib/result-contract.mjs';
import { assertNoSymlinkComponents, canonicalPath, resolveWithin } from './lib/safe-paths.mjs';
import {
  sha256File,
  taskIntegrationReceiptPath,
  validateTaskIntegrationReceipt,
} from './lib/task-integration.mjs';
import {
  readTaskExecutionReceipt,
} from './lib/task-execution-receipt.mjs';
import { writeExclusiveJson } from './lib/task-receipt-publication.mjs';
import { resolveWorktreeContext } from './lib/worktree-context.mjs';

function fail(message) {
  console.error(`BLOCK [EH-TASK-INTEGRATION-001] ${message}`);
  process.exit(2);
}

function git(root, args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf-8', shell: false });
  return result.status === 0 ? result.stdout.trim() : null;
}

function pathState(root, relative) {
  const target = resolveWithin(root, relative, 'changedPath');
  if (!fs.existsSync(target)) return { state: 'deleted' };
  const stat = fs.lstatSync(target);
  if (stat.isSymbolicLink()) throw new Error(`${relative} is a symlink`);
  if (!stat.isFile()) throw new Error(`${relative} is not a regular file`);
  return { state: 'file', digest: sha256File(target) };
}

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('Usage: node runtime/task-integrate.mjs <change-id> <task-id> <review-run-id>');
  process.exit(0);
}
const [changeId, taskId, reviewRunId, ...extra] = process.argv.slice(2);
if (!changeId || !taskId || !reviewRunId || extra.length > 0) fail('usage: task-integrate <change-id> <task-id> <review-run-id>');
if (process.env.CLAUDE_AGENT_ID) fail('task integration is controller-owned and cannot be claimed by a subagent');

try {
  const context = resolveWorktreeContext(process.cwd());
  if (canonicalPath(context.executionRoot) !== canonicalPath(context.subjectRoot)) {
    throw new Error('task-integrate must run from the subject checkout, not an execution worktree');
  }
  const root = context.subjectRoot;
  const loaded = readTaskExecutionReceipt(root, changeId, taskId, {
    requireTrusted: true,
    requireFreshInputs: true,
  });
  if (!loaded.ok) throw new Error(`execution receipt is invalid: ${loaded.problems.join('; ')}`);
  const execution = loaded.receipt;
  const reviewInput = loadHandoffV2(root, changeId, reviewRunId);
  if (reviewInput.role !== 'check' || reviewInput.stage !== 'implement') {
    throw new Error('review run must be an implement check handoff');
  }
  const reviewPath = v2ResultPath(root, changeId, reviewRunId, 'check');
  if (!fs.existsSync(reviewPath)) throw new Error('passing independent review result is missing');
  const sourceRoot = execution.worktree.path;
  if (!fs.existsSync(sourceRoot)) throw new Error('source execution worktree is unavailable');
  if (canonicalPath(gitCommonDir(sourceRoot)) !== canonicalPath(context.gitCommonDir)) {
    throw new Error('source execution worktree does not belong to the subject repository');
  }
  const sourceHead = git(sourceRoot, ['rev-parse', 'HEAD']);
  if (sourceHead !== execution.worktree.headAfter) throw new Error('source worktree HEAD changed after execution');
  const subjectHead = git(root, ['rev-parse', 'HEAD']);
  if (!subjectHead) throw new Error('subject HEAD is unavailable');
  if (git(root, ['merge-base', '--is-ancestor', execution.worktree.headBefore, subjectHead]) === null) {
    throw new Error('subject HEAD no longer descends from the execution baseline');
  }
  const changedPaths = execution.changedPaths.map((relative) => {
    const source = pathState(sourceRoot, relative);
    const subject = pathState(root, relative);
    if (JSON.stringify(source) !== JSON.stringify(execution.outputSnapshot?.[relative])) {
      throw new Error(`source content changed after execution: ${relative}`);
    }
    if (JSON.stringify(source) !== JSON.stringify(subject)) {
      throw new Error(`subject content does not match reviewed execution output: ${relative}`);
    }
    return { path: relative, ...source };
  });
  const executionRef = `harness/changes/${changeId}/evidence/tasks/${taskId}.json`;
  const receipt = {
    integrationVersion: 1,
    type: 'task-integration',
    changeId,
    taskId,
    executionReceipt: { path: executionRef, digest: sha256Artifact(root, executionRef) },
    review: {
      runId: reviewRunId,
      parentRunId: reviewInput.parentRunId,
      digest: sha256File(reviewPath),
    },
    source: {
      worktreePath: sourceRoot,
      head: execution.worktree.headAfter,
      treeDigest: execution.worktree.treeDigestAfter,
    },
    subject: { head: subjectHead },
    changedPaths,
    integratedAt: new Date().toISOString(),
  };
  const problems = validateTaskIntegrationReceipt(root, receipt, {
    expectedChangeId: changeId,
    expectedTaskId: taskId,
    requireCurrentSubject: true,
  });
  if (problems.length > 0) throw new Error(problems.join('; '));
  const target = taskIntegrationReceiptPath(root, changeId, taskId);
  const validateFresh = () => {
    if (sha256Artifact(root, executionRef) !== receipt.executionReceipt.digest) {
      throw new Error('execution receipt changed during integration publication');
    }
    if (git(sourceRoot, ['rev-parse', 'HEAD']) !== receipt.source.head) {
      throw new Error('source worktree HEAD changed during integration publication');
    }
    if (sha256File(reviewPath) !== receipt.review.digest) {
      throw new Error('review result changed during integration publication');
    }
    for (const entry of receipt.changedPaths) {
      const expected = { state: entry.state, ...(entry.digest ? { digest: entry.digest } : {}) };
      if (JSON.stringify(pathState(sourceRoot, entry.path)) !== JSON.stringify(expected)
        || JSON.stringify(pathState(root, entry.path)) !== JSON.stringify(expected)) {
        throw new Error(`integrated content changed during publication: ${entry.path}`);
      }
    }
  };
  writeExclusiveJson(target, receipt, {
    validateTarget: () => {
      assertNoSymlinkComponents(root, target, 'task integration receipt path');
      validateFresh();
    },
  });
  console.log(`TASK_INTEGRATION_RECEIPT=${target}`);
} catch (error) {
  fail(error.message);
}
