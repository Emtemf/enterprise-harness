import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const repoRoot = '/home/wula/IdeaProjects/sdd';
const lifecyclePath = path.join(repoRoot, 'harness', 'plugin', 'runtime', 'lifecycle.mjs');
const mode = process.argv[2];
const requiredCommandLines = [
  'node harness/plugin/runtime/cli.mjs verify',
  'node harness/plugin/runtime/cli.mjs doctor',
  'node harness/plugin/runtime/test/scaffold-guide-contract-smoke.mjs verify',
  'node harness/plugin/runtime/lifecycle.mjs show-active',
];

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === '.codegraph') continue;
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
  return spawnSync('node', [path.join(repoCopy, 'harness', 'plugin', 'runtime', 'lifecycle.mjs'), 'scaffold', changeId, owner, tier], {
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
  console.error('Usage: node harness/plugin/runtime/test/scaffold-guide-contract-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const { tempRoot, repoCopy } = setupTempRepo();
try {
  const changeId = 'guide-smoke-change';
  const scaffold = runScaffold(repoCopy, changeId);
  const guidePath = path.join(repoCopy, 'harness', 'changes', changeId, 'GUIDE.md');
  const guideExists = fs.existsSync(guidePath);
  const guideText = guideExists ? fs.readFileSync(guidePath, 'utf-8') : '';
  const hasNoPlaceholders = guideExists && !guideText.includes('{{');
  const hasChangeId = guideText.includes(changeId);
  const hasTier = guideText.includes('L2');
  const hasUnknownImpact = guideText.includes('unknown');
  const hasCommands = requiredCommandLines.every((line) => guideText.includes(line));
  const ok =
    scaffold.status === 0 &&
    guideExists &&
    hasNoPlaceholders &&
    hasChangeId &&
    hasTier &&
    hasUnknownImpact &&
    hasCommands;

  if (mode === 'red') {
    if (!ok) {
      fail('Expected scaffold-guide contract to fail before implementation');
    }
    pass('Red precondition no longer holds.');
  }

  if (!ok) {
    const failures = [];
    if (scaffold.status !== 0) failures.push(`scaffold exited ${scaffold.status}: ${(scaffold.stderr || scaffold.stdout || '').trim()}`);
    if (!guideExists) failures.push('GUIDE.md was not generated');
    if (guideExists && !hasNoPlaceholders) failures.push('GUIDE.md still contains {{ placeholders');
    if (guideExists && !hasChangeId) failures.push('GUIDE.md is missing change-id value');
    if (guideExists && !hasTier) failures.push('GUIDE.md is missing tier value');
    if (guideExists && !hasUnknownImpact) failures.push('GUIDE.md is missing unknown impact defaults');
    if (guideExists && !hasCommands) failures.push('GUIDE.md is missing required acceptance command lines');
    fail(`Expected scaffold-guide contract to pass:\n${failures.join('\n')}`);
  }

  pass(mode === 'green' ? 'Green scaffold-guide contract smoke passed.' : 'Scaffold-guide contract verify smoke passed.');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
