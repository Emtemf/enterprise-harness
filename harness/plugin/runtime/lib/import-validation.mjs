import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  completedHarnessAgent,
  gitCommonDir,
} from './agent-evidence.mjs';
import {
  headSnapshotDigest,
  worktreeSnapshotDigest,
} from './git-evidence.mjs';
import { isSafeEvidenceId } from './tdd-receipts.mjs';

function git(root, args, encoding = 'utf-8') {
  const result = spawnSync('git', args, { cwd: root, encoding, shell: false });
  return result.status === 0 ? result.stdout : null;
}

function nulPaths(buffer) {
  if (!buffer) return [];
  const content = Buffer.isBuffer(buffer) ? buffer.toString('utf-8') : buffer;
  return content.split('\0').filter(Boolean).sort();
}

export function validateBootstrapReview(review, { reviewedCommit, spoolDigest }) {
  const problems = [];
  if (String(review?.verdict || review?.status || '').toLowerCase() !== 'pass') {
    problems.push('bootstrap reviewer verdict must be pass');
  }
  if (review?.implementationCommit !== reviewedCommit) {
    problems.push('bootstrap review is not bound to the exact implementation commit');
  }
  if (review?.receiptDigest !== spoolDigest) {
    problems.push('bootstrap review is not bound to the exact receipt digest');
  }
  return problems;
}

export function validateImportProvenance(receipt, options) {
  const {
    root,
    changeId,
    taskId,
    sourceHead,
    integrationHead,
  } = options;
  const problems = [];
  if (!isSafeEvidenceId(changeId) || !isSafeEvidenceId(taskId)) {
    return ['unsafe evidence identifier'];
  }
  const sourceRoot = receipt?.worktree?.path;
  if (!path.isAbsolute(String(sourceRoot || '')) || !fs.existsSync(sourceRoot)) {
    return ['source worktree is unavailable'];
  }
  const expectedCommonDir = path.resolve(gitCommonDir(root));
  if (path.resolve(receipt.worktree.gitCommonDir) !== expectedCommonDir
      || path.resolve(gitCommonDir(sourceRoot)) !== expectedCommonDir) {
    problems.push('receipt git common dir mismatch');
  }
  if (receipt.provenance !== 'runner-bootstrap'
      && !completedHarnessAgent(
        root,
        changeId,
        receipt.agent?.id,
        'enterprise-harness:tdd-executor',
      )) {
    problems.push('receipt agent lacks completed dispatch/start/binding/stop evidence');
  }
  for (const commit of [receipt.worktree.headBefore, receipt.worktree.headAfter, sourceHead]) {
    if (git(sourceRoot, ['cat-file', '-e', `${commit}^{commit}`]) === null) {
      problems.push(`receipt commit is unavailable: ${commit}`);
    }
  }
  if (problems.length) return problems;
  if (git(sourceRoot, [
    'merge-base',
    '--is-ancestor',
    receipt.worktree.headAfter,
    sourceHead,
  ]) === null) {
    problems.push('receipt headAfter is not an ancestor of source implementation HEAD');
  }
  if (headSnapshotDigest(sourceRoot, receipt.worktree.headBefore)
      !== receipt.worktree.treeDigestBefore) {
    problems.push('treeDigestBefore does not match headBefore');
  }
  if (worktreeSnapshotDigest(sourceRoot) !== receipt.worktree.treeDigestAfter) {
    problems.push('treeDigestAfter does not match reviewed source worktree');
  }
  const committedPaths = nulPaths(git(sourceRoot, [
    'diff',
    '--name-only',
    '-z',
    receipt.worktree.headBefore,
    sourceHead,
    '--',
  ], 'buffer'));
  if (JSON.stringify(committedPaths) !== JSON.stringify([...(receipt.changedPaths || [])].sort())) {
    problems.push('changedPaths do not match the implementation commit range');
  }
  if (git(root, ['cat-file', '-e', `${integrationHead}^{commit}`]) === null) {
    problems.push('integration HEAD is unavailable');
  }
  return problems;
}

export function writeExclusive(target, content) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, content, { flag: 'wx' });
  try {
    fs.linkSync(temporary, target);
  } catch (error) {
    fs.unlinkSync(temporary);
    if (error.code === 'EEXIST') throw new Error(`durable evidence already exists: ${target}`);
    throw error;
  }
  fs.unlinkSync(temporary);
}
