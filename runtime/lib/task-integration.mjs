import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { loadHandoffV2, v2ResultPath } from '../core/handoff-v2.mjs';
import {
  sha256Artifact,
  validateReviewResult,
  validateStageResult,
} from './result-contract.mjs';
import { assertSafeId, isSafeRelativePath, resolveChild, resolveWithin } from './safe-paths.mjs';
import {
  readTaskExecutionReceipt,
} from './task-execution-receipt.mjs';

const FIELDS = new Set([
  'integrationVersion',
  'type',
  'changeId',
  'taskId',
  'executionReceipt',
  'review',
  'source',
  'subject',
  'changedPaths',
  'integratedAt',
]);
const GIT_ID = /^[0-9a-f]{40,64}$/u;
const DIGEST = /^[0-9a-f]{64}$/u;
const RUN_ID = /^run_[0-9a-f-]{36}$/u;
const EXECUTION_REF_FIELDS = new Set(['path', 'digest']);
const REVIEW_FIELDS = new Set(['runId', 'parentRunId', 'digest']);
const SOURCE_FIELDS = new Set(['worktreePath', 'head', 'treeDigest']);
const SUBJECT_FIELDS = new Set(['head']);
const CHANGED_PATH_FIELDS = new Set(['path', 'state', 'digest']);

export function taskIntegrationReceiptPath(root, changeId, taskId) {
  assertSafeId(changeId, 'changeId');
  assertSafeId(taskId, 'taskId');
  const changeDir = resolveChild(path.join(root, 'harness', 'changes'), changeId, 'changeId');
  return path.join(changeDir, 'evidence', 'integration', `${taskId}.json`);
}

export function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function rejectUnknown(value, label, allowed, problems) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    problems.push(`${label} must be an object`);
    return false;
  }
  for (const field of Object.keys(value)) {
    if (!allowed.has(field)) problems.push(`${label} has unknown property ${field}`);
  }
  return true;
}

function pathState(root, relative) {
  const target = resolveWithin(root, relative, 'integrated path');
  if (!fs.existsSync(target)) return { state: 'deleted' };
  const stat = fs.lstatSync(target);
  if (stat.isSymbolicLink()) throw new Error(`${relative} is a symlink`);
  if (!stat.isFile()) throw new Error(`${relative} is not a regular file`);
  return { state: 'file', digest: sha256File(target) };
}

function validateReviewBinding(root, receipt, executionRef, problems) {
  if (!RUN_ID.test(String(receipt.review?.runId || ''))) problems.push('review.runId must be a v2 run id');
  if (!RUN_ID.test(String(receipt.review?.parentRunId || ''))) problems.push('review.parentRunId must be a v2 run id');
  if (!DIGEST.test(String(receipt.review?.digest || ''))) problems.push('review.digest must be sha256');
  if (problems.length > 0) return;
  try {
    const input = loadHandoffV2(root, receipt.changeId, receipt.review.runId);
    if (input.role !== 'check' || input.stage !== 'implement') {
      problems.push('review must be an implement check handoff');
      return;
    }
    if (input.parentRunId !== receipt.review.parentRunId) {
      problems.push('review parentRunId does not match its handoff');
      return;
    }
    const stagePath = v2ResultPath(root, receipt.changeId, input.parentRunId, 'execute');
    const reviewPath = v2ResultPath(root, receipt.changeId, input.runId, 'check');
    const stageResult = JSON.parse(fs.readFileSync(stagePath, 'utf-8'));
    const reviewResult = JSON.parse(fs.readFileSync(reviewPath, 'utf-8'));
    problems.push(...validateStageResult(root, stageResult).map((problem) => `reviewed stage: ${problem}`));
    problems.push(...validateReviewResult(root, reviewResult, { stageResult }).map((problem) => `review: ${problem}`));
    if (reviewResult.verdict !== 'pass') problems.push('review verdict must be pass');
    if (Date.parse(reviewResult.reviewedAt) > Date.parse(receipt.integratedAt)) {
      problems.push('integration must occur after the passing review');
    }
    if (sha256File(reviewPath) !== receipt.review.digest) problems.push('review.digest is stale');
    const reviewedReceipt = reviewResult.reviewedArtifacts?.find((artifact) => artifact.path === executionRef);
    if (reviewedReceipt?.digest !== receipt.executionReceipt.digest) {
      problems.push('review does not bind the canonical execution receipt');
    }
    for (const ref of input.inputRefs || []) {
      if (sha256Artifact(root, ref) !== input.inputDigests?.[ref]) {
        problems.push(`review input digest is stale: ${ref}`);
      }
    }
  } catch (error) {
    problems.push(`review binding is unreadable: ${error.message}`);
  }
}

export function validateTaskIntegrationReceipt(root, receipt, {
  expectedChangeId = null,
  expectedTaskId = null,
  requireCurrentSubject = false,
} = {}) {
  const problems = [];
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) {
    return ['task integration receipt must be an object'];
  }
  for (const field of Object.keys(receipt)) {
    if (!FIELDS.has(field)) problems.push(`task integration receipt has unknown property ${field}`);
  }
  if (receipt.integrationVersion !== 1) problems.push('integrationVersion must be 1');
  if (receipt.type !== 'task-integration') problems.push('type must be task-integration');
  try {
    assertSafeId(receipt.changeId, 'changeId');
    assertSafeId(receipt.taskId, 'taskId');
  } catch (error) {
    problems.push(error.message);
  }
  if (expectedChangeId && receipt.changeId !== expectedChangeId) problems.push(`changeId must be ${expectedChangeId}`);
  if (expectedTaskId && receipt.taskId !== expectedTaskId) problems.push(`taskId must be ${expectedTaskId}`);
  const expectedRef = `harness/changes/${receipt.changeId}/evidence/tasks/${receipt.taskId}.json`;
  rejectUnknown(receipt.executionReceipt, 'executionReceipt', EXECUTION_REF_FIELDS, problems);
  if (receipt.executionReceipt?.path !== expectedRef) problems.push('executionReceipt.path is not canonical');
  if (!DIGEST.test(String(receipt.executionReceipt?.digest || ''))) problems.push('executionReceipt.digest must be sha256');
  rejectUnknown(receipt.review, 'review', REVIEW_FIELDS, problems);
  rejectUnknown(receipt.source, 'source', SOURCE_FIELDS, problems);
  if (!GIT_ID.test(String(receipt.source?.head || ''))) problems.push('source.head must be a git id');
  if (!DIGEST.test(String(receipt.source?.treeDigest || ''))) problems.push('source.treeDigest must be sha256');
  if (!path.isAbsolute(String(receipt.source?.worktreePath || ''))) problems.push('source.worktreePath must be absolute');
  rejectUnknown(receipt.subject, 'subject', SUBJECT_FIELDS, problems);
  if (!GIT_ID.test(String(receipt.subject?.head || ''))) problems.push('subject.head must be a git id');
  if (!Array.isArray(receipt.changedPaths)) {
    problems.push('changedPaths must be an array');
  } else {
    const seen = new Set();
    for (const entry of receipt.changedPaths) {
      if (!entry || typeof entry !== 'object' || typeof entry.path !== 'string') {
        problems.push('changedPaths entries must contain a path');
        continue;
      }
      rejectUnknown(entry, `changedPaths.${entry.path}`, CHANGED_PATH_FIELDS, problems);
      if (!isSafeRelativePath(entry.path)) problems.push(`${entry.path} is not a safe relative path`);
      if (seen.has(entry.path)) problems.push(`duplicate integrated path ${entry.path}`);
      seen.add(entry.path);
      if (!['file', 'deleted'].includes(entry.state)) problems.push(`${entry.path} has invalid integration state`);
      if (entry.state === 'file' && !DIGEST.test(String(entry.digest || ''))) {
        problems.push(`${entry.path} digest must be sha256`);
      }
      if (entry.state === 'deleted' && Object.hasOwn(entry, 'digest')) {
        problems.push(`${entry.path} deletion must not carry a digest`);
      }
    }
  }
  if (!Number.isFinite(Date.parse(receipt.integratedAt))) problems.push('integratedAt must be an ISO timestamp');

  if (problems.length === 0) {
    validateReviewBinding(root, receipt, expectedRef, problems);
  }
  if (problems.length === 0) {
    const loaded = readTaskExecutionReceipt(root, receipt.changeId, receipt.taskId, {
      requireTrusted: true,
      requireFreshInputs: true,
    });
    if (!loaded.ok) problems.push(...loaded.problems.map((problem) => `execution receipt: ${problem}`));
    else {
      if (sha256Artifact(root, expectedRef) !== receipt.executionReceipt.digest) {
        problems.push('executionReceipt.digest is stale');
      }
      if (loaded.receipt.worktree.path !== receipt.source.worktreePath
        || loaded.receipt.worktree.headAfter !== receipt.source.head
        || loaded.receipt.worktree.treeDigestAfter !== receipt.source.treeDigest) {
        problems.push('source binding does not match the execution receipt');
      }
      if (!loaded.receipt.outputSnapshot) problems.push('execution receipt outputSnapshot is missing');
      const integratedPaths = receipt.changedPaths.map((entry) => entry.path).sort();
      const executedPaths = [...loaded.receipt.changedPaths].sort();
      if (JSON.stringify(integratedPaths) !== JSON.stringify(executedPaths)) {
        problems.push('integrated paths do not match execution receipt changedPaths');
      }
      for (const entry of receipt.changedPaths) {
        if (JSON.stringify(loaded.receipt.outputSnapshot?.[entry.path])
          !== JSON.stringify({ state: entry.state, ...(entry.digest ? { digest: entry.digest } : {}) })) {
          problems.push(`${entry.path} does not match the execution outputSnapshot`);
        }
        if (requireCurrentSubject) {
          try {
            const expected = { state: entry.state, ...(entry.digest ? { digest: entry.digest } : {}) };
            if (JSON.stringify(pathState(root, entry.path)) !== JSON.stringify(expected)) {
              problems.push(`subject content is stale for integrated path ${entry.path}`);
            }
          } catch (error) {
            problems.push(`subject content is invalid for ${entry.path}: ${error.message}`);
          }
        }
      }
    }
  }
  return [...new Set(problems)];
}

export function readTaskIntegrationReceipt(root, changeId, taskId, options = {}) {
  const file = taskIntegrationReceiptPath(root, changeId, taskId);
  if (!fs.existsSync(file)) {
    return { ok: false, path: file, receipt: null, problems: ['task integration receipt is missing'] };
  }
  try {
    const receipt = JSON.parse(fs.readFileSync(file, 'utf-8'));
    const problems = validateTaskIntegrationReceipt(root, receipt, {
      ...options,
      expectedChangeId: changeId,
      expectedTaskId: taskId,
    });
    return { ok: problems.length === 0, path: file, receipt, problems };
  } catch (error) {
    return { ok: false, path: file, receipt: null, problems: [`task integration receipt is unreadable: ${error.message}`] };
  }
}
