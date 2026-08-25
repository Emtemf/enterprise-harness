import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { updateChangeState } from '../core/change-state.mjs';
import { writeClassificationV2Fixture as writeClassificationArtifact } from './classification-v2-fixture.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-v6-state-'));
try {
  const changeId = 'v6-state';
  const changeDir = path.join(root, 'harness', 'changes', changeId);
  const statePath = path.join(changeDir, 'state.json');
  fs.mkdirSync(changeDir, { recursive: true });
  const classificationReference = writeClassificationArtifact(root, changeId, {
    impact: { api: 'unknown', data: 'unknown', architecture: 'unknown', rule: 'unknown', security: 'unknown' },
  });
  fs.writeFileSync(statePath, `${JSON.stringify({
    schemaVersion: 6,
    revision: 1,
    changeId,
    lifecycle: 'active',
    stage: 'clarify',
    artifacts: { classification: classificationReference },
    validation: { status: 'missing', digest: null, validatedAt: null },
  }, null, 2)}\n`, 'utf-8');

  const original = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
  const updated = updateChangeState(root, changeId, (current) => ({
    ...current,
    stage: 'design',
    artifacts: { ...current.artifacts, requirements: { digest: 'abc' } },
  }), { type: 'stage-advanced' });

  assert.equal(updated.revision, 2);
  assert.equal(updated.stage, 'design');
  assert.deepEqual(original, {
    schemaVersion: 6,
    revision: 1,
    changeId,
    lifecycle: 'active',
    stage: 'clarify',
    artifacts: { classification: classificationReference },
    validation: { status: 'missing', digest: null, validatedAt: null },
  }, 'mutator must not mutate the caller\'s input');

  const persisted = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
  assert.equal(persisted.revision, 2);
  assert.equal(persisted.stage, 'design');
  const events = fs.readFileSync(path.join(changeDir, 'evidence', 'workflow-events.jsonl'), 'utf-8')
    .trim().split(/\r?\n/u).map(JSON.parse);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'stage-advanced');
  assert.equal(events[0].revision, 2);

  assert.throws(
    () => updateChangeState(root, changeId, (current) => ({ ...current, stage: 'route' }), {
      expectedRevision: 1,
      type: 'stale-write',
    }),
    /EH-STATE-REVISION-014/u,
  );

  assert.throws(
    () => updateChangeState(root, changeId, (current) => {
      fs.writeFileSync(statePath, `${JSON.stringify({ ...current, revision: current.revision + 1, stage: 'plan' }, null, 2)}\n`, 'utf-8');
      return { ...current, stage: 'verify' };
    }),
    /EH-STATE-REVISION-014/u,
    'a state revision changed between check and use must not accept the stale mutation',
  );

  fs.writeFileSync(statePath, `${JSON.stringify({ ...persisted, changeId: 'different-change' }, null, 2)}\n`, 'utf-8');
  assert.throws(
    () => updateChangeState(root, changeId, (current) => ({ ...current, stage: 'verify' })),
    /EH-STATE-IDENTITY-019/u,
  );

  console.log('PASS v6-change-state verify');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
