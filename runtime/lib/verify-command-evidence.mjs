import fs from 'node:fs';
import path from 'node:path';
import { sha256Artifact } from './result-contract.mjs';
import {
  assertNoSymlinkComponents,
  assertSafeId,
  assertSafeRunId,
  resolveChild,
  resolveWithin,
} from './safe-paths.mjs';
import { loadTaskExecutionPlan } from './task-execution.mjs';
import { taskTestCaseBindingsFromMarkdown } from './plan-test-case-binding.mjs';

const DIGEST = /^[a-f0-9]{64}$/u;
const TC_ID = /^TC[1-9][0-9]*$/u;
const EVIDENCE_FIELDS = new Set([
  'evidenceVersion', 'type', 'changeId', 'verifyRunId', 'tcId', 'agent',
  'inputDigests', 'executions', 'status', 'completedAt',
]);
const AGENT_FIELDS = new Set(['id', 'type', 'skill']);
const EXECUTION_FIELDS = new Set([
  'taskId', 'phase', 'argv', 'outcome', 'exitCode', 'signal', 'spawnError',
  'startedAt', 'finishedAt', 'stdoutDigest', 'stderrDigest', 'stdoutRef', 'stderrRef',
]);

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function rejectUnknown(value, label, allowed, problems) {
  if (!isObject(value)) return;
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) problems.push(`${label} has unknown property ${key}`);
  }
}

function sha256ChangeArtifact(root, changeId, ref, label) {
  const changeDir = resolveChild(path.join(root, 'harness', 'changes'), changeId, 'changeId');
  const target = resolveWithin(root, ref, label);
  assertNoSymlinkComponents(changeDir, target, label);
  return sha256Artifact(root, ref);
}

export function verifyCommandEvidenceRef(changeId, verifyRunId, tcId) {
  assertSafeId(changeId, 'changeId');
  assertSafeRunId(verifyRunId, 'verifyRunId');
  if (!TC_ID.test(String(tcId || ''))) throw new Error('tcId must be a canonical TC identifier');
  return `harness/changes/${changeId}/evidence/verify/${verifyRunId}/${tcId}.json`;
}

export function verifyCommandOutputRef(changeId, verifyRunId, tcId, index, stream) {
  const evidenceRef = verifyCommandEvidenceRef(changeId, verifyRunId, tcId);
  if (!Number.isInteger(index) || index < 1) throw new Error('command index must be a positive integer');
  if (!['stdout', 'stderr'].includes(stream)) throw new Error('stream must be stdout or stderr');
  return `${evidenceRef.slice(0, -5)}-${index}.${stream}.log`;
}

export function loadVerifyCasePlan(root, changeId, tcId) {
  assertSafeId(changeId, 'changeId');
  if (!TC_ID.test(String(tcId || ''))) return { ok: false, commands: [], problems: ['tcId must be a canonical TC identifier'] };
  const base = `harness/changes/${changeId}`;
  let tasks;
  try {
    tasks = fs.readFileSync(path.join(root, base, 'tasks.md'), 'utf-8');
  } catch (error) {
    return { ok: false, commands: [], problems: [`tasks.md is unreadable: ${error.message}`] };
  }
  const bindings = taskTestCaseBindingsFromMarkdown(tasks);
  const mapped = bindings.tasks.filter((task) => task.testCases.includes(tcId));
  const problems = [...bindings.problems];
  if (mapped.length === 0) problems.push(`${tcId} is not mapped by any plan task`);
  const commands = [];
  for (const task of mapped) {
    const plan = loadTaskExecutionPlan(root, changeId, task.taskId);
    if (!plan.ok) {
      problems.push(...plan.problems.map((problem) => `${task.taskId}: ${problem}`));
      continue;
    }
    const command = plan.commands.at(-1);
    commands.push({ taskId: task.taskId, phase: command.phase, argv: [...command.argv] });
  }
  return { ok: problems.length === 0, commands, problems: [...new Set(problems)] };
}

export function validateVerifyCommandEvidence(root, evidence, {
  expectedChangeId = null,
  expectedVerifyRunId = null,
  expectedTcId = null,
  expectedInputDigests = null,
} = {}) {
  const problems = [];
  if (!isObject(evidence)) return ['verification command evidence must be an object'];
  rejectUnknown(evidence, 'verification command evidence', EVIDENCE_FIELDS, problems);
  if (evidence.evidenceVersion !== 1) problems.push('evidenceVersion must be 1');
  if (evidence.type !== 'verification-command-evidence') problems.push('type must be verification-command-evidence');
  try { assertSafeId(evidence.changeId, 'changeId'); } catch (error) { problems.push(error.message); }
  try { assertSafeRunId(evidence.verifyRunId, 'verifyRunId'); } catch (error) { problems.push(error.message); }
  if (!TC_ID.test(String(evidence.tcId || ''))) problems.push('tcId must be a canonical TC identifier');
  if (expectedChangeId && evidence.changeId !== expectedChangeId) problems.push(`changeId must be ${expectedChangeId}`);
  if (expectedVerifyRunId && evidence.verifyRunId !== expectedVerifyRunId) problems.push(`verifyRunId must be ${expectedVerifyRunId}`);
  if (expectedTcId && evidence.tcId !== expectedTcId) problems.push(`tcId must be ${expectedTcId}`);
  rejectUnknown(evidence.agent, 'agent', AGENT_FIELDS, problems);
  if (!String(evidence.agent?.id || '').trim()) problems.push('agent.id is required');
  if (evidence.agent?.type !== 'enterprise-harness:artifact-worker' || evidence.agent?.skill !== 'verify') {
    problems.push('agent must be enterprise-harness:artifact-worker with skill verify');
  }
  if (!isObject(evidence.inputDigests) || Object.keys(evidence.inputDigests).length === 0) {
    problems.push('inputDigests must be a non-empty object');
  } else {
    for (const [ref, digest] of Object.entries(evidence.inputDigests)) {
      if (!DIGEST.test(String(digest || ''))) problems.push(`inputDigests.${ref} must be sha256`);
      try {
        if (sha256ChangeArtifact(root, evidence.changeId, ref, 'verify input') !== digest) {
          problems.push(`input digest is stale: ${ref}`);
        }
      } catch (error) {
        problems.push(`input is unreadable: ${ref} (${error.message})`);
      }
    }
  }
  if (expectedInputDigests && !sameJson(evidence.inputDigests, expectedInputDigests)) {
    problems.push('inputDigests do not exactly match the verify handoff');
  }
  const plan = loadVerifyCasePlan(root, expectedChangeId || evidence.changeId, expectedTcId || evidence.tcId);
  if (!plan.ok) problems.push(...plan.problems);
  if (!Array.isArray(evidence.executions) || evidence.executions.length === 0) {
    problems.push('executions must be a non-empty array');
  } else {
    if (plan.ok && evidence.executions.length !== plan.commands.length) {
      problems.push('executions must exactly cover the frozen Verify commands');
    }
    let previousFinished = -Infinity;
    for (const [index, execution] of evidence.executions.entries()) {
      if (!isObject(execution)) {
        problems.push(`executions[${index}] must be an object`);
        continue;
      }
      rejectUnknown(execution, `executions[${index}]`, EXECUTION_FIELDS, problems);
      const expected = plan.commands[index];
      if (expected && (execution.taskId !== expected.taskId || execution.phase !== expected.phase
          || !sameJson(execution.argv, expected.argv))) {
        problems.push(`executions[${index}] differs from the frozen Verify command`);
      }
      if (!['exit', 'signal', 'spawn-error'].includes(execution.outcome)) problems.push(`executions[${index}].outcome is invalid`);
      if (execution.outcome === 'exit') {
        if (!Number.isInteger(execution.exitCode)) problems.push(`executions[${index}].exitCode must be an integer`);
        if (execution.signal !== null || execution.spawnError !== null) problems.push(`executions[${index}] exit outcome fields are invalid`);
      } else {
        if (execution.exitCode !== null) problems.push(`executions[${index}].exitCode must be null for ${execution.outcome}`);
        if (execution.outcome === 'signal'
            && (!String(execution.signal || '').trim() || execution.spawnError !== null)) {
          problems.push(`executions[${index}] signal outcome fields are invalid`);
        }
        if (execution.outcome === 'spawn-error'
            && (!String(execution.spawnError || '').trim() || execution.signal !== null)) {
          problems.push(`executions[${index}] spawn-error outcome fields are invalid`);
        }
      }
      const started = Date.parse(execution.startedAt);
      const finished = Date.parse(execution.finishedAt);
      if (!Number.isFinite(started) || !Number.isFinite(finished) || finished < started || started < previousFinished) {
        problems.push(`executions[${index}] timestamps are invalid`);
      } else previousFinished = finished;
      for (const stream of ['stdout', 'stderr']) {
        const ref = execution[`${stream}Ref`];
        const digest = execution[`${stream}Digest`];
        const canonical = verifyCommandOutputRef(evidence.changeId, evidence.verifyRunId, evidence.tcId, index + 1, stream);
        if (ref !== canonical) problems.push(`executions[${index}].${stream}Ref must be ${canonical}`);
        if (!DIGEST.test(String(digest || ''))) problems.push(`executions[${index}].${stream}Digest must be sha256`);
        try {
          if (sha256ChangeArtifact(root, evidence.changeId, ref, 'verification command output') !== digest) {
            problems.push(`executions[${index}].${stream}Digest is stale`);
          }
        } catch (error) {
          problems.push(`executions[${index}].${stream}Ref is unreadable: ${error.message}`);
        }
      }
    }
  }
  const passing = Array.isArray(evidence.executions) && evidence.executions.length > 0
    && evidence.executions.every((execution) => execution?.outcome === 'exit' && execution.exitCode === 0);
  if (evidence.status !== (passing ? 'pass' : 'block')) problems.push(`status must be ${passing ? 'pass' : 'block'}`);
  if (!Number.isFinite(Date.parse(evidence.completedAt))) problems.push('completedAt must be an ISO timestamp');
  return [...new Set(problems)];
}

export function readVerifyCommandEvidence(root, changeId, verifyRunId, tcId, options = {}) {
  const ref = verifyCommandEvidenceRef(changeId, verifyRunId, tcId);
  const changeDir = resolveChild(path.join(root, 'harness', 'changes'), changeId, 'changeId');
  try {
    const target = resolveWithin(root, ref, 'verification command evidence');
    assertNoSymlinkComponents(changeDir, target, 'verification command evidence');
    const evidence = JSON.parse(fs.readFileSync(target, 'utf-8'));
    const problems = validateVerifyCommandEvidence(root, evidence, {
      expectedChangeId: changeId,
      expectedVerifyRunId: verifyRunId,
      expectedTcId: tcId,
      ...options,
    });
    return { ok: problems.length === 0, ref, evidence, problems };
  } catch (error) {
    return { ok: false, ref, evidence: null, problems: [`verification command evidence is unreadable: ${error.message}`] };
  }
}
