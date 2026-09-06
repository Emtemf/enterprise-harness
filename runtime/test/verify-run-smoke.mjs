import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHandoffV2 } from '../core/handoff-v2.mjs';
import { appendAgentEvent } from '../lib/agent-evidence.mjs';
import { bindSession } from '../lib/sessions.mjs';
import { readVerifyCommandEvidence } from '../api/verify-command.mjs';
import { writeCanonicalSingleTaskPlanFixture } from './plan-proof-fixture.mjs';

const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);
const sourceRoot = fileURLToPath(new URL('../../', import.meta.url));
const runner = path.join(sourceRoot, 'runtime', 'verify-run.mjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-verify-run-'));
const changeId = 'verify-run-standard';
const taskId = 'task-one';
const sessionId = 'verify-run-session';
const agentId = 'verify-run-agent';
const base = `harness/changes/${changeId}`;

function write(relative, content) {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

function runAsync(command, argv, options) {
  return new Promise((resolve) => {
    const child = spawn(command, argv, options);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

try {
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: root, shell: false }).status, 0);
  write(`${base}/test-cases.md`, [
    '## 测试用例',
    '| TCID | Traces | Level | Priority | Preconditions | Data | Actions | Observable assertions | Cleanup/Recovery | Status |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    '| TC1 | R1 / D1 / VO1 | e2e | critical | runtime available | sample | run command | stdout contains verified | none | accepted |',
  ].join('\n'));
  const tasksContent = [
    '# Tasks', '', `## Task 1: ${taskId}`, '',
    '- Test cases: TC1', '- Strategy: `direct`', '- Minimal RED case: none', '',
  ].join('\n');
  const executionMarker = path.join(root, 'verify-executions.log');
  const argv = [process.execPath, '-e', `setTimeout(() => { require('node:fs').appendFileSync(${JSON.stringify(executionMarker)}, 'executed\\n'); process.stdout.write('verified\\n'); }, 250)`];
  const plan = writeCanonicalSingleTaskPlanFixture(root, changeId, {
    taskId,
    tasksContent,
    taskCommands: {
      schemaVersion: 4,
      tasks: {
        [taskId]: {
          executionStrategy: 'direct', strategyRationale: '标准 Verify runner 样例',
          testCases: ['TC1'], minimalRedCase: null,
          writeScope: { allowed: ['fixture.txt'], forbidden: [] },
          commands: [{ phase: 'VERIFY', argv }],
        },
      },
    },
  });
  const implementProofRef = `${base}/evidence/completion/implement.json`;
  write(implementProofRef, '{"type":"completion-proof","stage":"implement","fixture":true}\n');
  const statePath = path.join(root, base, 'state.json');
  const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
  fs.writeFileSync(statePath, `${JSON.stringify({ ...state, revision: state.revision + 1, stage: 'verify', currentTask: null }, null, 2)}\n`);
  write('harness/ACTIVE_CHANGE', `${changeId}\n`);
  bindSession(root, { sessionId, changeId, worktreePath: root, controllerRevision: 'verify-run-test' }, { commonDir: path.join(root, '.git') });
  const inputRefs = [plan.testCasesRef, plan.designProofRef, plan.tasksRef, plan.commandsRef, plan.planProofRef, implementProofRef];
  const handoff = createHandoffV2(root, {
    changeId, stage: 'verify', behavior: 'verify.collect',
    agent: { type: 'enterprise-harness:artifact-worker', skill: 'verify' },
    inputRefs,
    tecpc: { target: '真实执行 TC1', evidence: [plan.planProofRef, implementProofRef], context: inputRefs, path: `${plan.commandsRef} -> TC1 evidence`, correction: null },
  });
  const common = { sessionId, runId: handoff.runId, behavior: handoff.input.behavior, handoffRole: 'execute', parentRunId: null, cwd: root };
  appendAgentEvent(root, changeId, { ...common, kind: 'dispatch', toolUseId: 'verify-tool', requestedAgentType: 'enterprise-harness:artifact-worker', preloadedSkill: 'verify' });
  appendAgentEvent(root, changeId, { ...common, kind: 'start', agentId, observedAgentType: 'enterprise-harness:artifact-worker' });
  const env = { ...process.env, ENTERPRISE_HARNESS_SESSION_ID: sessionId, HARNESS_VERIFY_AGENT_ID: agentId };
  const concurrentRuns = await Promise.all([
    runAsync(process.execPath, [runner, changeId, handoff.runId, 'TC1'], { cwd: root, encoding: 'utf-8', shell: false, env }),
    runAsync(process.execPath, [runner, changeId, handoff.runId, 'TC1'], { cwd: root, encoding: 'utf-8', shell: false, env }),
  ]);
  assert.deepEqual(concurrentRuns.map(({ status }) => status).sort(), [0, 2], JSON.stringify(concurrentRuns));
  assert.equal(fs.readFileSync(executionMarker, 'utf-8'), 'executed\n', 'concurrent Verify calls must execute the frozen command exactly once');
  assert.match(concurrentRuns.find(({ status }) => status !== 0).stderr, /concurrent update|already exists/u);
  const loaded = readVerifyCommandEvidence(root, changeId, handoff.runId, 'TC1', { expectedInputDigests: handoff.input.inputDigests });
  assert.equal(loaded.ok, true, loaded.problems.join('; '));
  assert.equal(loaded.evidence.status, 'pass');
  assert.deepEqual(loaded.evidence.executions.map(({ taskId: id, phase, argv: actual, exitCode }) => ({ id, phase, actual, exitCode })), [
    { id: taskId, phase: 'VERIFY', actual: argv, exitCode: 0 },
  ]);
  const stdoutRef = loaded.evidence.executions[0].stdoutRef;
  assert.equal(fs.readFileSync(path.join(root, stdoutRef), 'utf-8'), 'verified\n');
  const duplicate = spawnSync(process.execPath, [runner, changeId, handoff.runId, 'TC1'], { cwd: root, encoding: 'utf-8', shell: false, env });
  assert.notEqual(duplicate.status, 0, 'Verify evidence must be immutable per run and TC');
  assert.match(duplicate.stderr, /already exists/u);
  const injected = spawnSync(process.execPath, [runner, changeId, handoff.runId, 'TC1', '--', 'sh'], { cwd: root, encoding: 'utf-8', shell: false, env });
  assert.notEqual(injected.status, 0, 'Verify runner must reject caller-supplied child argv');
  assert.match(injected.stderr, /external child argv is forbidden/u);
  console.log(`PASS verify-run ${mode}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
