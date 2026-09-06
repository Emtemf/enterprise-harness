import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { loadHandoffV2 } from './core/handoff-v2.mjs';
import { activeChangeId, activeHarnessSkillAgent, gitCommonDir, readAgentEvents } from './lib/agent-evidence.mjs';
import { sha256Artifact } from './lib/result-contract.mjs';
import { assertNoSymlinkComponents, assertSafeId, assertSafeRunId, canonicalPath, resolveWithin } from './lib/safe-paths.mjs';
import { sessionIdFromEnv } from './lib/sessions.mjs';
import { withRecoverableTaskLock } from './lib/task-lock.mjs';
import {
  loadVerifyCasePlan,
  validateVerifyCommandEvidence,
  verifyCommandEvidenceRef,
  verifyCommandOutputRef,
} from './lib/verify-command-evidence.mjs';

function fail(message) {
  console.error(`BLOCK [EH-VERIFY-RUN-001] ${message}`);
  process.exit(2);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value ?? '').digest('hex');
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function loadState(root, changeId) {
  const ref = `harness/changes/${changeId}/state.json`;
  const state = JSON.parse(fs.readFileSync(path.join(root, ref), 'utf-8'));
  if (state.schemaVersion !== 6 || state.changeId !== changeId || state.lifecycle !== 'active' || state.stage !== 'verify') {
    throw new Error('verify-run requires an active State v6 change in verify');
  }
  return { state, ref };
}

function validateHandoff(root, changeId, runId) {
  const input = loadHandoffV2(root, changeId, runId);
  if (input.role !== 'execute' || input.stage !== 'verify' || input.behavior !== 'verify.collect'
      || input.agent?.type !== 'enterprise-harness:artifact-worker' || input.agent?.skill !== 'verify') {
    throw new Error('handoff must be a canonical verify.collect artifact-worker run');
  }
  loadState(root, changeId);
  for (const ref of [
    `harness/changes/${changeId}/tasks.md`,
    `harness/changes/${changeId}/task-commands.json`,
    `harness/changes/${changeId}/test-cases.md`,
    `harness/changes/${changeId}/evidence/completion/design.json`,
    `harness/changes/${changeId}/evidence/completion/plan.json`,
    `harness/changes/${changeId}/evidence/completion/implement.json`,
  ]) {
    if (!input.inputRefs.includes(ref)) throw new Error(`handoff inputRefs must include ${ref}`);
  }
  for (const ref of input.inputRefs) {
    if (sha256Artifact(root, ref) !== input.inputDigests[ref]) throw new Error(`handoff input is stale: ${ref}`);
  }
  return input;
}

function resolveAgent(root, changeId, runId) {
  const sessionId = sessionIdFromEnv();
  const requestedAgentId = String(process.env.CLAUDE_AGENT_ID || process.env.HARNESS_VERIFY_AGENT_ID || '').trim();
  if (!sessionId && !requestedAgentId) throw new Error('ENTERPRISE_HARNESS_SESSION_ID is required when no adapter agent id is supplied');
  const candidates = requestedAgentId ? [requestedAgentId] : [...new Set(readAgentEvents(root, changeId)
    .filter((event) => event.kind === 'start'
      && event.sessionId === sessionId
      && event.observedAgentType === 'enterprise-harness:artifact-worker'
      && event.cwd && canonicalPath(event.cwd) === canonicalPath(root))
    .map((event) => event.agentId))];
  const bindings = candidates.map((agentId) => ({
    agentId,
    binding: activeHarnessSkillAgent(root, changeId, { agentId, sessionId, skill: 'verify' }),
  })).filter(({ binding }) => binding?.dispatch?.runId === runId);
  if (bindings.length !== 1) throw new Error('verify-run requires exactly one active Verify worker bound to this handoff');
  return bindings[0].agentId;
}

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('Usage: node runtime/verify-run.mjs <change-id> <verify-run-id> <TC-id>');
  process.exit(0);
}
if (process.argv.includes('--')) fail('external child argv is forbidden; verify-run resolves frozen argv internally');
const args = process.argv.slice(2);
const [changeId, runId, tcId] = args;
if (args.length !== 3) fail('usage: verify-run <change-id> <verify-run-id> <TC-id>');
try {
  assertSafeId(changeId, 'changeId');
  assertSafeRunId(runId, 'runId');
  if (!/^TC[1-9][0-9]*$/u.test(String(tcId || ''))) throw new Error('tcId must be a canonical TC identifier');
} catch (error) {
  fail(error.message);
}

const root = path.resolve(process.cwd());
if (activeChangeId(root) !== changeId) fail(`active change is not ${changeId}`);
let input;
let agentId;
let plan;
try {
  input = validateHandoff(root, changeId, runId);
  agentId = resolveAgent(root, changeId, runId);
  plan = loadVerifyCasePlan(root, changeId, tcId);
  if (!plan.ok) throw new Error(plan.problems.join('; '));
} catch (error) {
  fail(error.message);
}

const evidenceRef = verifyCommandEvidenceRef(changeId, runId, tcId);
const evidencePath = resolveWithin(root, evidenceRef, 'verification command evidence');
const changeDir = path.join(root, 'harness', 'changes', changeId);
assertNoSymlinkComponents(changeDir, evidencePath, 'verification command evidence');
let evidence;
try {
  const lockPath = path.join(gitCommonDir(root), 'enterprise-harness', 'verify-runs', changeId, runId, tcId);
  fs.mkdirSync(path.dirname(lockPath), { recursive: true, mode: 0o700 });
  withRecoverableTaskLock(lockPath, () => {
    if (fs.existsSync(evidencePath)) throw new Error(`verification command evidence already exists: ${evidenceRef}`);
    const executions = [];
    const outputs = [];
    for (const [index, command] of plan.commands.entries()) {
      const currentInput = validateHandoff(root, changeId, runId);
      if (!sameJson(currentInput, input)) throw new Error('verify handoff changed during command execution');
      const startedAt = new Date().toISOString();
      const child = spawnSync(command.argv[0], command.argv.slice(1), {
        cwd: root,
        encoding: 'utf-8',
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 32 * 1024 * 1024,
      });
      const finishedAt = new Date().toISOString();
      const stdout = child.stdout || '';
      const stderr = child.stderr || '';
      const outcome = child.error ? 'spawn-error' : child.signal ? 'signal' : 'exit';
      const stdoutRef = verifyCommandOutputRef(changeId, runId, tcId, index + 1, 'stdout');
      const stderrRef = verifyCommandOutputRef(changeId, runId, tcId, index + 1, 'stderr');
      outputs.push({ ref: stdoutRef, content: stdout }, { ref: stderrRef, content: stderr });
      executions.push({
        taskId: command.taskId,
        phase: command.phase,
        argv: [...command.argv],
        outcome,
        exitCode: outcome === 'exit' ? child.status : null,
        signal: outcome === 'signal' ? child.signal : null,
        spawnError: outcome === 'spawn-error' ? String(child.error.code || child.error.message) : null,
        startedAt,
        finishedAt,
        stdoutDigest: sha256(stdout),
        stderrDigest: sha256(stderr),
        stdoutRef,
        stderrRef,
      });
    }
    evidence = {
      evidenceVersion: 1,
      type: 'verification-command-evidence',
      changeId,
      verifyRunId: runId,
      tcId,
      agent: { id: agentId, type: 'enterprise-harness:artifact-worker', skill: 'verify' },
      inputDigests: { ...input.inputDigests },
      executions,
      status: executions.every((execution) => execution.outcome === 'exit' && execution.exitCode === 0) ? 'pass' : 'block',
      completedAt: new Date().toISOString(),
    };
    fs.mkdirSync(path.dirname(evidencePath), { recursive: true, mode: 0o700 });
    for (const output of outputs) {
      const target = resolveWithin(root, output.ref, 'verification command output');
      assertNoSymlinkComponents(changeDir, target, 'verification command output');
      fs.writeFileSync(target, output.content, { encoding: 'utf-8', flag: 'wx', mode: 0o600 });
    }
    const problems = validateVerifyCommandEvidence(root, evidence, {
      expectedChangeId: changeId,
      expectedVerifyRunId: runId,
      expectedTcId: tcId,
      expectedInputDigests: input.inputDigests,
    });
    if (problems.length > 0) throw new Error(problems.join('; '));
    fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, { encoding: 'utf-8', flag: 'wx', mode: 0o600 });
  });
} catch (error) {
  fail(error.message);
}

console.log(`VERIFY_EVIDENCE=${evidenceRef}`);
if (evidence.status !== 'pass') fail(`${tcId} frozen verification command failed; inspect ${evidenceRef}`);
