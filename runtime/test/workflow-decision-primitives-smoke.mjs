import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const mode = process.argv[2];
const runtimePath = path.join(repoRoot, 'runtime', 'workflow.mjs');
const libPath = path.join(repoRoot, 'runtime', 'lib', 'workflow.mjs');

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
  console.error('Usage: node runtime/test/workflow-decision-primitives-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const runtime = readText(runtimePath);
const lib = readText(libPath);
const ok = lib.includes('export function applyScopeConfirmationDecision')
  && lib.includes('export function applyExecutionReadinessDecision')
  && runtime.includes('applyScopeConfirmationDecision')
  && runtime.includes('applyExecutionReadinessDecision')
  && !runtime.includes("data.workflow.userConfirmedScope = true;")
  && !runtime.includes("data.state = 'DESIGN_APPROVED';");

if (mode === 'red') {
  if (!ok) {
    fail('Expected workflow decision mutations to move from workflow runner into workflow primitives');
  }
  pass('Red precondition no longer holds.');
}

if (!ok) {
  fail('Expected workflow decision mutations to move from workflow runner into workflow primitives');
}

pass(mode === 'green' ? 'Green workflow decision primitives smoke passed.' : 'Workflow decision primitives verify smoke passed.');
