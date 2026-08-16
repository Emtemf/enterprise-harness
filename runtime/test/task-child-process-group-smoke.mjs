import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { withRecoverableTaskLock } from '../lib/task-lock.mjs';

const mode = process.argv[2] || 'verify';
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-task-child-'));
const lockPath = path.join(root, 'task-execution');
const intentPath = path.join(root, 'intent.json');
const authorizationPath = path.join(root, 'authorization.json');
const targetPath = path.join(root, 'detached-write.txt');
const childPath = path.join(root, 'child.mjs');
const wrapperPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'task-child.mjs');

try {
  fs.writeFileSync(childPath, [
    "import { spawn } from 'node:child_process';",
    "const [target] = process.argv.slice(2);",
    "const script = `setTimeout(() => require('node:fs').writeFileSync(${JSON.stringify(target)}, 'late'), 500);`;",
    `const descendant = spawn(process.execPath, ['-e', script], { detached: ${process.platform === 'linux'}, stdio: 'ignore' });`,
    'descendant.unref();',
  ].join('\n'));
  fs.writeFileSync(intentPath, `${JSON.stringify({
    intentVersion: 1,
    cwd: root,
    argv: [process.execPath, childPath, targetPath],
  })}\n`);
  fs.writeFileSync(authorizationPath, '{}\n');

  let result;
  withRecoverableTaskLock(lockPath, ({ lockId }) => {
    result = spawnSync(process.execPath, [
      wrapperPath,
      lockPath,
      lockId,
      intentPath,
      authorizationPath,
    ], {
      cwd: root,
      encoding: 'utf-8',
      env: {
        ...process.env,
        ENTERPRISE_HARNESS_TASK_AUTH_TOKEN: 'test-token',
      },
    });
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 700);
  assert.equal(fs.existsSync(targetPath), false, 'detached descendants must not outlive task-run');
  console.log(`PASS task-child-process-group ${mode}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
