import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validateTaskReviewBindings } from '../lib/checks.mjs';

const changeId = 'review-binding-probe';

function fixture(tasks, reviews, receipts) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-review-binding-'));
  const changeDir = path.join(root, 'harness', 'changes', changeId);
  fs.mkdirSync(path.join(changeDir, 'reviews'), { recursive: true });
  fs.mkdirSync(path.join(changeDir, 'evidence', 'tdd'), { recursive: true });
  fs.writeFileSync(path.join(changeDir, 'tasks.md'), tasks);
  for (const [name, body] of Object.entries(reviews)) {
    fs.writeFileSync(path.join(changeDir, 'reviews', name), JSON.stringify(body, null, 2));
  }
  for (const [name, body] of Object.entries(receipts)) {
    fs.writeFileSync(path.join(changeDir, 'evidence', 'tdd', name), JSON.stringify(body, null, 2));
  }
  return root;
}

const TASKS = '# Tasks\n\n## Task 1: first\n\n## Task 2: second\n';

function review(extra = {}) {
  return {
    changeId,
    reviewerId: 'code-reviewer-task1',
    verdict: 'pass',
    findings: [],
    evidence: ['smoke passed'],
    reviewedAt: '2026-07-30',
    implementationCommit: 'abc1234',
    ...extra,
  };
}

function receipt(digest) {
  return {
    receiptVersion: 1,
    changeId,
    taskId: 'task-1',
    import: { sourceSpoolDigest: digest },
  };
}

// A task review that passed without binding any execution receipt must be rejected:
// this is exactly how task-2/3/4 of the hardening change reached pass with no TDD evidence.
{
  const root = fixture(
    TASKS,
    { 'code-reviewer-task1.json': review({ receiptDigest: null }) },
    { 'task-1.json': receipt('digest-aaa') },
  );
  const results = validateTaskReviewBindings(root, changeId);
  assert.ok(
    results.some((item) => item.code === 'EH-COMPLETION-REVIEW-114' && item.status === 'block'),
    `null receiptDigest must block; got ${JSON.stringify(results)}`,
  );
  fs.rmSync(root, { recursive: true, force: true });
}

// A review bound to a digest that does not match the imported receipt must be rejected.
{
  const root = fixture(
    TASKS,
    { 'code-reviewer-task1.json': review({ receiptDigest: 'digest-mismatch' }) },
    { 'task-1.json': receipt('digest-aaa') },
  );
  const results = validateTaskReviewBindings(root, changeId);
  assert.ok(
    results.some((item) => item.code === 'EH-COMPLETION-REVIEW-114' && item.status === 'block'),
    'mismatched receiptDigest must block',
  );
  fs.rmSync(root, { recursive: true, force: true });
}

// A correctly bound review passes.
{
  const root = fixture(
    TASKS,
    { 'code-reviewer-task1.json': review({ receiptDigest: 'digest-aaa' }) },
    { 'task-1.json': receipt('digest-aaa') },
  );
  const results = validateTaskReviewBindings(root, changeId);
  assert.equal(
    results.filter((item) => item.status === 'block').length,
    0,
    `correct binding must not block; got ${JSON.stringify(results)}`,
  );
  fs.rmSync(root, { recursive: true, force: true });
}

// Absent review files are handled by the existing receipt/reviewer layers, not here:
// this validator must not invent a second "missing review" error path.
{
  const root = fixture(TASKS, {}, { 'task-1.json': receipt('digest-aaa') });
  const results = validateTaskReviewBindings(root, changeId);
  assert.equal(
    results.filter((item) => item.status === 'block').length,
    0,
    'missing review file must not be reported by the binding validator',
  );
  fs.rmSync(root, { recursive: true, force: true });
}

console.log(`PASS task-review-binding ${process.argv[2] || 'verify'}`);
