import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const mode = process.argv[2];
const files = {
  stagedWorkflow: path.join(repoRoot, 'harness', 'specs', 'staged-workflow.md'),
  stateTemplate: path.join(repoRoot, 'harness', 'templates', 'state.json'),
};
const expected = {
  stagedWorkflow: ['`workflow`', '`clarifyReady`', '`userConfirmedScope`', '`planReady`', '`tddStatus`', '`nextEntry`'],
  stateTemplate: ['"workflow"', '"clarifyReady"', '"userConfirmedScope"', '"planReady"', '"tddStatus"', '"nextEntry"'],
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
  console.error('Usage: node harness/plugin/runtime/test/workflow-state-contract-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const ok = Object.entries(files).every(([key, file]) => expected[key].every((token) => readText(file).includes(token)));

if (mode === 'red') {
  if (!ok) {
    fail('Expected workflow state contract to define machine-readable workflow fields');
  }
  pass('Red precondition no longer holds.');
}

if (!ok) {
  fail('Expected workflow state contract to define machine-readable workflow fields');
}

pass(mode === 'green' ? 'Green workflow-state contract smoke passed.' : 'Workflow-state contract verify smoke passed.');
