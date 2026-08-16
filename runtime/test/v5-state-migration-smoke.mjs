import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { migrateV5State } from '../compat/v5-migrate.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-v5-migrate-'));
try {
  const source = {
    schemaVersion: 5,
    revision: 4,
    changeId: 'historic-active',
    lifecycle: 'active',
    impact: { api: 'yes', data: 'no', architecture: 'unknown', rule: 'yes' },
    workflow: { stage: 'tdd' },
    gates: { designApproved: true, redVerified: true },
    validation: { status: 'fresh', digest: 'old', validatedAt: '2026-08-12T00:00:00.000Z' },
  };
  const statePath = path.join(root, 'harness', 'changes', source.changeId, 'state.json');
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, `${JSON.stringify(source, null, 2)}\n`, 'utf-8');

  assert.throws(() => migrateV5State(statePath), /EH-V5-MIGRATE-CONFIRM-019/u);
  const migrated = migrateV5State(statePath, { confirm: true });
  assert.equal(migrated.schemaVersion, 6);
  assert.equal(migrated.revision, 1);
  assert.equal(migrated.stage, 'implement');
  assert.deepEqual(migrated.artifacts.classification.path, `harness/changes/${source.changeId}/classification.json`);
  const classification = JSON.parse(fs.readFileSync(path.join(root, migrated.artifacts.classification.path), 'utf-8'));
  assert.deepEqual(classification.impact, {
    api: 'yes', data: 'no', architecture: 'unknown', rule: 'yes', security: 'unknown',
  });
  assert.equal(migrated.validation.status, 'stale');
  assert.equal(migrated.migration.sourceSchemaVersion, 5);
  assert.equal(source.schemaVersion, 5, 'migration must not mutate source object');

  console.log('PASS v5-state-migration verify');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
