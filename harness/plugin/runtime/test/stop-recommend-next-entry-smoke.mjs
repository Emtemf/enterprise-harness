import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import * as workflow from '../lib/workflow.mjs';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const mode = process.argv[2];
const stopPath = path.resolve(repoRoot, 'harness/plugin/runtime/hooks/stop.mjs');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
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
  console.error('Usage: node harness/plugin/runtime/test/stop-recommend-next-entry-smoke.mjs <red|green|verify>');
  process.exit(1);
}

function contractHolds() {
  assert(typeof workflow.recommendNextEntry === 'function', 'workflow.recommendNextEntry should be exported');

  const customTddEntry = workflow.recommendNextEntry('tdd', {
    workflow: { stage: 'tdd', nextEntry: '/harness-tdd-custom' },
  });
  assert(
    customTddEntry === '/harness-tdd-custom',
    `Expected workflow.recommendNextEntry to return /harness-tdd-custom, got ${customTddEntry}`,
  );

  const fallbackEntry = workflow.recommendNextEntry('unknown-stage', null);
  assert(
    fallbackEntry === '/harness',
    `Expected workflow.recommendNextEntry to return /harness for unknown stage, got ${fallbackEntry}`,
  );

  const stopText = fs.readFileSync(stopPath, 'utf-8');
  const hasLocalOverride = /function\s+recommendNextEntry\s*\(\s*_stage\s*\)\s*\{\s*return\s+['"]\/harness['"]\s*;?\s*\}/.test(stopText);
  assert(!hasLocalOverride, 'stop.mjs should not contain a local recommendNextEntry returning /harness statically');

  const hasWorkflowImport = /import\s*\{[^}]*recommendNextEntry[^}]*\}\s*from\s*['"][^'"]*workflow\.mjs['"]/.test(stopText);
  assert(hasWorkflowImport, 'stop.mjs should import recommendNextEntry from lib/workflow.mjs');
}

try {
  contractHolds();
} catch (error) {
  if (mode === 'red') {
    pass('Red precondition observed: stop recommend-next-entry contract is currently broken.');
  }
  fail(`Expected stop.mjs to delegate recommendNextEntry to lib/workflow.mjs: ${error.message}`);
}

if (mode === 'red') {
  fail('Red precondition no longer holds.');
}

pass(mode === 'green'
  ? 'Green stop-recommend-next-entry smoke passed.'
  : 'Stop recommend-next-entry verify smoke passed.');
