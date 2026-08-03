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
  const change = 'test-tdd-evidence-probe';
  const changeDir = path.join(repoCopy, 'harness', 'changes', change);
  fs.mkdirSync(changeDir, { recursive: true });
  fs.writeFileSync(path.join(changeDir, 'validation.md'), '# Validation\n\n## Commands Executed\nplaceholder\n\n## Final Verdict\nPASS\n');
  fs.writeFileSync(path.join(changeDir, 'change.md'), '# Change\n### Router 评分\n| 维度 | 分数(0-5) | 说明 |\n|------|----------|------|\n| Scope complexity | 1 | fixture |\n| Impact breadth | 1 | fixture |\n| Unknowns / ambiguity | 1 | fixture |\n| API / data risk | 1 | fixture |\n| Test / rollback complexity | 1 | fixture |\n| **Overall** | 1.0 | fixture |\n');
  fs.writeFileSync(path.join(changeDir, 'requirements.md'), '# Requirements\n## 歧义评分\n| 维度 | 分数(0-5) | 说明 |\n|------|----------|------|\n| T 目标 clarity | 5 | fixture |\n| Scope clarity | 5 | fixture |\n| User/actor clarity | 5 | fixture |\n| Data/SQL clarity | 5 | fixture |\n| Interface/API clarity | 5 | fixture |\n| Acceptance criteria clarity | 5 | fixture |\n| Constraint/risk clarity | 5 | fixture |\n| **Overall** | 5.0 | fixture |\n');
  const statePath = path.join(changeDir, 'state.json');
  const state = {
    schemaVersion: 3,
    changeId: change,
    tier: 'L1',
    state: 'REVIEWED',
    owner: 'smoke',
    impact: { api: 'no', data: 'no', architecture: 'no', rule: 'no' },
    tooling: { codegraph: { status: 'available', queries: [], fallbackReason: null }, documentation: { status: 'unknown', libraries: [] } },
    decisions: [],
    blockers: [],
    approvals: {},
    gates: { designApproved: true, redVerified: false, redTask: null, redEvidenceRef: null },
    currentTask: null,
    workflow: { stage: 'verify', clarifyReady: true, userConfirmedScope: true, routeReady: true, planReady: true, tddStatus: 'refactor-verified', nextEntry: '/harness-verify' },
    validation: { status: 'fresh', digest: null, validatedAt: new Date().toISOString() },
    tddEvidence: { worktreeUsed: false, commandExecuted: null, commandOutputSummary: null, evidencePath: null },
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
