import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const mode = process.argv[2];
const files = {
  currentChangeState: path.join(repoRoot, 'harness', 'templates', 'state.json'),
  workflowHelper: path.join(repoRoot, 'runtime', 'lib', 'workflow.mjs'),
  checks: path.join(repoRoot, 'runtime', 'lib', 'checks.mjs'),
};
const expected = {
  currentChangeState: ['"schemaVersion": 6', '"lifecycle": "active"', '"stage": "clarify"', '"executionStrategy": null'],
  workflowHelper: ['inferWorkflowStage', 'recommendNextEntry', 'classificationFor', 'buildWorkflowResult'],
  checks: ['v6Stages', 'isV6', "'schemaVersion','changeId','lifecycle','stage'"],
};

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
  console.error('Usage: node runtime/test/workflow-state-consumption-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const ok = Object.entries(files).every(([key, file]) => expected[key].every((token) => readText(file).includes(token)));

if (mode === 'red') {
  if (!ok) {
    fail('Expected runtime helpers and checks to consume machine-readable workflow state');
  }
  pass('Red precondition no longer holds.');
}

if (!ok) {
  fail('Expected runtime helpers and checks to consume machine-readable workflow state');
}

pass(mode === 'green' ? 'Green workflow-state-consumption smoke passed.' : 'Workflow-state-consumption verify smoke passed.');
