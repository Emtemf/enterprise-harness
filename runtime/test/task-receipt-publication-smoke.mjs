import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  publishTaskReceiptArtifacts,
  writeExclusiveJson,
} from '../lib/task-receipt-publication.mjs';
import { assertNoSymlinkComponents } from '../lib/safe-paths.mjs';

const mode = process.argv[2] || 'verify';
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-task-receipt-publication-'));
const spoolPath = path.join(root, 'common', 'receipt.json');
const canonicalPath = path.join(root, 'change', 'receipt.json');
const priorSpool = {
  spoolVersion: 1,
  runId: 'run-prior',
  receipt: { executions: [{ phase: 'RED' }] },
};
const nextSpool = {
  spoolVersion: 1,
  runId: 'run-prior',
  receipt: { executions: [{ phase: 'RED' }, { phase: 'GREEN' }] },
};
const receipt = nextSpool.receipt;

function failOnValidation(call) {
  let count = 0;
  return () => {
    count += 1;
    if (count === call) throw new Error('handoff input is stale: tasks.md');
  };
}

try {
  fs.mkdirSync(path.dirname(spoolPath), { recursive: true });
  fs.writeFileSync(spoolPath, `${JSON.stringify(priorSpool, null, 2)}\n`);

  assert.throws(() => publishTaskReceiptArtifacts({
    spoolPath,
    canonicalPath,
    spool: nextSpool,
    receipt,
    isFinal: true,
    validateFresh: failOnValidation(2),
    validateTarget: () => {},
  }), /stale/u);
  assert.deepEqual(JSON.parse(fs.readFileSync(spoolPath, 'utf-8')), priorSpool);
  assert.equal(fs.existsSync(canonicalPath), false);

  fs.rmSync(spoolPath);
  assert.throws(() => publishTaskReceiptArtifacts({
    spoolPath,
    canonicalPath,
    spool: nextSpool,
    receipt,
    isFinal: true,
    validateFresh: failOnValidation(6),
    validateTarget: () => {},
  }), /stale/u);
  assert.equal(fs.existsSync(spoolPath), false);
  assert.equal(fs.existsSync(canonicalPath), false);

  let targetValidations = 0;
  assert.throws(() => publishTaskReceiptArtifacts({
    spoolPath,
    canonicalPath,
    spool: nextSpool,
    receipt,
    isFinal: true,
    validateFresh: failOnValidation(6),
    validateTarget: (target) => {
      targetValidations += 1;
      if (target === canonicalPath && targetValidations >= 7) {
        throw new Error('receipt path contains a symbolic-link component');
      }
    },
  }), /rollback failed.*symbolic-link/u);
  assert.equal(fs.existsSync(canonicalPath), true, 'unsafe rollback must not follow a redirected path');
  assert.equal(fs.existsSync(spoolPath), false);
  fs.rmSync(canonicalPath);

  publishTaskReceiptArtifacts({
    spoolPath,
    canonicalPath,
    spool: nextSpool,
    receipt,
    isFinal: true,
    validateFresh: () => {},
    validateTarget: () => {},
  });
  assert.deepEqual(JSON.parse(fs.readFileSync(spoolPath, 'utf-8')), nextSpool);
  assert.deepEqual(JSON.parse(fs.readFileSync(canonicalPath, 'utf-8')), receipt);

  if (process.platform !== 'win32') {
    const trusted = path.join(root, 'trusted');
    const outside = path.join(root, 'outside');
    fs.mkdirSync(trusted);
    fs.mkdirSync(outside);
    fs.symlinkSync(outside, path.join(trusted, 'redirect'), 'dir');
    assert.throws(
      () => assertNoSymlinkComponents(
        trusted,
        path.join(trusted, 'redirect', 'receipt.json'),
        'receipt path',
      ),
      /symbolic-link/u,
    );
    const redirectedTarget = path.join(trusted, 'redirect', 'created-outside', 'receipt.json');
    assert.throws(() => writeExclusiveJson(redirectedTarget, receipt, {
      validateTarget: () => assertNoSymlinkComponents(
        trusted,
        redirectedTarget,
        'receipt path',
      ),
    }), /symbolic-link/u);
    assert.equal(fs.existsSync(path.join(outside, 'created-outside')), false);
  }

  console.log(`PASS task-receipt-publication ${mode}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
