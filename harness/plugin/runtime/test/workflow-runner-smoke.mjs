import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const workflowPath = path.join(repoRoot, 'harness', 'plugin', 'runtime', 'workflow.mjs');
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

function createTempRepo() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-runner-smoke-'));
  const repoCopy = path.join(tempRoot, 'repo');
  copyDir(repoRoot, repoCopy);
  return { tempRoot, repoCopy };
}

function runWorkflow(cwd, args) {
  return spawnSync('node', [workflowPath, ...args], {
    cwd,
    encoding: 'utf-8',
  });
}

function parseJson(result) {
  try {
    return JSON.parse(result.stdout);
  } catch {
    return null;
  }
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
  console.error('Usage: node harness/plugin/runtime/test/workflow-runner-smoke.mjs <red|green|verify>');
  process.exit(1);
}

let tempRoot = null;

function cleanup() {
  if (tempRoot && fs.existsSync(tempRoot)) {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

process.on('exit', cleanup);

const { tempRoot: tr, repoCopy } = createTempRepo();
tempRoot = tr;

try {
  const changeId = 'test-runner-smoke';
  const changeDir = path.join(repoCopy, 'harness', 'changes', changeId);

  const runResult = runWorkflow(repoCopy, ['run', changeId, 'harness-governance', 'L3', 'runner-smoke']);
  const runJson = parseJson(runResult);
  const resumeResult = runWorkflow(repoCopy, ['resume', changeId]);
  const resumeJson = parseJson(resumeResult);
  const statusResult = runWorkflow(repoCopy, ['status', changeId, '--json']);
  const statusJson = parseJson(statusResult);
  const eventLogPath = path.join(repoCopy, 'harness', 'changes', changeId, 'evidence', 'workflow-events.jsonl');
  const eventLogExists = fs.existsSync(eventLogPath) && fs.readFileSync(eventLogPath, 'utf-8').includes('"type":"resume"');
  const ok =
    runResult.status === 0 &&
    resumeResult.status === 0 &&
    statusResult.status === 0 &&
    runJson?.changeId === changeId &&
    runJson?.status &&
    resumeJson?.nextAction &&
    statusJson?.stage &&
    statusJson?.currentGap &&
    Object.prototype.hasOwnProperty.call(statusJson, 'pendingDecision') &&
    eventLogExists;

  if (mode === 'red') {
    if (!ok) {
      fail('Expected workflow runner to create/resume/status a change with machine-readable lifecycle output and event log evidence');
    }
    pass('Red precondition no longer holds.');
  }

  if (!ok) {
    fail('Expected workflow runner to create/resume/status a change with machine-readable lifecycle output and event log evidence');
  }

  pass(mode === 'green' ? 'Green workflow-runner smoke passed.' : 'Workflow-runner verify smoke passed.');
} finally {
  cleanup();
}
