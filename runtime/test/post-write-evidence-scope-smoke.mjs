import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const postWritePath = path.join(repoRoot, 'runtime', 'hooks', 'post-write.mjs');
const mode = process.argv[2];

if (!['green', 'verify'].includes(mode)) {
  console.error('Usage: node runtime/test/post-write-evidence-scope-smoke.mjs <green|verify>');
  process.exit(1);
}

const changeId = 'invalid-active-change';
const candidatePath = path.join(
  'harness',
  'changes',
  changeId,
  'evidence',
  'bootstrap-recovery',
  'candidates',
  'candidate.json',
);
const tddEvidencePath = path.join('harness', 'changes', changeId, 'evidence', 'tdd', 'task-1.json');
const runPath = path.join('harness', 'changes', changeId, 'runs', 'run-1', 'result.json');

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf-8');
}

function invalidState() {
  return {
    schemaVersion: 4,
    revision: 1,
    changeId,
    tier: 'L3',
    state: 'PLANNED',
    owner: 'fixture',
    impact: { api: 'yes', data: 'yes', architecture: 'yes', rule: 'yes' },
    tooling: {
      codegraph: { status: 'unknown', queries: [], fallbackReason: null },
      documentation: { status: 'unknown', libraries: [] },
    },
    decisions: [],
    blockers: [],
    approvals: {},
    gates: { designApproved: true, redVerified: false, redTask: null, redEvidenceRef: null },
    currentTask: null,
    workflow: {
      stage: 'tdd',
      clarifyReady: true,
      userConfirmedScope: true,
      routeReady: true,
      planReady: true,
      tddStatus: 'not-started',
      nextEntry: '/harness-tdd',
    },
    validation: { status: 'stale', digest: null, validatedAt: null },
  };
}

function createFixture(change = changeId) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'post-write-evidence-scope-'));
  const changeDir = path.join(root, 'harness', 'changes', change);
  writeJson(path.join(changeDir, 'state.json'), { ...invalidState(), changeId: change });
  fs.mkdirSync(path.join(changeDir, 'evidence', 'bootstrap-recovery', 'candidates'), { recursive: true });
  fs.writeFileSync(path.join(root, 'harness', 'ACTIVE_CHANGE'), `${changeId}\n`, 'utf-8');
  const git = spawnSync('git', ['init', '-q', '.'], { cwd: root, encoding: 'utf-8' });
  assert.equal(git.status, 0, `could not initialize fixture git repository: ${git.stderr}`);
  fs.mkdirSync(path.join(root, 'harness', 'changes', changeId, 'evidence', 'tdd'), { recursive: true });
  fs.mkdirSync(path.join(root, 'harness', 'changes', changeId, 'runs'), { recursive: true });
  fs.mkdirSync(path.join(root, 'runtime', 'hooks'), { recursive: true });
  fs.writeFileSync(path.join(root, 'runtime', 'hooks', 'post-write.mjs'), '// fixture\n', 'utf-8');
  return root;
}

function invoke(root, filePath, toolUseId) {
  return spawnSync(process.execPath, [postWritePath], {
    cwd: root,
    encoding: 'utf-8',
    input: JSON.stringify({
      tool_name: 'Write',
      tool_use_id: toolUseId,
      session_id: 'post-write-evidence-scope-smoke',
      cwd: root,
      tool_input: { file_path: path.join(root, filePath) },
    }),
  });
}

function invokeBashWrite(root, toolUseId, command = 'cp /tmp/replacement runtime/hooks/post-write.mjs') {
  const event = {
    tool_name: 'Bash',
    tool_use_id: toolUseId,
    session_id: 'post-write-evidence-scope-smoke',
    cwd: root,
    tool_input: { command },
  };
  spawnSync(process.execPath, [path.join(repoRoot, 'runtime', 'hooks', 'pre-write.mjs')], {
    cwd: root,
    encoding: 'utf-8',
    input: JSON.stringify(event),
  });
  return spawnSync(process.execPath, [postWritePath], {
    cwd: root,
    encoding: 'utf-8',
    input: JSON.stringify(event),
  });
}

const root = createFixture();
try {
  const statePath = path.join(root, 'harness', 'changes', changeId, 'state.json');
  const freshBeforeCandidate = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
  freshBeforeCandidate.validation = { status: 'fresh', digest: 'before-candidate', validatedAt: '2026-08-09T00:00:00.000Z' };
  writeJson(statePath, freshBeforeCandidate);
  const candidate = invoke(root, candidatePath, 'candidate-write');
  assert.equal(
    candidate.status,
    0,
    `append-only candidate evidence must not be blocked by unrelated invalid authority artifacts: ${candidate.stderr}`,
  );

  const afterCandidate = JSON.parse(fs.readFileSync(statePath, 'utf-8')).validation;
  assert.equal(afterCandidate.status, 'stale', 'bootstrap recovery evidence must invalidate validation freshness');

  const tddEvidence = invoke(root, tddEvidencePath, 'tdd-evidence-write');
  assert.equal(tddEvidence.status, 0, `stable TDD evidence must not run unrelated full validation: ${tddEvidence.stderr}`);
  const afterTddEvidence = JSON.parse(fs.readFileSync(path.join(root, 'harness', 'changes', changeId, 'state.json'), 'utf-8')).validation;
  assert.equal(afterTddEvidence.status, 'stale', 'stable TDD evidence must invalidate validation freshness');

  const stateBeforeRun = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
  stateBeforeRun.validation = { status: 'fresh', digest: 'before-run', validatedAt: '2026-08-09T00:00:00.000Z' };
  writeJson(statePath, stateBeforeRun);
  const run = invoke(root, runPath, 'run-write');
  assert.equal(run.status, 0, `volatile run evidence must not run unrelated full validation: ${run.stderr}`);
  const afterRun = JSON.parse(fs.readFileSync(statePath, 'utf-8')).validation;
  assert.deepEqual(afterRun, stateBeforeRun.validation, 'volatile run evidence must not invalidate validation freshness');

  const bashTddEvidence = invokeBashWrite(
    root,
    'bash-tdd-evidence-write',
    `tee ${tddEvidencePath} > /dev/null`,
  );
  assert.equal(bashTddEvidence.status, 0, `Bash stable evidence must match direct Write behavior: ${bashTddEvidence.stderr}`);

  const otherChangeId = 'other-change';
  const otherStatePath = path.join(root, 'harness', 'changes', otherChangeId, 'state.json');
  writeJson(otherStatePath, {
    ...invalidState(),
    changeId: otherChangeId,
    validation: { status: 'fresh', digest: 'other-before-write', validatedAt: '2026-08-09T00:00:00.000Z' },
  });
  const otherTddEvidence = invoke(root, path.join('harness', 'changes', otherChangeId, 'evidence', 'tdd', 'task-1.json'), 'other-tdd-evidence-write');
  assert.equal(otherTddEvidence.status, 0, `other-change stable evidence must not run unrelated full validation: ${otherTddEvidence.stderr}`);
  const afterOtherTddEvidence = JSON.parse(fs.readFileSync(otherStatePath, 'utf-8')).validation;
  assert.equal(afterOtherTddEvidence.status, 'stale', 'stable evidence must invalidate the owning non-active change');

  const otherBeforeRuntime = JSON.parse(fs.readFileSync(otherStatePath, 'utf-8'));
  otherBeforeRuntime.validation = { status: 'fresh', digest: 'other-before-runtime', validatedAt: '2026-08-09T00:00:00.000Z' };
  writeJson(otherStatePath, otherBeforeRuntime);

  const bashRuntimeWrite = invokeBashWrite(root, 'bash-runtime-write');
  assert.equal(bashRuntimeWrite.status, 0, `Bash runtime writes are now pass-through (stale invalidation only): ${bashRuntimeWrite.stderr}`);

  const runtimeWrite = invoke(root, path.join('runtime', 'hooks', 'post-write.mjs'), 'runtime-write');
  assert.equal(runtimeWrite.status, 0, 'runtime control-plane writes pass through — full validation is verify concern');

  const afterRuntime = JSON.parse(fs.readFileSync(otherStatePath, 'utf-8')).validation;
  assert.equal(afterRuntime.status, 'stale', 'runtime control-plane writes must still invalidate every tracked change');

  const stateWrite = invoke(root, path.join('harness', 'changes', changeId, 'state.json'), 'state-write');
  assert.equal(stateWrite.status, 0, 'authority state writes pass through — full validation is verify concern');

  const validation = JSON.parse(fs.readFileSync(path.join(root, 'harness', 'changes', changeId, 'state.json'), 'utf-8')).validation;
  assert.equal(validation.status, 'stale', 'authority writes must still invalidate validation freshness');

  console.log(`PASS post-write-evidence-scope ${mode}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
