import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const mode = process.argv[2];
const changeTemplatePath = path.join(repoRoot, 'harness', 'templates', 'change.md');
const phase1Path = path.join(repoRoot, 'harness', 'specs', 'claude-code-only-phase1.md');

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
  console.error('Usage: node harness/plugin/runtime/test/router-score-contract-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const changeTemplate = readText(changeTemplatePath);
const phase1 = readText(phase1Path);
const ok = changeTemplate.includes('### Router 评分')
  && changeTemplate.includes('Scope complexity')
  && changeTemplate.includes('Impact breadth')
  && changeTemplate.includes('Unknowns / ambiguity')
  && changeTemplate.includes('API / data risk')
  && changeTemplate.includes('Test / rollback complexity')
  && phase1.includes('统一 route 评分与 tier 判定说明');

if (mode === 'red') {
  if (!ok) {
    fail('Expected route stage to define a scoring contract in change.md template and phase1 design');
  }
  pass('Red precondition no longer holds.');
}

if (!ok) {
  fail('Expected route stage to define a scoring contract in change.md template and phase1 design');
}

pass(mode === 'green' ? 'Green router score contract smoke passed.' : 'Router score contract verify smoke passed.');
