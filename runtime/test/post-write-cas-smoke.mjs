import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { writeClassificationV2Fixture as writeClassificationArtifact } from './classification-v2-fixture.mjs';
import { statePathFor, updateChangeState } from '../core/change-state.mjs';
import { markValidationStaleForWrite } from '../lib/hooks/post-write.mjs';

const mode = process.argv[2] || 'verify';
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-post-write-cas-'));
const changeId = 'post-write-cas';
const changeDir = path.join(root, 'harness', 'changes', changeId);
const statePath = statePathFor(root, changeId);
const requirementsPath = path.join(changeDir, 'requirements.md');

try {
  fs.mkdirSync(changeDir, { recursive: true });
  const classification = writeClassificationArtifact(root, changeId, {
    impact: { api: 'no', data: 'no', architecture: 'no', rule: 'no', security: 'no' },
  });
  const initial = {
    schemaVersion: 6,
    revision: 1,
    changeId,
    lifecycle: 'active',
    stage: 'clarify',
    artifacts: { classification },
    validation: { status: 'fresh', digest: 'a'.repeat(64), validatedAt: '2026-08-16T00:00:00.000Z' },
  };
  fs.writeFileSync(statePath, `${JSON.stringify(initial, null, 2)}\n`);
  fs.writeFileSync(requirementsPath, '# Requirements\n');

  fs.mkdirSync(`${statePath}.lock`);
  assert.throws(
    () => markValidationStaleForWrite(root, statePath, requirementsPath),
    /EH-STATE-LOCK-012/u,
    'post-write invalidation must not bypass an authoritative state lock',
  );
  assert.deepEqual(JSON.parse(fs.readFileSync(statePath, 'utf-8')), initial);
  fs.rmSync(`${statePath}.lock`, { recursive: true });

  const authoritative = updateChangeState(root, changeId, (state) => ({
    ...state,
    currentTask: 'winning-task',
  }), {
    expectedRevision: 1,
    type: 'authoritative-update',
  });
  assert.equal(authoritative.revision, 2);

  const invalidated = markValidationStaleForWrite(root, statePath, requirementsPath);
  assert.equal(invalidated.revision, 3);
  assert.equal(invalidated.currentTask, 'winning-task');
  assert.equal(invalidated.validation.status, 'stale');
  assert.equal(invalidated.validation.digest, null);
  assert.equal(invalidated.artifacts.requirements.status, 'stale');

  console.log(`PASS post-write-cas ${mode}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
