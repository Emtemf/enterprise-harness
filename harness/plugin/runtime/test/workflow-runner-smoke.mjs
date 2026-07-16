import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const workflowPath = path.join(repoRoot, 'harness', 'plugin', 'runtime', 'workflow.mjs');
const mode = process.argv[2];

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

const changeId = 'clarify-first-staged-orchestrator';
const runResult = runWorkflow(repoRoot, ['run', changeId, 'harness-governance', 'L3', 'runner-smoke']);
const runJson = parseJson(runResult);
const resumeResult = runWorkflow(repoRoot, ['resume', changeId]);
const resumeJson = parseJson(resumeResult);
const statusResult = runWorkflow(repoRoot, ['status', changeId, '--json']);
const statusJson = parseJson(statusResult);
const ok =
  runResult.status === 0 &&
  resumeResult.status === 0 &&
  statusResult.status === 0 &&
  runJson?.changeId === changeId &&
  resumeJson?.nextAction &&
  statusJson?.stage &&
  statusJson?.currentGap;

if (mode === 'red') {
  if (!ok) {
    fail('Expected workflow runner to create/resume/status a change with machine-readable lifecycle output');
  }
  pass('Red precondition no longer holds.');
}

if (!ok) {
  fail('Expected workflow runner to create/resume/status a change with machine-readable lifecycle output');
}

pass(mode === 'green' ? 'Green workflow-runner smoke passed.' : 'Workflow-runner verify smoke passed.');
