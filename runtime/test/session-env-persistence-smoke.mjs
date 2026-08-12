import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { persistSessionId } from '../lib/sessions.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-session-env-'));
const envFile = path.join(root, 'claude.env');
try {
  const env = { CLAUDE_ENV_FILE: envFile };
  const first = persistSessionId('session-from-hook', env);
  assert.equal(first.ok, true);
  assert.equal(first.status, 'persisted');
  assert.equal(fs.readFileSync(envFile, 'utf-8'), "export ENTERPRISE_HARNESS_SESSION_ID='session-from-hook'\n");

  const second = persistSessionId('session-from-hook', env);
  assert.equal(second.status, 'already-present');
  assert.equal(fs.readFileSync(envFile, 'utf-8').split('\n').filter(Boolean).length, 1);

  assert.throws(
    () => persistSessionId('../unsafe', env),
    /sessionId must be a safe identifier/,
  );
  assert.equal(persistSessionId('session-without-file', {}).status, 'not-configured');
  console.log('PASS session-env-persistence verify');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
