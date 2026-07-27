import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const mode = process.argv[2];
const workflowRuntimePath = path.join(repoRoot, 'harness', 'plugin', 'runtime', 'workflow.mjs');
const workflowLibPath = path.join(repoRoot, 'harness', 'plugin', 'runtime', 'lib', 'workflow.mjs');

function readText(file) {
  return fs.readFileSync(file, 'utf-8');
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
  console.error('Usage: node harness/plugin/runtime/test/workflow-primitives-boundary-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const runtimeText = readText(workflowRuntimePath);
const libText = readText(workflowLibPath);
const ok = libText.includes('export function inferPendingDecision')
  && libText.includes('export function inferRunnerStatus')
  && libText.includes('export function buildWorkflowResult')
  && runtimeText.includes("import {")
  && runtimeText.includes('buildWorkflowResult')
  && !runtimeText.includes('function inferPendingDecision(')
  && !runtimeText.includes('function inferRunnerStatus(')
  && !runtimeText.includes('function buildWorkflowResult(');

if (mode === 'red') {
  if (!ok) {
    fail('Expected workflow runner to consume pendingDecision/runnerStatus/result builders from workflow primitives');
  }
  pass('Red precondition no longer holds.');
}

if (!ok) {
  fail('Expected workflow runner to consume pendingDecision/runnerStatus/result builders from workflow primitives');
}

pass(mode === 'green' ? 'Green workflow primitives boundary smoke passed.' : 'Workflow primitives boundary verify smoke passed.');
