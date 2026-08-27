import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { acquireChangeWriteLease, withChangeTransaction } from '../lib/state-store.mjs';

const mode = process.argv[2] || 'verify';
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);
const sourceRoot = fileURLToPath(new URL('../../', import.meta.url));
const hook = path.join(sourceRoot, 'hooks', 'scripts', 'post-write-release.mjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'enterprise-harness-post-failure-'));
const changeId = 'post-failure-change';

function invoke(input) {
  return spawnSync(process.execPath, [hook], {
    cwd: root,
    input,
    encoding: 'utf-8',
    shell: false,
  });
}

try {
  const changeDir = path.join(root, 'harness', 'changes', changeId);
  fs.mkdirSync(changeDir, { recursive: true });
  fs.writeFileSync(path.join(root, 'harness', 'ACTIVE_CHANGE'), `${changeId}\n`);
  fs.writeFileSync(path.join(changeDir, 'state.json'), `${JSON.stringify({
    schemaVersion: 6,
    revision: 1,
    changeId,
    lifecycle: 'active',
    stage: 'clarify',
    artifacts: { classification: null },
    validation: { status: 'missing', digest: null, validatedAt: null },
  })}\n`);

  for (const invalid of ['', '{}', '{not-json}']) {
    const result = invoke(invalid);
    assert.equal(result.status, 2, `fail-closed PostToolUseFailure accepted ${JSON.stringify(invalid)}`);
    assert.match(result.stderr, /EH-CHANGE-WRITE-LEASE-153/u);
  }

  const toolUseId = 'failed-write-tool';
  acquireChangeWriteLease(root, changeId, toolUseId);
  assert.throws(() => withChangeTransaction(root, changeId, () => null), /EH-CHANGE-WRITE-LEASE-151/u);
  const released = invoke(JSON.stringify({
    hook_event_name: 'PostToolUseFailure',
    tool_name: 'Write',
    tool_use_id: toolUseId,
    tool_input: { file_path: path.join(changeDir, 'requirements.md') },
    cwd: root,
  }));
  assert.equal(released.status, 0, released.stderr);
  assert.equal(withChangeTransaction(root, changeId, () => 'recovered'), 'recovered');

  console.log(`PASS post-write-failure-release ${mode}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
