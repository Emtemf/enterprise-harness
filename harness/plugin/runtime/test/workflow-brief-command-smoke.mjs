import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const workflowPath = path.join(repoRoot, 'harness', 'plugin', 'runtime', 'workflow.mjs');
const mode = process.argv[2];

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

function fail(message) {
  console.error(message);
  process.exit(1);
}

function pass(message) {
  console.log(message);
  process.exit(0);
}

if (!['red', 'green', 'verify'].includes(mode)) {
  console.error('Usage: node harness/plugin/runtime/test/workflow-brief-command-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-brief-smoke-'));
const repoCopy = path.join(tempRoot, 'repo');
try {
  copyDir(repoRoot, repoCopy);
  const changeId = 'brief-smoke-demo';
  const changeDir = path.join(repoCopy, 'harness', 'changes', changeId);
  fs.mkdirSync(changeDir, { recursive: true });
  fs.writeFileSync(path.join(changeDir, 'state.json'), JSON.stringify({ changeId }, null, 2) + '\n', 'utf-8');

  const exploration = spawnSync('node', [workflowPath, 'brief', changeId, 'exploration', 'repo-facts'], { cwd: repoCopy, encoding: 'utf-8' });
  const task = spawnSync('node', [workflowPath, 'brief', changeId, 'task', 'cancel-order'], { cwd: repoCopy, encoding: 'utf-8' });
  const verification = spawnSync('node', [workflowPath, 'brief', changeId, 'verification', 'release-readiness'], { cwd: repoCopy, encoding: 'utf-8' });

  const explorationFile = path.join(changeDir, 'briefs', 'exploration-repo-facts.md');
  const taskFile = path.join(changeDir, 'briefs', 'task-cancel-order.md');
  const verificationFile = path.join(changeDir, 'briefs', 'verification-release-readiness.md');
  const explorationText = fs.readFileSync(explorationFile, 'utf-8');
  const taskText = fs.readFileSync(taskFile, 'utf-8');
  const verificationText = fs.readFileSync(verificationFile, 'utf-8');
  const ok = exploration.status === 0
    && task.status === 0
    && verification.status === 0
    && fs.existsSync(explorationFile)
    && fs.existsSync(taskFile)
    && fs.existsSync(verificationFile)
    && explorationText.includes('# Exploration Brief')
    && explorationText.includes('repo-facts')
    && taskText.includes('# Task Brief')
    && taskText.includes(changeId)
    && taskText.includes('cancel-order')
    && verificationText.includes('# Verification Brief')
    && verificationText.includes(changeId)
    && verificationText.includes('release-readiness');

  if (mode === 'red') {
    if (!ok) {
      fail('Expected workflow brief command to create brief files from templates');
    }
    pass('Red precondition no longer holds.');
  }

  if (!ok) {
    fail('Expected workflow brief command to create brief files from templates');
  }

  pass(mode === 'green' ? 'Green workflow brief command smoke passed.' : 'Workflow brief command verify smoke passed.');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
