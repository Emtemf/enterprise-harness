import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseTaskChildOutcome } from '../lib/task-child-outcome.mjs';

const mode = process.argv[2] || 'verify';
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const script = path.join(root, 'runtime', 'task-child.mjs');

function runChild({ argv }) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-task-child-'));
  const lockPath = path.join(temp, 'task-execution');
  const lockId = 'lock-1';
  const intentPath = path.join(temp, 'intent.json');
  const authorizationPath = path.join(temp, 'auth.json');
  fs.mkdirSync(path.dirname(`${lockPath}.lock`), { recursive: true });
  fs.writeFileSync(`${lockPath}.lock`, `${JSON.stringify({ lockId, pid: process.pid, processIdentity: 'test' })}\n`, 'utf-8');
  fs.writeFileSync(intentPath, JSON.stringify({ argv, cwd: temp }, null, 2) + '\n', 'utf-8');
  fs.writeFileSync(authorizationPath, '{}\n', 'utf-8');
  const child = spawnSync(process.execPath, [script, lockPath, lockId, intentPath, authorizationPath], {
    cwd: temp,
    encoding: 'utf-8',
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      ENTERPRISE_HARNESS_TASK_AUTH_TOKEN: 'token-1',
    },
  });
  const outcome = parseTaskChildOutcome(child.output?.[3]);
  fs.rmSync(temp, { recursive: true, force: true });
  return { child, outcome };
}

const spawnError = runChild({ argv: ['__definitely_missing_command__'] });
assert.equal(spawnError.outcome.kind, 'spawn-error');
assert.match(spawnError.outcome.spawnError, /ENOENT|UNKNOWN/u);
assert.equal(spawnError.child.status, 2);

const signal = runChild({ argv: [process.execPath, '-e', 'process.kill(process.pid, "SIGTERM")'] });
// Windows does not support POSIX signals: SIGTERM becomes a clean exit instead.
// Accept either outcome to keep the contract smoke cross-platform.
assert.ok(
  signal.outcome.kind === 'signal' || signal.outcome.kind === 'exit',
  `signal or exit outcome expected, got ${signal.outcome.kind}`,
);
// Linux: wrapper exits 2 on signal; Windows: process exits with its own code (typically 1).
assert.ok(
  signal.child.status === 2 || signal.child.status === 1,
  `expected exit 2 (signal) or 1 (Windows fallback), got ${signal.child.status}`,
);

console.log(`PASS task-child-contract ${mode}`);
