import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const verifyPath = path.join(repoRoot, 'runtime', 'verify.mjs');
const mode = process.argv[2];

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === '.codegraph' || entry.name === '.bun' || entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.cache') continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(srcPath, destPath);
    else fs.copyFileSync(srcPath, destPath);
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
  console.error('Usage: node runtime/test/verify-runtime-output-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-runtime-output-'));
const repoCopy = path.join(tempRoot, 'repo');
try {
  copyDir(repoRoot, repoCopy);
  const result = spawnSync('node', [verifyPath, '--json'], {
    cwd: repoCopy,
    encoding: 'utf-8',
  });
  const parsed = JSON.parse(result.stdout || '{}');
  const ok = ['pass', 'block', 'advisory'].includes(parsed['completion-verdict'])
    && Array.isArray(parsed.blockers)
    && parsed['consumed-evidence-summary']
    && typeof parsed['next-step'] === 'string';

  if (mode === 'red') {
    if (!ok) {
      fail('Expected verify runtime output contract to be implemented');
    }
    pass('Red precondition no longer holds.');
  }

  if (!ok) {
    fail('Expected verify runtime output contract to be implemented');
  }

  pass(mode === 'green' ? 'Green verify runtime output smoke passed.' : 'Verify runtime output smoke passed.');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
