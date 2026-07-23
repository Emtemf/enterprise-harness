import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const preWritePath = path.join(repoRoot, 'harness', 'plugin', 'runtime', 'hooks', 'pre-write.mjs');
const fixturesRoot = path.join(repoRoot, 'harness', 'plugin', 'runtime', 'test', 'fixtures');
const mode = process.argv[2];

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === '.codegraph') continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

function createTempRepo() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-hardening-red-task-'));
  const repoCopy = path.join(tempRoot, 'repo');
  copyDir(repoRoot, repoCopy);
  return { tempRoot, repoCopy };
}

function runPreWrite(cwd, filePath) {
  return spawnSync('node', [preWritePath], {
    cwd,
    encoding: 'utf-8',
    input: JSON.stringify({ tool_input: { file_path: filePath } }),
  });
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function pass(message) {
  console.log(message);
  process.exit(0);
}

if (!['red', 'green', 'verify'].includes(mode)) {
  console.error('Usage: node harness/plugin/runtime/test/gate-hardening-red-task-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const { tempRoot, repoCopy } = createTempRepo();
try {
  fs.rmSync(path.join(repoCopy, 'harness', 'changes'), { recursive: true, force: true });

  const fixtureChangeId = 'red-task-smoke-fixture';
  const activePath = path.join(repoCopy, 'harness', 'ACTIVE_CHANGE');
  const statePath = path.join(repoCopy, 'harness', 'changes', fixtureChangeId, 'state.json');
  const fixtureState = readJson(path.join(fixturesRoot, 'red-task-missing-proof', 'state.json'));
  fs.writeFileSync(activePath, `${fixtureChangeId}\n`, 'utf-8');

  const target = path.join(repoCopy, 'reference-service', 'src', 'main', 'java', 'com', 'example', 'orders', 'interfaces', 'api', 'OrderCancellationController.java');
  const blockedState = {
    ...fixtureState,
    changeId: fixtureChangeId,
  };
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  writeJson(statePath, blockedState);
  const blockedResult = runPreWrite(repoCopy, target);
  const blockedOutput = `${blockedResult.stdout || ''}${blockedResult.stderr || ''}`;

  const passingState = {
    ...blockedState,
    gates: {
      ...blockedState.gates,
      redTask: 'Task 4 smoke',
      redEvidenceRef: 'task-4-red-proof',
    },
  };
  writeJson(statePath, passingState);
  const passingResult = runPreWrite(repoCopy, target);
  const ok = blockedResult.status === 2
    && blockedOutput.includes('currentTask-scoped red verification')
    && passingResult.status === 0;

  if (mode === 'red') {
    if (!ok) {
      fail('Expected production/openapi writes to require currentTask-scoped red verification');
    }
    pass('Red precondition no longer holds.');
  }

  if (!ok) {
    fail('Expected production/openapi writes to require currentTask-scoped red verification');
  }

  pass(mode === 'green' ? 'Green gate-hardening red-task smoke passed.' : 'Gate-hardening red-task verify smoke passed.');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
