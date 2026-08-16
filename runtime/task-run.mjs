import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { loadHandoffV2 } from './core/handoff-v2.mjs';
import {
  activeChangeId,
  boundHarnessAgent,
  gitCommonDir,
} from './lib/agent-evidence.mjs';
import {
  captureWorktreeBaseline,
  changedPathsSinceBaseline,
  headSnapshotDigest,
  runGit,
  worktreeSnapshotDigest,
} from './lib/git-evidence.mjs';
import { sha256Artifact } from './lib/result-contract.mjs';
import { assertSafeId, assertSafeRunId } from './lib/safe-paths.mjs';
import { atomicWriteJson, withFileLock } from './lib/state-store.mjs';
import { resolveTaskExecutionCommand } from './lib/task-execution.mjs';
import { activeTaskRunAuthorizationPath } from './lib/task-run-authorization.mjs';
import {
  taskExecutionReceiptPath,
  taskExecutionReceiptSpoolPath,
  validateTaskExecutionReceipt,
} from './lib/task-execution-receipt.mjs';

function fail(message) {
  console.error(`BLOCK [EH-TASK-RECEIPT-025] ${message}`);
  process.exit(2);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value ?? '').digest('hex');
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function writeExclusiveJson(target, value) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: 'utf-8',
      mode: 0o600,
      flag: 'wx',
    });
    fs.linkSync(temporary, target);
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error(`exclusive runtime artifact already exists: ${target}`);
    throw error;
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

function loadState(root, changeId) {
  const statePath = path.join(root, 'harness', 'changes', changeId, 'state.json');
  if (!fs.existsSync(statePath)) throw new Error('state.json is missing');
  const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
  if (state.schemaVersion !== 6) throw new Error('task-run only accepts State v6');
  if (state.changeId !== changeId) throw new Error('state changeId does not match the requested change');
  if (state.stage !== 'implement') throw new Error(`state stage must be implement, got ${state.stage}`);
  return { state, ref: `harness/changes/${changeId}/state.json` };
}

function validateHandoff(root, changeId, taskId, runId) {
  const input = loadHandoffV2(root, changeId, runId);
  if (input.role !== 'execute' || input.stage !== 'implement'
    || input.agent?.type !== 'enterprise-harness:implementer'
    || input.agent?.skill !== 'implement') {
    throw new Error('handoff must be an implementer/implement execute run');
  }
  const { state, ref: stateRef } = loadState(root, changeId);
  if (state.currentTask !== taskId) {
    throw new Error(`currentTask must be ${taskId}`);
  }
  const taskCommandsRef = `harness/changes/${changeId}/task-commands.json`;
  for (const requiredRef of [stateRef, taskCommandsRef]) {
    if (!input.inputRefs.includes(requiredRef)) {
      throw new Error(`handoff inputRefs must include ${requiredRef}`);
    }
  }
  for (const ref of input.inputRefs) {
    if (sha256Artifact(root, ref) !== input.inputDigests[ref]) {
      throw new Error(`handoff input is stale: ${ref}`);
    }
  }
  return input;
}

function resolveBinding(root, changeId, runId) {
  const agentId = String(
    process.env.CLAUDE_AGENT_ID || process.env.HARNESS_IMPLEMENTER_ID || '',
  ).trim();
  if (!agentId) throw new Error('CLAUDE_AGENT_ID or HARNESS_IMPLEMENTER_ID is required');
  const binding = boundHarnessAgent(
    root,
    changeId,
    agentId,
    'enterprise-harness:implementer',
  );
  if (!binding) throw new Error('task-run requires an active bound enterprise-harness:implementer');
  if (binding.binding.runId !== runId || binding.start.runId !== runId) {
    throw new Error('implementer binding does not match the execute handoff run');
  }
  if (path.resolve(binding.start.cwd || '') !== root) {
    throw new Error('implementer start cwd does not match this worktree');
  }
  return agentId;
}

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('Usage: node runtime/task-run.mjs <change-id> <task-id> <run-id> <phase>');
  process.exit(0);
}

const separator = process.argv.indexOf('--');
if (separator >= 0) fail('external child argv is forbidden; the runner resolves frozen argv internally');
const requestArgs = process.argv.slice(2);
const [changeId, taskId, runId, phaseRaw] = requestArgs;
if (requestArgs.length !== 4) {
  fail('usage: task-run <change-id> <task-id> <run-id> <phase>');
}

try {
  assertSafeId(changeId, 'changeId');
  assertSafeId(taskId, 'taskId');
  assertSafeRunId(runId, 'runId');
} catch (error) {
  fail(error.message);
}

const root = path.resolve(process.cwd());
if (activeChangeId(root) !== changeId) fail(`active change is not ${changeId}`);

let input;
let agentId;
try {
  input = validateHandoff(root, changeId, taskId, runId);
  agentId = resolveBinding(root, changeId, runId);
} catch (error) {
  fail(error.message);
}

const canonicalPath = taskExecutionReceiptPath(root, changeId, taskId);
if (fs.existsSync(canonicalPath)) fail(`task is already finalized; canonical receipt already exists: ${canonicalPath}`);
const spoolPath = taskExecutionReceiptSpoolPath(root, changeId, taskId, runId);
fs.mkdirSync(path.dirname(spoolPath), { recursive: true });

let childStatus = 2;
try {
  withFileLock(spoolPath, () => {
    let spool = null;
    if (fs.existsSync(spoolPath)) {
      spool = JSON.parse(fs.readFileSync(spoolPath, 'utf-8'));
      if (spool.spoolVersion !== 1 || spool.runId !== runId) {
        throw new Error('existing task receipt spool belongs to another execute run');
      }
    }
    const previous = spool?.receipt || null;
    if (previous && (
      previous.changeId !== changeId
      || previous.taskId !== taskId
      || previous.agent?.id !== agentId
      || !sameJson(previous.inputDigests, input.inputDigests)
    )) {
      throw new Error('existing task receipt spool does not match this execution');
    }

    const executionIndex = previous?.executions?.length || 0;
    const resolution = resolveTaskExecutionCommand(
      root,
      changeId,
      taskId,
      phaseRaw,
      executionIndex,
    );
    if (!resolution.ok) throw new Error(resolution.problems.join('; '));
    const childArgv = [...resolution.command.argv];

    const baseline = spool?.statusBaseline || captureWorktreeBaseline(root);
    const headBefore = previous?.worktree?.headBefore
      || String(runGit(['rev-parse', 'HEAD'], root)).trim();
    const treeDigestBefore = previous?.worktree?.treeDigestBefore
      || headSnapshotDigest(root, headBefore);
    const startedAt = new Date().toISOString();
    const authorizationPath = activeTaskRunAuthorizationPath(root, changeId, runId);
    const authorizationToken = crypto.randomUUID();
    writeExclusiveJson(authorizationPath, {
      authorizationVersion: 1,
      changeId,
      taskId,
      runId,
      phase: resolution.phase,
      agentId,
      worktree: root,
      pid: process.pid,
      commandDigest: sha256(JSON.stringify(childArgv)),
      tokenDigest: sha256(authorizationToken),
      issuedAt: startedAt,
    });
    let child;
    try {
      child = spawnSync(childArgv[0], childArgv.slice(1), {
        cwd: root,
        encoding: 'utf-8',
        shell: false,
        env: {
          ...process.env,
          ENTERPRISE_HARNESS_TASK_AUTH: authorizationPath,
          ENTERPRISE_HARNESS_TASK_AUTH_TOKEN: authorizationToken,
        },
      });
    } finally {
      fs.rmSync(authorizationPath, { force: true });
    }
    const finishedAt = new Date().toISOString();
    childStatus = child.status ?? 1;
    process.stdout.write(child.stdout || '');
    process.stderr.write(child.stderr || '');

    const headAfter = String(runGit(['rev-parse', 'HEAD'], root)).trim();
    const execution = {
      phase: resolution.phase,
      argv: [...childArgv],
      exitCode: childStatus,
      startedAt,
      finishedAt,
      stdoutDigest: sha256(child.stdout || ''),
      stderrDigest: sha256(child.stderr || ''),
    };
    const receipt = {
      receiptVersion: 1,
      provenance: 'runtime-runner',
      changeId,
      taskId,
      executionStrategy: resolution.strategy,
      ...(resolution.strategy === 'direct'
        ? { strategyRationale: resolution.task.strategyRationale }
        : {}),
      agent: {
        id: agentId,
        type: 'enterprise-harness:implementer',
      },
      worktree: {
        path: root,
        gitCommonDir: gitCommonDir(root),
        headBefore,
        headAfter,
        treeDigestBefore,
        treeDigestAfter: worktreeSnapshotDigest(root),
      },
      changedPaths: changedPathsSinceBaseline(root, baseline),
      inputDigests: { ...input.inputDigests },
      executions: [
        ...(previous?.executions || []),
        execution,
      ],
      ...(resolution.isFinal ? { completedAt: finishedAt } : {}),
    };
    atomicWriteJson(spoolPath, {
      spoolVersion: 1,
      runId,
      statusBaseline: baseline,
      receipt,
    });

    if (resolution.isFinal) {
      const problems = validateTaskExecutionReceipt(receipt, {
        root,
        expectedChangeId: changeId,
        expectedTaskId: taskId,
        expectedStrategy: resolution.strategy,
        expectedAgent: agentId,
        expectedInputDigests: input.inputDigests,
        requireTrusted: true,
      });
      if (problems.length > 0) {
        throw new Error(`refusing invalid final task receipt: ${problems.join('; ')}`);
      }
      writeExclusiveJson(canonicalPath, receipt);
    }
    console.log(`TASK_RECEIPT_SPOOL=${spoolPath}`);
    if (resolution.isFinal) console.log(`TASK_RECEIPT=${canonicalPath}`);
  });
} catch (error) {
  fail(error.message);
}

process.exit(childStatus);
