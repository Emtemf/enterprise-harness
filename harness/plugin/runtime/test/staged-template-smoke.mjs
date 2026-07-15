import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const mode = process.argv[2];
const files = {
  requirements: path.join(repoRoot, 'harness', 'templates', 'requirements.md'),
  design: path.join(repoRoot, 'harness', 'templates', 'design.md'),
  tasks: path.join(repoRoot, 'harness', 'templates', 'tasks.md'),
  validation: path.join(repoRoot, 'harness', 'templates', 'validation.md'),
};
const expected = {
  requirements: ['## 歧义评分', '## 当前最弱维度', '## 用户确认'],
  design: ['## Interface Contract', '## Data / SQL Design', '## Architecture Boundary', '## Testing Strategy'],
  tasks: ['**Implementation Order**', '**RED Evidence Point**', '**GREEN Evidence Point**', '**Acceptance Checks**'],
  validation: ['## Clarify / Requirements Confirmation', '## Stage Gate Summary', '## Review Verdicts'],
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
  console.error('Usage: node harness/plugin/runtime/test/staged-template-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const ok = Object.entries(files).every(([key, file]) => expected[key].every((token) => readText(file).includes(token)));

if (mode === 'red') {
  if (!ok) {
    fail('Expected staged workflow templates to include requirements/design/plan/validation mandatory sections');
  }
  pass('Red precondition no longer holds.');
}

if (!ok) {
  fail('Expected staged workflow templates to include requirements/design/plan/validation mandatory sections');
}

pass(mode === 'green' ? 'Green staged-template smoke passed.' : 'Staged-template verify smoke passed.');
