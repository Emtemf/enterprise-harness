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

const sourceRoot = fileURLToPath(new URL('../../', import.meta.url));
const verify = path.join(sourceRoot, 'runtime', 'verify.mjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-verify-v6-completion-'));
const changeId = 'v6-completion';
const changeDir = path.join(root, 'harness', 'changes', changeId);

try {
  fs.mkdirSync(changeDir, { recursive: true });
  fs.writeFileSync(path.join(root, 'harness', 'ACTIVE_CHANGE'), `${changeId}\n`);
  const classification = writeClassificationArtifact(root, changeId, {
    impact: { api: 'no', data: 'no', architecture: 'no', rule: 'no', security: 'no' },
    decision: { tier: 'L1' },
  });
  fs.writeFileSync(path.join(changeDir, 'state.json'), `${JSON.stringify({
    schemaVersion: 6,
    revision: 1,
    changeId,
    lifecycle: 'active',
    stage: 'verify',
    artifacts: { classification },
    validation: { status: 'stale', digest: null, validatedAt: null },
  }, null, 2)}\n`);

  const env = { ...process.env };
  delete env.ENTERPRISE_HARNESS_SESSION_ID;
  delete env.CLAUDE_SESSION_ID;
  const checked = spawnSync(process.execPath, [verify, '--json'], {
    cwd: root,
    encoding: 'utf-8',
    shell: false,
    env,
  });
  assert.notEqual(checked.status, 0, 'development verify must block incomplete v6 completion');
  const result = JSON.parse(checked.stdout);
  assert.equal(result.scope, 'development');
  assert.equal(result['completion-verdict'], 'block');
  assert.ok(
    result.contractChecks.problems.some((problem) => (
      problem.startsWith('completion:EH-COMPLETION-FRESHNESS-103:')
      || problem.startsWith('completion:EH-AUDIT-')
    )),
    `v6 completion evidence was skipped: ${result.contractChecks.problems.join('; ')}`,
  );

  console.log(`PASS verify-v6-completion-gate ${mode}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
