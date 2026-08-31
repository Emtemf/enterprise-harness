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
import {
  assertNoSymlinkComponents,
  assertSafeId,
  assertSafeRunId,
  canonicalPath as canonicalizePath,
} from './lib/safe-paths.mjs';
import { resolveTaskExecutionCommand } from './lib/task-execution.mjs';
import { taskWriteScopeViolations } from './lib/task-write-scope.mjs';
import { withRecoverableTaskLock, processIdentityForPid } from './lib/task-lock.mjs';
import {
  publishTaskReceiptArtifacts,
  recoverTaskReceiptSpool,
  writeExclusiveJson,
} from './lib/task-receipt-publication.mjs';
import { activeTaskRunAuthorizationPath } from './lib/task-run-authorization.mjs';
import { parseTaskChildOutcome } from './lib/task-child-outcome.mjs';
import {
  taskExecutionReceiptPath,
  taskExecutionReceiptSpoolPath,
  readTaskExecutionReceipt,
  TASK_EXECUTION_PHASES,
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

function assertReceiptWorktree(receipt, root, commonDir) {
  if (!receipt?.worktree
    || canonicalizePath(receipt.worktree.path) !== canonicalizePath(root)
    || canonicalizePath(receipt.worktree.gitCommonDir) !== canonicalizePath(commonDir)) {
    throw new Error('task receipt worktree does not match the current execution worktree');
  }
}

function loadState(root, changeId) {
  const statePath = path.join(root, 'harness', 'changes', changeId, 'state.json');
  if (!fs.existsSync(statePath)) throw new Error('state.json is missing');
  const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
  if (state.schemaVersion !== 6) throw new Error('task-run only accepts State v6');
  if (state.changeId !== changeId) throw new Error('state changeId does not match the requested change');
  if (state.lifecycle !== 'active') throw new Error(`state lifecycle must be active, got ${state.lifecycle}`);
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

function revalidateHandoff(root, changeId, taskId, runId, expectedInput) {
  if (activeChangeId(root) !== changeId) {
    throw new Error(`active change is not ${changeId}`);
  }
  const currentInput = validateHandoff(root, changeId, taskId, runId);
  if (!sameJson(currentInput, expectedInput)) {
    throw new Error('execute handoff changed after task-run validation');
  }
  return currentInput;
}

function clearRecoverableAuthorization(target, expected) {
  if (!fs.existsSync(target)) return;
  let marker;
  try {
    marker = JSON.parse(fs.readFileSync(target, 'utf-8'));
  } catch {
    return;
  }
  const validMarker = marker.authorizationVersion === 1
    && marker.changeId === expected.changeId
    && marker.taskId === expected.taskId
    && marker.runId === expected.runId
    && marker.agentId === expected.agentId
    && Number.isInteger(marker.pid)
    && marker.pid > 0;
  if (!validMarker) return;
  const recordedIdentity = marker.processIdentity || null;
  const currentIdentity = processIdentityForPid(marker.pid);
  if (recordedIdentity && currentIdentity && recordedIdentity !== currentIdentity) {
    fs.rmSync(target, { force: true });
    return;
  }
  try {
    process.kill(marker.pid, 0);
    return;
  } catch (error) {
    if (error.code !== 'ESRCH') return;
  }
  fs.rmSync(target, { force: true });
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
  if (!binding.start.cwd || canonicalizePath(binding.start.cwd) !== canonicalizePath(root)) {
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
const childWrapper = path.resolve(path.dirname(process.argv[1]), 'task-child.mjs');
const commonDir = gitCommonDir(root);
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
const spoolPath = taskExecutionReceiptSpoolPath(root, changeId, taskId, runId);
const taskLockPath = path.join(path.dirname(spoolPath), 'task-execution');
const intentPath = `${spoolPath}.intent`;
assertNoSymlinkComponents(root, canonicalPath, 'canonical task receipt path');
assertNoSymlinkComponents(commonDir, spoolPath, 'task receipt spool path');
assertNoSymlinkComponents(commonDir, taskLockPath, 'task execution lock path');
assertNoSymlinkComponents(commonDir, intentPath, 'task execution intent path');
fs.mkdirSync(path.dirname(canonicalPath), { recursive: true });
fs.mkdirSync(path.dirname(spoolPath), { recursive: true });

let childStatus = 2;
try {
  withRecoverableTaskLock(taskLockPath, ({ lockId }) => {
    recoverTaskReceiptSpool(spoolPath);
    if (fs.existsSync(canonicalPath)) {
      const existing = readTaskExecutionReceipt(root, changeId, taskId, {
        expectedAgent: agentId,
        expectedInputDigests: input.inputDigests,
        requireTrusted: true,
        requireFreshInputs: true,
      });
      if (existing.ok) {
        assertReceiptWorktree(existing.receipt, root, commonDir);
        if (!fs.existsSync(spoolPath)) {
          throw new Error('canonical task receipt is not bound to this execute run');
        }
        let currentSpool;
        try {
          currentSpool = JSON.parse(fs.readFileSync(spoolPath, 'utf-8'));
        } catch (error) {
          throw new Error(`current task receipt spool is unreadable: ${error.message}`);
        }
        if (currentSpool.spoolVersion !== 1
          || currentSpool.runId !== runId
          || !sameJson(currentSpool.receipt, existing.receipt)) {
          throw new Error('canonical task receipt is not bound to this execute run');
        }
        revalidateHandoff(root, changeId, taskId, runId, input);
        console.log(`TASK_RECEIPT=${canonicalPath}`);
        childStatus = 0;
        return;
      }
      throw new Error(
        `task is already finalized; canonical receipt is invalid or stale: `
        + existing.problems.join('; '),
      );
    }
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
    if (previous) assertReceiptWorktree(previous, root, commonDir);
    if (previous) {
      const priorProblems = validateTaskExecutionReceipt(previous, {
        root,
        expectedChangeId: changeId,
        expectedTaskId: taskId,
        expectedAgent: agentId,
        expectedInputDigests: input.inputDigests,
        requireTrusted: true,
        allowIncomplete: true,
      });
      if (priorProblems.length > 0) {
        throw new Error(`existing task receipt spool is invalid: ${priorProblems.join('; ')}`);
      }
    }

    if (fs.existsSync(intentPath)) {
      if (!previous) {
        throw new Error('ambiguous task execution intent exists without a receipt; manual recovery is required');
      }
      assertNoSymlinkComponents(commonDir, intentPath, 'task execution intent path');
    }

    const publishArtifacts = (receiptToPublish, spoolToPublish, isFinal) => {
      publishTaskReceiptArtifacts({
        spoolPath,
        canonicalPath,
        spool: spoolToPublish,
        receipt: receiptToPublish,
        isFinal,
        validateFresh: () => {
          revalidateHandoff(root, changeId, taskId, runId, input);
        },
        validateTarget: (target) => {
          if (target === canonicalPath) {
            assertNoSymlinkComponents(root, target, 'canonical task receipt path');
            return;
          }
          if (target === spoolPath) {
            assertNoSymlinkComponents(commonDir, target, 'task receipt spool path');
            return;
          }
          throw new Error('task receipt publication requested an unknown target');
        },
      });
      assertNoSymlinkComponents(commonDir, intentPath, 'task execution intent path');
      fs.rmSync(intentPath, { force: true });
    };

    const requiredPreviousPhases = TASK_EXECUTION_PHASES[previous?.executionStrategy];
    if (previous && requiredPreviousPhases
      && previous.executions.length === requiredPreviousPhases.length) {
      const finalProblems = validateTaskExecutionReceipt(previous, {
        root,
        expectedChangeId: changeId,
        expectedTaskId: taskId,
        expectedStrategy: previous.executionStrategy,
        expectedAgent: agentId,
        expectedInputDigests: input.inputDigests,
        requireTrusted: true,
      });
      if (finalProblems.length > 0) {
        throw new Error(`existing complete task receipt spool is invalid: ${finalProblems.join('; ')}`);
      }
      publishArtifacts(previous, spool, true);
      console.log(`TASK_RECEIPT_SPOOL=${spoolPath}`);
      console.log(`TASK_RECEIPT=${canonicalPath}`);
      childStatus = 0;
      return;
    }

    revalidateHandoff(root, changeId, taskId, runId, input);
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
    revalidateHandoff(root, changeId, taskId, runId, input);
    const authorizationPath = activeTaskRunAuthorizationPath(root, changeId, runId);
    assertNoSymlinkComponents(commonDir, authorizationPath, 'task authorization path');
    const authorizationToken = crypto.randomUUID();
    clearRecoverableAuthorization(authorizationPath, {
      changeId,
      taskId,
      runId,
      agentId,
    });
    writeExclusiveJson(authorizationPath, {
      authorizationVersion: 1,
      changeId,
      taskId,
      runId,
      phase: resolution.phase,
      agentId,
      worktree: root,
      pid: process.pid,
      processIdentity: processIdentityForPid(process.pid),
      commandDigest: sha256(JSON.stringify(childArgv)),
      tokenDigest: sha256(authorizationToken),
      issuedAt: startedAt,
    }, {
      validateTarget: () => assertNoSymlinkComponents(
        commonDir,
        authorizationPath,
        'task authorization path',
      ),
    });
    writeExclusiveJson(intentPath, {
      intentVersion: 1,
      changeId,
      taskId,
      runId,
      phase: resolution.phase,
      cwd: root,
      argv: [...childArgv],
      issuedAt: startedAt,
    }, {
      validateTarget: () => assertNoSymlinkComponents(
        commonDir,
        intentPath,
        'task execution intent path',
      ),
    });
    let child;
    try {
      child = spawnSync(process.execPath, [
        childWrapper,
        taskLockPath,
        lockId,
        intentPath,
        authorizationPath,
      ], {
        cwd: root,
        encoding: 'utf-8',
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          ENTERPRISE_HARNESS_TASK_AUTH_TOKEN: authorizationToken,
        },
      });
    } finally {
      assertNoSymlinkComponents(commonDir, authorizationPath, 'task authorization path');
      fs.rmSync(authorizationPath, { force: true });
    }
    const finishedAt = new Date().toISOString();
    process.stdout.write(child.stdout || '');
    process.stderr.write(child.stderr || '');
    if (child.error) {
      throw new Error(`task child wrapper failed to launch: ${child.error.code || child.error.message}`);
    }
    if (child.signal || !Number.isInteger(child.status)) {
      throw new Error(`task child wrapper terminated without an exit status${child.signal ? `: ${child.signal}` : ''}`);
    }
    const childOutcome = parseTaskChildOutcome(child.output?.[3]);
    if (childOutcome.kind === 'spawn-error') {
      throw new Error(`task command spawn failed: ${childOutcome.spawnError}`);
    }
    if (childOutcome.kind === 'signal') {
      throw new Error(`task command terminated by signal: ${childOutcome.signal}`);
    }
    if (child.status !== childOutcome.exitCode) {
      throw new Error('task child wrapper exit status does not match its authenticated outcome');
    }
    childStatus = childOutcome.exitCode;
    revalidateHandoff(root, changeId, taskId, runId, input);

    const changedPaths = changedPathsSinceBaseline(root, baseline);
    if (resolution.schemaVersion >= 4) {
      const scopeProblems = taskWriteScopeViolations(changedPaths, resolution.task.writeScope);
      if (scopeProblems.length > 0) {
        throw new Error(`task write scope violation: ${scopeProblems.join('; ')}`);
      }
    }
    const headAfter = String(runGit(['rev-parse', 'HEAD'], root)).trim();
    const execution = {
      phase: resolution.phase,
      argv: [...childArgv],
      outcome: childOutcome.kind,
      exitCode: childOutcome.exitCode,
      signal: childOutcome.signal,
      spawnError: childOutcome.spawnError,
      startedAt,
      finishedAt,
      stdoutDigest: sha256(child.stdout || ''),
      stderrDigest: sha256(child.stderr || ''),
    };
    const receipt = {
      receiptVersion: 2,
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
        gitCommonDir: commonDir,
        headBefore,
        headAfter,
        treeDigestBefore,
        treeDigestAfter: worktreeSnapshotDigest(root),
      },
      changedPaths,
      inputDigests: { ...input.inputDigests },
      executions: [
        ...(previous?.executions || []),
        execution,
      ],
      ...(resolution.isFinal ? { completedAt: finishedAt } : {}),
    };
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
    }

    publishArtifacts(receipt, {
      spoolVersion: 1,
      runId,
      statusBaseline: baseline,
      receipt,
    }, resolution.isFinal);
    console.log(`TASK_RECEIPT_SPOOL=${spoolPath}`);
    if (resolution.isFinal) console.log(`TASK_RECEIPT=${canonicalPath}`);
  });
} catch (error) {
  fail(error.message);
}

process.exit(childStatus);
