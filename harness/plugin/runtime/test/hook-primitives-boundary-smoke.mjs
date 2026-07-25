import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const mode = process.argv[2];
const specPath = path.join(repoRoot, 'harness', 'specs', 'hook-adapter-and-primitives.md');
const workflowPath = path.join(repoRoot, 'harness', 'plugin', 'runtime', 'lib', 'workflow.mjs');
const statusSummaryPath = path.join(repoRoot, 'harness', 'plugin', 'runtime', 'lib', 'status-summary.mjs');
const sessionStartPath = path.join(repoRoot, 'harness', 'plugin', 'runtime', 'hooks', 'session-start.mjs');
const stopPath = path.join(repoRoot, 'harness', 'plugin', 'runtime', 'hooks', 'stop.mjs');

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
  console.error('Usage: node harness/plugin/runtime/test/hook-primitives-boundary-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const spec = readText(specPath);
const workflow = readText(workflowPath);
const statusSummary = readText(statusSummaryPath);
const sessionStart = readText(sessionStartPath);
const stopText = readText(stopPath);
const ok = spec.includes('Hook Adapter Layer')
  && spec.includes('Workflow Primitives Layer')
  && workflow.includes('export function inferWorkflowStage')
  && workflow.includes('export function recommendNextEntry')
  && statusSummary.includes('buildStatusSummary')
  && sessionStart.includes('buildStatusSummary')
  && (stopText.includes('recommendNextEntry') || stopText.includes('buildRecoveryGuidance'));

if (mode === 'red') {
  if (!ok) {
    fail('Expected hook adapter and workflow primitives boundary to stay explicit and testable');
  }
  pass('Red precondition no longer holds.');
}

if (!ok) {
  fail('Expected hook adapter and workflow primitives boundary to stay explicit and testable');
}

pass(mode === 'green' ? 'Green hook-primitives boundary smoke passed.' : 'Hook-primitives boundary verify smoke passed.');
