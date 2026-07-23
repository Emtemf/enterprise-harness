import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const targetFile = path.join(repoRoot, 'harness', 'plugin', 'runtime', 'test', 'gate-hardening-red-task-smoke.mjs');
const mode = process.argv[2];

if (!['red', 'green', 'verify'].includes(mode)) {
  console.error('Usage: node harness/plugin/runtime/test/gate-hardening-red-task-fixture-guard-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const text = fs.readFileSync(targetFile, 'utf-8');
const realChangeIds = fs.readdirSync(path.join(repoRoot, 'harness', 'changes'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

const hits = realChangeIds.filter((changeId) => text.includes(changeId));
const ok = hits.length === 0;

function fail(message) {
  console.error(message);
  for (const hit of hits) console.error(`  - gate-hardening-red-task-smoke.mjs: ${hit}`);
  process.exit(1);
}

function pass(message) {
  console.log(message);
  process.exit(0);
}

if (mode === 'red') {
  if (!ok) {
    fail('Expected no hardcoded real changeId references in gate-hardening-red-task-smoke.mjs, but found:');
  }
  pass('Red precondition no longer holds.');
}

if (!ok) {
  fail('gate-hardening-red-task-fixture-guard-smoke failed: found hardcoded real changeId references:');
}

pass(mode === 'green' ? 'Green gate-hardening-red-task-fixture-guard-smoke passed.' : 'gate-hardening-red-task-fixture-guard-smoke verify passed.');
