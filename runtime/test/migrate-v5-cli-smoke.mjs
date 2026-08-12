import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-migrate-v5-cli-'));
try {
  const statePath = path.join(fixture, 'harness', 'changes', 'cli-v5', 'state.json');
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, `${JSON.stringify({
    schemaVersion: 5,
    revision: 1,
    changeId: 'cli-v5',
    lifecycle: 'active',
    impact: { api: 'unknown', data: 'unknown', architecture: 'unknown', rule: 'unknown' },
    workflow: { stage: 'clarify' },
  })}\n`, 'utf-8');
  const invoke = (args) => spawnSync(process.execPath, [path.join(root, 'runtime', 'cli.mjs'), 'migrate-v5', ...args], {
    cwd: fixture, encoding: 'utf-8', shell: false,
  });
  const rejected = invoke(['cli-v5']);
  assert.equal(rejected.status, 2);
  assert.match(rejected.stderr, /EH-V5-MIGRATE-CONFIRM-019/u);
  const migrated = invoke(['cli-v5', '--confirm']);
  assert.equal(migrated.status, 0, migrated.stderr);
  assert.equal(JSON.parse(fs.readFileSync(statePath, 'utf-8')).schemaVersion, 6);
  console.log('PASS migrate-v5-cli verify');
} finally {
  fs.rmSync(fixture, { recursive: true, force: true });
}
