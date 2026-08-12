import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const lifecyclePath = path.join(repoRoot, 'runtime', 'lifecycle.mjs');
const mode = process.argv[2];
const requiredCommandLines = [
  'node runtime/cli.mjs verify',
  'node runtime/cli.mjs doctor',
  'node runtime/test/scaffold-guide-contract-smoke.mjs verify',
  'node runtime/lifecycle.mjs show-active',
];

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === '.codegraph' || entry.name === '.bun' || entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.cache' || entry.name === '.cat-cafe') continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(srcPath, destPath);
    else fs.copyFileSync(srcPath, destPath);
  }
}

function setupTempRepo() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'scaffold-guide-smoke-'));
  const repoCopy = path.join(tempRoot, 'repo');
  copyDir(repoRoot, repoCopy);
  return { tempRoot, repoCopy };
}

function runScaffold(repoCopy, changeId = 'guide-smoke-change', owner = 'harness-governance', tier = 'L2') {
  return spawnSync('node', [path.join(repoCopy, 'runtime', 'lifecycle.mjs'), 'scaffold', changeId, owner, tier], {
    cwd: repoCopy,
    encoding: 'utf-8',
  });
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
  console.error('Usage: node runtime/test/scaffold-guide-contract-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const { tempRoot, repoCopy } = setupTempRepo();
try {
  const changeId = 'guide-smoke-change';
  const scaffold = runScaffold(repoCopy, changeId);
  const guidePath = path.join(repoCopy, 'harness', 'changes', changeId, 'GUIDE.md');
  const guideExists = fs.existsSync(guidePath);
  const hasNoGuideProjection = !guideExists;
  const ok = scaffold.status === 0 && hasNoGuideProjection;

  if (mode === 'red') {
    if (!ok) {
      pass('Red precondition holds: scaffold still generates GUIDE.md.');
    }
    fail('Expected GUIDE projection contract to fail before implementation');
  }

  if (!ok) {
    fail(`Expected scaffold to omit GUIDE.md, exists=${guideExists}`);
  }

  pass(mode === 'green' ? 'Green GUIDE projection removal smoke passed.' : 'GUIDE projection removal verify smoke passed.');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
