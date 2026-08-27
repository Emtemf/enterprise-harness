import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { appendAgentEvent, gitCommonDir } from '../lib/agent-evidence.mjs';
import { createEvidencePolicy } from '../lib/evidence-policy.mjs';
import { tddReceiptSpoolPath } from '../lib/tdd-receipts.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const runtimeRoot = path.join(repoRoot, 'runtime');
const hook = path.join(repoRoot, 'hooks', 'scripts', 'pre-write.mjs');
const validateCli = path.join(runtimeRoot, 'validate.mjs');
const changeId = 'gate-probe';

function runValidate(root) {
  return spawnSync(process.execPath, [validateCli, changeId], { cwd: root, encoding: 'utf-8', shell: false });
}

function run(root, command, args = []) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf-8', shell: false });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout.trim();
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-task3-gate-'));
  run(root, 'git', ['init', '-q']);
  run(root, 'git', ['config', 'user.email', 'fixture@example.invalid']);
  run(root, 'git', ['config', 'user.name', 'fixture']);
  fs.mkdirSync(path.join(root, 'src/main/java/demo'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src/main/java/demo/App.java'), 'class App {}\n');
  const changeDir = path.join(root, 'harness/changes', changeId);
  fs.mkdirSync(path.join(changeDir, 'reviews'), { recursive: true });
  fs.writeFileSync(path.join(changeDir, 'requirements.md'), `# Requirements
## 歧义评分
| 维度 | 分数(0-5) | 说明 |
|------|----------|------|
| T 目标 clarity | 5 | fixture |
| Scope clarity | 5 | fixture |
| User/actor clarity | 5 | fixture |
| Data/SQL clarity | 5 | fixture |
| Interface/API clarity | 5 | fixture |
| Acceptance criteria clarity | 5 | fixture |
| Constraint/risk clarity | 5 | fixture |
| **Overall** | 5.0 | fixture |
`);
  fs.writeFileSync(path.join(changeDir, 'change.md'), `# Change
### Router 评分
| 维度 | 分数(0-5) | 说明 |
|------|----------|------|
| Scope complexity | 2 | fixture |
| Impact breadth | 2 | fixture |
| Unknowns / ambiguity | 2 | fixture |
| API / data risk | 2 | fixture |
| Test / rollback complexity | 2 | fixture |
| **Overall** | 2.0 | fixture |
`);
  fs.writeFileSync(path.join(changeDir, 'design.md'), `# Design\nplaceholder\n`);
  fs.writeFileSync(path.join(changeDir, 'tasks.md'), `# Tasks\nStatus: finalized-plan\n\n## Task 3: test task\n`);
  for (const [name, rid] of [['design-reviewer.json', 'design-reviewer'], ['plan-critic.json', 'plan-critic']]) {
    fs.writeFileSync(path.join(changeDir, 'reviews', name), `${JSON.stringify({ changeId, reviewerId: rid, verdict: 'pass', findings: [], evidence: [], reviewedAt: '2026-07-30' })}\n`);
  }
  const state = {
    schemaVersion: 3,
    changeId,
    tier: 'L3',
    state: 'EXECUTING',
    owner: 'smoke',
    impact: { api: 'no', data: 'no', architecture: 'yes', rule: 'yes' },
    tooling: { codegraph: { status: 'available', queries: ['forged-state-projection'], fallbackReason: null }, documentation: { status: 'unknown', libraries: [] } },
    decisions: [],
    blockers: [],
    approvals: { design: { status: 'pass', reviewerId: 'design-reviewer', reviewedAt: '2026-07-30', digest: 'abc' }, plan: { status: 'pass', reviewerId: 'plan-critic', reviewedAt: '2026-07-30', digest: 'def' } },
    gates: { designApproved: true, redVerified: false, redTask: null, redEvidenceRef: null },
    currentTask: 'task-3',
    workflow: { stage: 'tdd', clarifyReady: true, userConfirmedScope: true, routeReady: true, planReady: true, tddStatus: 'not-started', nextEntry: '/harness-tdd' },
    validation: { status: 'missing', digest: null, validatedAt: null },
  };
  writeJson(path.join(changeDir, 'state.json'), state);
  fs.writeFileSync(path.join(root, 'harness/ACTIVE_CHANGE'), `${changeId}\n`);
  writeJson(path.join(root, 'harness/command-policy.json'), {
    schemaVersion: 1,
    build: { type: 'command', executables: ['node'] },
  });
  writeJson(path.join(changeDir, 'task-commands.json'), {
    schemaVersion: 1,
    tasks: {
      'task-3': {
        redCommand: ['node', 'runtime/test/task3-gate-completion-smoke.mjs', 'red'],
        greenCommand: ['node', 'runtime/test/task3-gate-completion-smoke.mjs', 'green'],
        refactorCommand: ['node', 'runtime/test/task3-gate-completion-smoke.mjs', 'verify'],
      },
    },
  });
  run(root, 'git', ['add', '.']);
  run(root, 'git', ['commit', '-qm', 'fixture baseline']);
  createEvidencePolicy(root, { strictChangeIds: [changeId] });
  run(root, 'git', ['add', 'harness/evidence-policy.json']);
  run(root, 'git', ['commit', '-qm', 'seal policy']);
  return { root, statePath: path.join(changeDir, 'state.json'), planReview: path.join(changeDir, 'reviews/plan-critic.json') };
}

let hookCallSequence = 0;
function hookCall(root, event) {
  const { ENTERPRISE_HARNESS_SESSION_ID: _harnessSessionId, CLAUDE_SESSION_ID: _claudeSessionId, ...env } = process.env;
  return spawnSync(process.execPath, [hook], {
    cwd: root,
    input: JSON.stringify({ tool_use_id: `cumulative-write-${hookCallSequence += 1}`, ...event }),
    encoding: 'utf-8',
    shell: false,
    env,
  });
}

function bind(root, agentId, type) {
  appendAgentEvent(root, changeId, { kind: 'dispatch-binding', agentId, requestedAgentType: type, observedAgentType: type, toolUseId: `${agentId}-tool` });
  appendAgentEvent(root, changeId, { kind: 'start', agentId, requestedAgentType: type, observedAgentType: type, toolUseId: `${agentId}-tool` });
}

function seedAuthorizedEvidence(root) {
  bind(root, 'explorer-1', 'enterprise-harness:code-explore');
  appendAgentEvent(root, changeId, { kind: 'codegraph-attempt', agentId: 'explorer-1', observedAgentType: 'enterprise-harness:code-explore' });
  bind(root, 'executor-1', 'enterprise-harness:tdd-executor');
  const head = run(root, 'git', ['rev-parse', 'HEAD']);
  const receipt = {
    receiptVersion: 1,
    provenance: 'tdd-run',
    changeId,
    taskId: 'task-3',
    agent: { id: 'executor-1', type: 'enterprise-harness:tdd-executor' },
    worktree: { path: root, gitCommonDir: gitCommonDir(root), headBefore: head, headAfter: head, treeDigestBefore: 'a'.repeat(64), treeDigestAfter: 'b'.repeat(64) },
    changedPaths: [],
    executions: [{ phase: 'RED', argv: ['node', 'runtime/test/task3-gate-completion-smoke.mjs', 'red'], exitCode: 1, startedAt: '2026-01-01T00:00:00.000Z', finishedAt: '2026-01-01T00:00:01.000Z', stdoutDigest: crypto.createHash('sha256').update('').digest('hex'), stderrDigest: crypto.createHash('sha256').update('red').digest('hex') }],
  };
  writeJson(tddReceiptSpoolPath(root, changeId, 'task-3'), receipt);
}

const { root, planReview } = fixture();
try {
  const target = path.join(root, 'src/main/java/demo/App.java');
  let result = hookCall(root, { tool_name: 'Write', tool_input: { file_path: target } });
  assert.equal(result.status, 2, 'forged state projections must not authorize a main-thread write');
  seedAuthorizedEvidence(root);
  // 静态阶段链现在由 CLI validate 在阶段边界验证并落 marker；pre-write 只查 marker。
  const validated = runValidate(root);
  assert.equal(validated.status, 0, validated.stderr || validated.stdout);
  result = hookCall(root, { tool_name: 'Write', agent_id: 'executor-1', tool_input: { file_path: target } });
  assert.equal(result.status, 0, result.stderr);
  result = hookCall(root, { tool_name: 'NotebookEdit', agent_id: 'executor-1', tool_input: { notebook_path: path.join(root, 'src/test/java/demo/App.ipynb') } });
  assert.equal(result.status, 0, result.stderr);
  result = hookCall(root, {
    tool_name: 'Bash',
    tool_use_id: 'bash-write-1',
    agent_id: 'executor-1',
    tool_input: { command: 'tee src/main/java/demo/App.java' },
  });
  assert.equal(result.status, 0, result.stderr);
  const saved = fs.readFileSync(planReview);
  fs.rmSync(planReview);
  result = hookCall(root, { tool_name: 'Write', agent_id: 'executor-1', tool_input: { file_path: target } });
  assert.equal(result.status, 2, 'stage=tdd must not skip a missing plan review');
  assert.match(result.stderr, /stage-evidence-digest-mismatch/, 'deleting a stage-chain review must invalidate the stage gate marker');
  fs.writeFileSync(planReview, saved);
  // 恢复 review 后 marker 仍须重新 validate 才 fresh。
  const revalidated = runValidate(root);
  assert.equal(revalidated.status, 0, revalidated.stderr || revalidated.stdout);
  result = hookCall(root, { tool_name: 'Write', agent_id: 'executor-1', tool_input: { file_path: target } });
  assert.equal(result.status, 0, result.stderr);
  console.log('PASS cumulative-write-gate verify');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
