import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runtimePaths } from '../lib/runtime-paths.mjs';
import { bindSession, isSessionLeaseExpired, readSession } from '../lib/sessions.mjs';

const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const sessionsCli = fileURLToPath(new URL('../sessions.mjs', import.meta.url));
const workflowCli = fileURLToPath(new URL('../workflow.mjs', import.meta.url));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-start-change-recovery-'));

try {
  bindSession(root, {
    sessionId: 'expired-session',
    changeId: 'simple-login',
    worktreePath: root,
    controllerRevision: 'test',
  }, { now: 1_000, leaseMs: 1 });
  const existingRequirements = path.join(root, 'harness', 'changes', 'simple-login', 'requirements.md');
  fs.mkdirSync(path.dirname(existingRequirements), { recursive: true });
  fs.writeFileSync(existingRequirements, '# Existing requirements\n\nKeep this evidence.\n');

  const expiredStatus = spawnSync(process.execPath, [workflowCli, 'status', '--json'], {
    cwd: root,
    encoding: 'utf-8',
    shell: false,
    env: {
      ...process.env,
      CLAUDE_SESSION_ID: 'expired-session',
      ENTERPRISE_HARNESS_SESSION_ID: '',
    },
  });
  assert.equal(expiredStatus.status, 2, `${expiredStatus.stdout}\n${expiredStatus.stderr}`);
  assert.doesNotThrow(() => JSON.parse(expiredStatus.stderr), `--json recovery must be valid JSON: ${expiredStatus.stderr}`);
  const recovery = JSON.parse(expiredStatus.stderr);
  assert.equal(recovery.errorCode, 'EH-SESSION-LEASE-023');
  assert.equal(recovery.changeId, 'simple-login');
  assert.equal(recovery.recoveryAction?.args?.at(-2), 'start-change');
  assert.equal(recovery.recoveryAction?.args?.at(-1), 'simple-login');

  const started = spawnSync(recovery.recoveryAction.command, recovery.recoveryAction.args, {
    cwd: root,
    encoding: 'utf-8',
    shell: false,
    env: {
      ...process.env,
      CLAUDE_SESSION_ID: 'expired-session',
      ENTERPRISE_HARNESS_SESSION_ID: '',
    },
  });
  assert.equal(started.status, 0, `${started.stdout}\n${started.stderr}`);
  assert.match(started.stdout, /Active change already bound to session: simple-login/u);
  const rebound = readSession(root, 'expired-session');
  assert.equal(isSessionLeaseExpired(rebound), false, 'idempotent start-change must renew an expired matching binding');
  assert.equal(
    fs.readFileSync(existingRequirements, 'utf-8'),
    '# Existing requirements\n\nKeep this evidence.\n',
    'lease recovery must preserve existing change artifacts',
  );

  const sessionFileLock = `${runtimePaths(root).sessionPath('expired-session')}.lock`;
  fs.mkdirSync(sessionFileLock);
  const contendedUnbind = spawnSync(process.execPath, [sessionsCli, 'unbind'], {
    cwd: root,
    encoding: 'utf-8',
    shell: false,
    env: {
      ...process.env,
      CLAUDE_SESSION_ID: 'expired-session',
      ENTERPRISE_HARNESS_SESSION_ID: '',
    },
  });
  assert.equal(contendedUnbind.status, 2, `${contendedUnbind.stdout}\n${contendedUnbind.stderr}`);
  assert.match(contendedUnbind.stderr, /EH-STATE-LOCK-012/u);
  assert.notEqual(readSession(root, 'expired-session'), null, 'contended unbind must preserve the renewed binding');
  fs.rmSync(sessionFileLock, { recursive: true, force: true });

  const unbound = spawnSync(process.execPath, [sessionsCli, 'unbind'], {
    cwd: root,
    encoding: 'utf-8',
    shell: false,
    env: {
      ...process.env,
      CLAUDE_SESSION_ID: 'expired-session',
      ENTERPRISE_HARNESS_SESSION_ID: '',
    },
  });
  assert.equal(unbound.status, 0, `${unbound.stdout}\n${unbound.stderr}`);
  assert.equal(readSession(root, 'expired-session'), null, 'sessions unbind must remove the current binding');

  console.log(`PASS start-change-session-recovery ${mode}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
