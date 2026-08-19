import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { publishTaskReceiptArtifacts } from '../lib/task-receipt-publication.mjs';
import { assertNoSymlinkComponents } from '../lib/safe-paths.mjs';

const mode = process.argv[2] || 'verify';
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-task-publication-'));
const spoolPath = path.join(root, 'harness', 'changes', 'demo', 'evidence', 'tasks', 'task-1.json');
const canonicalPath = path.join(root, 'harness', 'changes', 'demo', 'evidence', 'tasks', 'task-1.final.json');
const previousSpool = {
  spoolVersion: 1,
  runId: 'run_prev',
  receipt: { preserved: true },
};
const receipt = { canonical: true };
const spool = { spoolVersion: 1, runId: 'run_new', receipt };

try {
  fs.mkdirSync(path.dirname(spoolPath), { recursive: true });
  fs.writeFileSync(spoolPath, `${JSON.stringify(previousSpool, null, 2)}\n`, 'utf-8');

  let freshChecks = 0;
  assert.throws(() => publishTaskReceiptArtifacts({
    spoolPath,
    canonicalPath,
    spool,
    receipt,
    isFinal: true,
    validateFresh: () => {
      freshChecks += 1;
      if (freshChecks === 2) throw new Error('stale after spool write');
    },
    validateTarget: (target) => {
      assertNoSymlinkComponents(path.dirname(target), target, 'task receipt path');
    },
  }), /stale after spool write/u);

  assert.deepEqual(
    JSON.parse(fs.readFileSync(spoolPath, 'utf-8')),
    previousSpool,
    'rollback must restore the previous spool after a mid-write failure',
  );
  assert.equal(fs.existsSync(canonicalPath), false);

  const symlinkRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-task-publication-symlink-'));
  try {
    const symlinkTarget = path.join(symlinkRoot, 'linked');
    const realTarget = path.join(symlinkRoot, 'real');
    fs.mkdirSync(realTarget, { recursive: true });
    fs.symlinkSync(realTarget, symlinkTarget, 'dir');
    const symlinkedPath = path.join(symlinkTarget, 'receipt.json');
    assert.throws(() => publishTaskReceiptArtifacts({
      spoolPath: symlinkedPath,
      canonicalPath,
      spool,
      receipt,
      isFinal: false,
      validateFresh: () => {},
      validateTarget: (target) => {
        assertNoSymlinkComponents(symlinkRoot, target, 'task receipt path');
      },
    }), /symbolic-link component|escapes/u);
  } finally {
    fs.rmSync(symlinkRoot, { recursive: true, force: true });
  }

  console.log(`PASS task-receipt-publication ${mode}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
