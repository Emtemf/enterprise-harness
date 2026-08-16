import fs from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import process from 'node:process';
import { clearTaskLockChild, updateTaskLockChild } from './lib/task-lock.mjs';

const [lockPath, lockId, intentPath, authorizationPath] = process.argv.slice(2);
const authorizationToken = process.env.ENTERPRISE_HARNESS_TASK_AUTH_TOKEN;
if (!lockPath || !lockId || !intentPath || !authorizationPath || !authorizationToken) {
  process.exit(2);
}

function processGroupAlive(pid) {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

function tokenProcessIds(token) {
  if (process.platform !== 'linux') return [];
  const ids = [];
  let entries;
  try {
    entries = fs.readdirSync('/proc', { withFileTypes: true });
  } catch {
    return ids;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^\d+$/u.test(entry.name)) continue;
    const pid = Number(entry.name);
    if (pid === process.pid) continue;
    try {
      const environment = fs.readFileSync(`/proc/${pid}/environ`);
      if (environment.toString('utf-8').split('\0').includes(
        `ENTERPRISE_HARNESS_TASK_AUTH_TOKEN=${token}`,
      )) ids.push(pid);
    } catch (error) {
      if (!['ENOENT', 'EACCES', 'ESRCH'].includes(error.code)) throw error;
    }
  }
  return ids;
}

function signalTokenProcesses(token, signal) {
  for (const pid of tokenProcessIds(token)) {
    try {
      process.kill(pid, signal);
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  }
}

function waitForProcessGroupExit(pid, token, timeoutMs = 1_000) {
  const deadline = Date.now() + timeoutMs;
  while ((processGroupAlive(pid) || tokenProcessIds(token).length > 0)
    && Date.now() < deadline) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
  }
  if (processGroupAlive(pid) || tokenProcessIds(token).length > 0) {
    try {
      process.kill(-pid, 'SIGKILL');
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
    signalTokenProcesses(token, 'SIGKILL');
  }
}

function terminateDescendants(pid, token) {
  if (process.platform === 'win32') {
    const result = spawnSync('taskkill.exe', ['/pid', String(pid), '/t', '/f'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    if (result.error && result.error.code !== 'ENOENT') throw result.error;
    return;
  }
  try {
    process.kill(-pid, 'SIGTERM');
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
  signalTokenProcesses(token, 'SIGTERM');
  waitForProcessGroupExit(pid, token);
}

const intent = JSON.parse(fs.readFileSync(intentPath, 'utf-8'));
const child = spawn(intent.argv[0], intent.argv.slice(1), {
  cwd: intent.cwd,
  shell: false,
  detached: process.platform !== 'win32',
  env: {
    ...process.env,
    ENTERPRISE_HARNESS_TASK_AUTH: authorizationPath,
    ENTERPRISE_HARNESS_TASK_AUTH_TOKEN: authorizationToken,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
try {
  updateTaskLockChild(lockPath, lockId, child.pid);
} catch (error) {
  terminateDescendants(child.pid, authorizationToken);
  throw error;
}
let stdout = '';
let stderr = '';
child.stdout.on('data', (chunk) => { stdout += chunk; });
child.stderr.on('data', (chunk) => { stderr += chunk; });
let status;
try {
  status = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => resolve({ code, signal }));
  });
} finally {
  try {
    terminateDescendants(child.pid, authorizationToken);
  } finally {
    clearTaskLockChild(lockPath, lockId);
  }
}
process.stdout.write(stdout);
process.stderr.write(stderr);
process.exitCode = status.code ?? 1;
