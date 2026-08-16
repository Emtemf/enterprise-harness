import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-hook-health-'));
try {
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: root }).status, 0);
  const module = await import('../lib/hook-health.mjs');
  const now = 1_700_000_000_000;
  const health = module.recordHookHealth(root, {
    sessionId: 'session-health',
    hook: 'SessionStart',
    controllerRevision: '0.6.0-dev',
    now,
    ttlMs: 60_000,
  });
  assert.equal(health.status, 'fresh');
  assert.deepEqual(module.evaluateHookHealth(root, 'session-health', { now: now + 30_000 }), {
    ok: true,
    mode: 'enforced',
    reason: 'fresh SessionStart hook-health receipt',
    receipt: health,
  });
  const stale = module.evaluateHookHealth(root, 'session-health', { now: now + 60_001 });
  assert.equal(stale.ok, false);
  assert.equal(stale.mode, 'block');
  assert.match(stale.reason, /stale/u);
  const missing = module.evaluateHookHealth(root, 'missing-session', { now });
  assert.equal(missing.ok, false);
  assert.equal(missing.mode, 'block');
  assert.match(missing.reason, /missing/u);

  const sourceRoot = fileURLToPath(new URL('../../', import.meta.url));
  const sessionStart = fs.readFileSync(path.join(sourceRoot, 'hooks', 'scripts', 'session-start.mjs'), 'utf-8');
  assert.match(sessionStart, /recordHookHealth/u, 'SessionStart must persist the hook-health receipt');
  console.log(`PASS hook-health ${mode}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
