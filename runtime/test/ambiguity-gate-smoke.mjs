import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const preWritePath = path.join(repoRoot, 'runtime', 'hooks', 'pre-write.mjs');
const mode = process.argv[2];

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

function writeText(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, 'utf-8');
}

function withTempRoot(run) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ambiguity-gate-'));
  try {
    run(tempRoot);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function baseState() {
  return {
    schemaVersion: 3,
    changeId: 'fixture-change',
    tier: 'L1',
    state: 'DISCOVERED',
    owner: 'fixture',
    impact: { api: 'no', data: 'no', architecture: 'no', rule: 'no' },
    tooling: {
      codegraph: { status: 'available', queries: ['fixture-query'], fallbackReason: null },
      documentation: { status: 'unknown', libraries: [] },
    },
    decisions: [],
    blockers: [],
    approvals: {},
    currentTask: null,
    gates: { designApproved: false, redVerified: false, redTask: null, redEvidenceRef: null },
    validation: { status: 'missing', digest: null, validatedAt: null },
    workflow: {
      stage: 'clarify',
      clarifyReady: false,
      userConfirmedScope: true,
      planReady: false,
      tddStatus: 'not-started',
      nextEntry: '/harness-intake',
    },
  };
}

function runPreWrite(tempRoot, filePath) {
  return spawnSync('node', [preWritePath], {
    cwd: tempRoot,
    encoding: 'utf-8',
    input: JSON.stringify({ tool_input: { file_path: filePath } }),
  });
}

if (!['red', 'green', 'verify'].includes(mode)) {
  console.error('Usage: node runtime/test/ambiguity-gate-smoke.mjs <red|green|verify>');
  process.exit(1);
}

let failed = null;
try {
  withTempRoot((tempRoot) => {
    const changeDir = path.join(tempRoot, 'harness', 'changes', 'fixture-change');
    fs.mkdirSync(path.join(changeDir, 'evidence'), { recursive: true });
    fs.writeFileSync(path.join(tempRoot, 'harness', 'ACTIVE_CHANGE'), 'fixture-change\n', 'utf-8');
    writeJson(path.join(changeDir, 'state.json'), baseState());
    writeText(path.join(changeDir, 'requirements.md'), `# Requirements\n\n## E 证据\n\n### 歧义评分\n| 维度 | 分数(0-5) | 说明 |\n|------|----------|------|\n| T 目标 clarity | 5 | ok |\n| Scope clarity | 3 | low |\n| User/actor clarity | 5 | ok |\n| Data/SQL clarity | 5 | ok |\n| Interface/API clarity | 5 | ok |\n| Acceptance criteria clarity | 5 | ok |\n| Constraint/risk clarity | 5 | ok |\n| **Overall** | 4 | mixed |\n`);
    writeText(path.join(tempRoot, 'src', 'main', 'java', 'Foo.java'), '// fixture\n');
    const result = runPreWrite(tempRoot, path.join(tempRoot, 'src', 'main', 'java', 'Foo.java'));
    assert.equal(result.status, 2, `expected exit 2, got ${result.status}; stderr=${result.stderr}`);
    assert.match(result.stderr, /歧义评分未达标/);
  });
} catch (error) {
  failed = error;
}

if (mode === 'red') {
  if (failed) {
    console.error(failed.message);
    process.exit(1);
  }
  console.log('Red precondition no longer holds.');
  process.exit(0);
}

if (failed) {
  console.error(failed.message);
  process.exit(1);
}

console.log(mode === 'green' ? 'Green ambiguity gate smoke passed.' : 'Ambiguity gate verify smoke passed.');
