import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { writeClassificationV2Fixture as writeClassificationArtifact } from './classification-v2-fixture.mjs';

const mode = process.argv[2] || 'verify';
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const lifecycle = path.join(sourceRoot, 'runtime', 'lifecycle.mjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-abandon-transaction-'));
const changeId = 'abandon-transaction';
const changeDir = path.join(root, 'harness', 'changes', changeId);
const statePath = path.join(changeDir, 'state.json');
const {
  ENTERPRISE_HARNESS_SESSION_ID: _enterpriseHarnessSessionId,
  CLAUDE_SESSION_ID: _claudeSessionId,
  ...unboundEnv
} = process.env;

try {
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: root }).status, 0);
  fs.mkdirSync(changeDir, { recursive: true });
  const classification = writeClassificationArtifact(root, changeId, {
    impact: { api: 'no', data: 'no', architecture: 'no', rule: 'no', security: 'no' },
    decision: { tier: 'L1' },
  });
  fs.writeFileSync(statePath, `${JSON.stringify({
    schemaVersion: 6,
    revision: 1,
    changeId,
    lifecycle: 'active',
    stage: 'clarify',
    artifacts: { classification },
    validation: { status: 'stale', digest: null, validatedAt: null },
  }, null, 2)}\n`);
  fs.writeFileSync(path.join(root, 'harness', 'archive'), 'not-a-directory\n');

  const result = spawnSync(
    process.execPath,
    [lifecycle, 'abandon', changeId, 'transaction regression'],
    {
      cwd: root,
      encoding: 'utf-8',
      shell: false,
      env: unboundEnv,
    },
  );
  assert.notEqual(result.status, 0, 'abandon must fail when archive root cannot be created');
  assert.equal(fs.existsSync(changeDir), true, 'failed move must leave the active change in place');
  const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
  assert.equal(state.lifecycle, 'active', 'failed move must roll back lifecycle');
  assert.equal(state.blocker, undefined, 'failed move must roll back abandon blocker');

  console.log(`PASS lifecycle-abandon-transaction ${mode}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
