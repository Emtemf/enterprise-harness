import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const mode = process.argv[2];
const targets = [
  path.join(repoRoot, 'runtime', 'cli.mjs'),
  path.join(repoRoot, 'runtime', 'prepublish.mjs'),
  path.join(repoRoot, 'runtime', 'update.mjs'),
  path.join(repoRoot, 'runtime', 'doctor-hooks.mjs'),
];

function fail(message) {
  console.error(message);
  process.exit(1);
}

function pass(message) {
  console.log(message);
  process.exit(0);
}

if (!['red', 'green', 'verify'].includes(mode)) {
  console.error('Usage: node runtime/test/current-node-propagation-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const problems = targets.flatMap((file) => {
  const source = fs.readFileSync(file, 'utf-8');
  return source.includes("spawnSync('node'")
    ? [`${path.relative(repoRoot, file)} launches a nested runtime through PATH instead of process.execPath`]
    : [];
});

if (mode === 'red') {
  if (problems.length > 0) fail(problems.join('\n'));
  pass('Red precondition no longer holds.');
}

if (problems.length > 0) fail(problems.join('\n'));
pass(mode === 'green'
  ? 'Green current-node propagation smoke passed.'
  : 'Current-node propagation verify smoke passed.');
