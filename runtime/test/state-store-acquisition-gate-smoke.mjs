import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { withFileLock, withFileLockWait } from '../lib/state-store.mjs';

const [, , mode = 'verify', workerRoot] = process.argv;
if (mode === 'worker') {
  const target = path.join(workerRoot, 'serialized-state.json');
  withFileLockWait(target, () => {
    const state = JSON.parse(fs.readFileSync(target, 'utf-8'));
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
    fs.writeFileSync(target, `${JSON.stringify({ revision: state.revision + 1 })}\n`);
  }, { timeoutMs: 10_000, retryMs: 2 });
  process.exit(0);
}
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'enterprise-harness-acquisition-gate-'));
const target = path.join(root, 'serialized-state.json');
const script = fileURLToPath(import.meta.url);
const gateRef = `refs/enterprise-harness/acquisition-gates/${createHash('sha256').update(path.resolve(target)).digest('hex')}`;

function runWorker() {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script, 'worker', root], {
      cwd: root,
      encoding: 'utf-8',
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.on('close', (status) => resolve({ status, output }));
  });
}

function looseObjectCount() {
  const result = spawnSync('git', ['count-objects', '-v'], {
    cwd: root,
    encoding: 'utf-8',
    shell: false,
  });
  assert.equal(result.status, 0, result.stderr);
  return Number(result.stdout.match(/^count: (\d+)$/mu)?.[1]);
}

try {
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: root }).status, 0);
  fs.writeFileSync(target, '{"revision":0}\n');
  const deadOwner = `${JSON.stringify({
    version: 1,
    token: 'sigkill-owner',
    pid: 2_147_483_647,
    hostname: os.hostname(),
    acquiredAt: '2026-08-01T00:00:00.000Z',
  })}\n`;
  const ownerObject = spawnSync('git', ['hash-object', '-w', '--stdin'], {
    cwd: root,
    input: deadOwner,
    encoding: 'utf-8',
    shell: false,
  });
  assert.equal(ownerObject.status, 0, ownerObject.stderr);
  assert.equal(spawnSync('git', ['update-ref', gateRef, ownerObject.stdout.trim()], { cwd: root }).status, 0);
  fs.mkdirSync(`${target}.lock`, { recursive: true });
  fs.writeFileSync(path.join(`${target}.lock`, 'owner.json'), deadOwner);

  const results = await Promise.all(Array.from({ length: 12 }, () => runWorker()));
  for (const result of results) {
    const residualRef = spawnSync('git', ['rev-parse', '--verify', gateRef], {
      cwd: root,
      encoding: 'utf-8',
      shell: false,
    });
    assert.equal(result.status, 0, `${result.output}\nresidualGateRef=${residualRef.stdout || 'missing'}`);
  }
  assert.equal(JSON.parse(fs.readFileSync(target, 'utf-8')).revision, 12);
  assert.notEqual(
    spawnSync('git', ['rev-parse', '--verify', gateRef], { cwd: root }).status,
    0,
    'recovered acquisition ref must not remain after contention',
  );
  assert.equal(fs.existsSync(`${target}.lock`), false, 'target lock must not remain after contention');

  const objectsBeforeLiveWait = looseObjectCount();
  fs.mkdirSync(`${target}.lock`, { recursive: true });
  fs.writeFileSync(path.join(`${target}.lock`, 'owner.json'), `${JSON.stringify({
    version: 1,
    token: 'live-local-owner',
    pid: process.pid,
    hostname: os.hostname(),
    acquiredAt: new Date().toISOString(),
  })}\n`);
  assert.throws(
    () => withFileLockWait(target, () => {}, { timeoutMs: 40, retryMs: 2 }),
    /EH-STATE-LOCK-012/u,
    'waiting behind a live target must not enter recovery coordination',
  );
  assert.equal(
    looseObjectCount(),
    objectsBeforeLiveWait,
    'ordinary live-lock retries must not create unreferenced Git owner objects',
  );
  fs.rmSync(`${target}.lock`, { recursive: true, force: true });

  const foreignOwner = `${JSON.stringify({
    version: 1,
    token: 'foreign-gate-owner',
    pid: 2_147_483_647,
    hostname: 'different-host.example.invalid',
    acquiredAt: '2020-01-01T00:00:00.000Z',
  })}\n`;
  const foreignObject = spawnSync('git', ['hash-object', '-w', '--stdin'], {
    cwd: root,
    input: foreignOwner,
    encoding: 'utf-8',
    shell: false,
  });
  assert.equal(foreignObject.status, 0, foreignObject.stderr);
  assert.equal(spawnSync('git', ['update-ref', gateRef, foreignObject.stdout.trim()], { cwd: root }).status, 0);
  fs.mkdirSync(`${target}.lock`, { recursive: true });
  fs.writeFileSync(path.join(`${target}.lock`, 'owner.json'), deadOwner);
  assert.throws(
    () => withFileLock(target, () => {}),
    /EH-STATE-LOCK-159/u,
    'foreign-host acquisition ownership must never be replaced by age',
  );
  fs.rmSync(`${target}.lock`, { recursive: true, force: true });
  assert.equal(spawnSync('git', ['update-ref', '-d', gateRef], { cwd: root }).status, 0);
  console.log(`PASS state-store-acquisition-gate ${mode}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
