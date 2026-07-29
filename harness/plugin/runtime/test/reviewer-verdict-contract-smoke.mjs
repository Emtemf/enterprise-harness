import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const mode = process.argv[2];
const specPath = path.join(repoRoot, 'harness', 'specs', 'reviewer-verdict-contract.md');
const rulePath = path.join(repoRoot, '.claude', 'rules', '70-review.md');
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
  console.error('Usage: node harness/plugin/runtime/test/reviewer-verdict-contract-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const spec = readText(specPath);
const rule = readText(rulePath);
const stopText = readText(stopPath);
const requiredFields = ['changeId', 'reviewerId', 'verdict', 'findings', 'evidence', 'reviewedAt'];
const ok = requiredFields.every((token) => spec.includes(`\`${token}\``))
  && spec.includes('`pass` / `block` / `advisory`')
  && rule.includes('review verdict 应结构化表达')
  && rule.includes('reviewedAt')
  && stopText.includes('validateCompletionPredicate');

if (mode === 'red') {
  if (!ok) {
    fail('Expected reviewer verdict contract to align spec, review rules, and stop gate consumption');
  }
  pass('Red precondition no longer holds.');
}

if (!ok) {
  fail('Expected reviewer verdict contract to align spec, review rules, and stop gate consumption');
}

pass(mode === 'green' ? 'Green reviewer verdict contract smoke passed.' : 'Reviewer verdict contract smoke passed.');
