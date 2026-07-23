import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const testDir = path.join(repoRoot, 'harness', 'plugin', 'runtime', 'test');
const mode = process.argv[2];

if (!['red', 'green', 'verify'].includes(mode)) {
  console.error('Usage: node harness/plugin/runtime/test/gate-hardening-fixture-guard-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const targetFiles = [
  'gate-hardening-design-gate-smoke.mjs',
  'gate-hardening-task-state-smoke.mjs',
  'gate-hardening-review-validation-smoke.mjs',
  'gate-hardening-validation-digest-smoke.mjs',
  'gate-hardening-fixture-guard-smoke.mjs',
];

const realChangeIds = fs.readdirSync(path.join(repoRoot, 'harness', 'changes'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

const hits = [];
for (const fileName of targetFiles) {
  const text = fs.readFileSync(path.join(testDir, fileName), 'utf-8');
  for (const changeId of realChangeIds) {
    if (text.includes(changeId)) {
      hits.push(`${fileName}: ${changeId}`);
    }
  }
}

const ok = hits.length === 0;

function fail(message) {
  console.error(message);
  for (const hit of hits) console.error(`  - ${hit}`);
  process.exit(1);
}

function pass(message) {
  console.log(message);
  process.exit(0);
}

if (mode === 'red') {
  if (!ok) {
    fail('Expected no hardcoded real changeId references in gate-hardening-*-smoke.mjs, but found:');
  }
  pass('Red precondition no longer holds.');
}

if (!ok) {
  fail('gate-hardening-fixture-guard-smoke failed: found hardcoded real changeId references:');
}

pass(mode === 'green' ? 'Green gate-hardening-fixture-guard-smoke passed.' : 'gate-hardening-fixture-guard-smoke verify passed.');
