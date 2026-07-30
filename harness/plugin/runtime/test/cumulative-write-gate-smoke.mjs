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

const runtimeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.resolve(runtimeRoot, '..', '..', '..');
const hook = path.join(runtimeRoot, 'hooks', 'pre-write.mjs');
const changeId = 'gate-probe';

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
  const sourceChange = path.join(sourceRoot, 'harness/changes/plugin-runtime-agent-dispatch-hardening');
  const changeDir = path.join(root, 'harness/changes', changeId);
  fs.mkdirSync(path.join(changeDir, 'reviews'), { recursive: true });
  for (const name of ['requirements.md', 'change.md', 'design.md', 'tasks.md']) fs.copyFileSync(path.join(sourceChange, name), path.join(changeDir, name));
  for (const name of ['design-reviewer.json', 'plan-critic.json']) fs.copyFileSync(path.join(sourceChange, 'reviews', name), path.join(changeDir, 'reviews', name));
  const state = JSON.parse(fs.readFileSync(path.join(sourceChange, 'state.json'), 'utf-8'));
  state.changeId = changeId;
  state.currentTask = 'task-3';
  state.workflow.stage = 'tdd';
  state.workflow.planReady = true;
  state.gates.designApproved = true;
  state.tooling.codegraph = { status: 'available', queries: ['forged-state-projection'] };
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
        redCommand: ['node', 'harness/plugin/runtime/test/task3-gate-completion-smoke.mjs', 'red'],
        greenCommand: ['node', 'harness/plugin/runtime/test/task3-gate-completion-smoke.mjs', 'green'],
        refactorCommand: ['node', 'harness/plugin/runtime/test/task3-gate-completion-smoke.mjs', 'verify'],
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

function hookCall(root, event) {
  return spawnSync(process.execPath, [hook], { cwd: root, input: JSON.stringify(event), encoding: 'utf-8', shell: false });
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
    executions: [{ phase: 'RED', argv: ['node', 'harness/plugin/runtime/test/task3-gate-completion-smoke.mjs', 'red'], exitCode: 1, startedAt: '2026-01-01T00:00:00.000Z', finishedAt: '2026-01-01T00:00:01.000Z', stdoutDigest: crypto.createHash('sha256').update('').digest('hex'), stderrDigest: crypto.createHash('sha256').update('red').digest('hex') }],
  };
  writeJson(tddReceiptSpoolPath(root, changeId, 'task-3'), receipt);
}

const { root, planReview } = fixture();
try {
  const target = path.join(root, 'src/main/java/demo/App.java');
  let result = hookCall(root, { tool_name: 'Write', tool_input: { file_path: target } });
  assert.equal(result.status, 2, 'forged state projections must not authorize a main-thread write');
  seedAuthorizedEvidence(root);
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
  fs.writeFileSync(planReview, saved);
  console.log('PASS cumulative-write-gate verify');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
