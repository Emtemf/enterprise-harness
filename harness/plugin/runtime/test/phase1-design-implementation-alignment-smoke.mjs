import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const mode = process.argv[2];
const taskBriefPath = path.join(repoRoot, 'harness', 'templates', 'task-brief.md');
const phase1Path = path.join(repoRoot, 'harness', 'specs', 'claude-code-only-phase1.md');
const blueprintPath = path.join(repoRoot, 'harness', 'specs', 'claude-code-only-phase1-blueprint.md');

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
  console.error('Usage: node harness/plugin/runtime/test/phase1-design-implementation-alignment-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const taskBrief = readText(taskBriefPath);
const phase1 = readText(phase1Path);
const blueprint = readText(blueprintPath);
const ok = taskBrief.includes('## Test-first Order')
  && taskBrief.includes('## RED Evidence Point')
  && taskBrief.includes('## GREEN Evidence Point')
  && taskBrief.includes('## Project-native Build Command')
  && blueprint.includes('execution-readiness / freeze-slice')
  && blueprint.includes('api-consistency-reviewer')
  && phase1.includes('execution-readiness / freeze-slice');

if (mode === 'red') {
  if (!ok) {
    fail('Expected phase1 design docs and task brief template to acknowledge current implementation reality');
  }
  pass('Red precondition no longer holds.');
}

if (!ok) {
  fail('Expected phase1 design docs and task brief template to acknowledge current implementation reality');
}

pass(mode === 'green' ? 'Green phase1 design-implementation alignment smoke passed.' : 'Phase1 design-implementation alignment smoke passed.');
