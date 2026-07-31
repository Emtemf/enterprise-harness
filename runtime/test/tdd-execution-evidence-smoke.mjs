import assert from 'node:assert/strict';
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
  console.error('Usage: node runtime/test/tdd-execution-evidence-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tdd-execution-evidence-'));
const repoCopy = path.join(tempRoot, 'repo');
try {
  copyDir(repoRoot, repoCopy);
  const change = 'reference-service-boundary-realignment';
  const statePath = path.join(repoCopy, 'harness', 'changes', change, 'state.json');
  const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
  state.schemaVersion = 3;
  state.state = 'REVIEWED';
  state.workflow = state.workflow || {};
  state.workflow.stage = 'verify';
  state.workflow.clarifyReady = true;
  state.workflow.userConfirmedScope = true;
  state.workflow.planReady = true;
  state.workflow.tddStatus = 'refactor-verified';
  state.validation = state.validation || {};
  state.validation.status = 'fresh';
  state.tddEvidence = {
    worktreeUsed: false,
    commandExecuted: null,
    commandOutputSummary: null,
    evidencePath: null,
  };
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n');

  const result = spawnSync('node', [verifyPath, '--json'], { cwd: repoCopy, encoding: 'utf-8' });
  const parsed = JSON.parse(result.stdout || '{}');
  const problems = parsed?.contractChecks?.problems || [];
  const ok = problems.some((p) => p.includes('missing TDD execution evidence'));

  if (mode === 'red') {
    if (!ok) {
      fail('Expected verify to reject reviewed changes lacking worktree/mvn TDD execution evidence');
    }
    pass('Red precondition no longer holds.');
  }

  if (!ok) {
    fail('Expected verify to reject reviewed changes lacking worktree/mvn TDD execution evidence');
  }

  pass(mode === 'green' ? 'Green tdd execution evidence smoke passed.' : 'TDD execution evidence verify smoke passed.');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
