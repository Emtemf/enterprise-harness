import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { loadHandoffV2 } from '../core/handoff-v2.mjs';
import { activeChangeId, activeHandoffAgentBinding, boundHarnessAgent, gitCommonDir } from './agent-evidence.mjs';
import { sha256Artifact } from './result-contract.mjs';
import {
  assertSafeId,
  assertSafeRunId,
  canonicalPath,
  resolveChild,
} from './safe-paths.mjs';
import { resolveTaskExecutionCommand } from './task-execution.mjs';
import {
  taskExecutionReceiptPath,
  taskExecutionReceiptSpoolPath,
} from './task-execution-receipt.mjs';

const runtimeDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const trustedRunner = path.join(runtimeDir, 'task-run.mjs');
const trustedCli = path.join(runtimeDir, 'cli.mjs');
const TEMPLATE_SCRIPTS = new Map([
  ['${CLAUDE_PLUGIN_ROOT}/runtime/task-run.mjs', trustedRunner],
  ['${CLAUDE_PLUGIN_ROOT}/runtime/cli.mjs', trustedCli],
  ['${CLAUDE_SKILL_DIR}/../../runtime/cli.mjs', trustedCli],
]);

function tokenize(command) {
  const input = String(command || '').trim();
  if (!input || /[;&|<>`\n\r\0]/u.test(input) || input.includes('$(')) return null;
  const tokens = [];
  let index = 0;
  while (index < input.length) {
    while (/\s/u.test(input[index] || '')) index += 1;
    if (index >= input.length) break;
    const quote = input[index] === '"' || input[index] === "'" ? input[index] : null;
    if (quote) index += 1;
    const start = index;
    while (index < input.length && (quote ? input[index] !== quote : !/\s/u.test(input[index]))) {
      index += 1;
    }
    if (quote && input[index] !== quote) return null;
    const token = input.slice(start, index);
    if (!token) return null;
    tokens.push(token);
    if (quote) index += 1;
  }
  return tokens;
}

function trustedScriptPath(root, cwd, script) {
  if (TEMPLATE_SCRIPTS.has(script)) return TEMPLATE_SCRIPTS.get(script);
  const absolute = path.resolve(cwd || root, script);
  if (absolute === trustedRunner || absolute === trustedCli) return absolute;
  return null;
}

export function parseTaskRunLauncher(root, command, cwd = root) {
  const tokens = tokenize(command);
  if (!tokens || !['node', process.execPath].includes(tokens[0])) {
    return { ok: false, recognized: false, problems: ['只允许 canonical task-run launcher'] };
  }
  const script = trustedScriptPath(root, cwd, tokens[1]);
  if (!script) {
    return { ok: false, recognized: false, problems: ['task-run launcher 必须使用受信 runtime'] };
  }
  const usesCli = script === trustedCli;
  const offset = usesCli ? 3 : 2;
  if (usesCli && tokens[2] !== 'task-run') {
    return { ok: false, recognized: false, problems: ['runtime CLI action 必须是 task-run'] };
  }
  if (tokens.length !== offset + 4) {
    return { ok: false, recognized: true, problems: ['task-run launcher 不得携带 child argv 或 shell 操作符'] };
  }
  const [changeId, taskId, runId, phase] = tokens.slice(offset);
  return {
    ok: true,
    recognized: true,
    changeId,
    taskId,
    runId,
    phase,
    problems: [],
  };
}

function loadState(root, changeId) {
  const changesRoot = path.join(root, 'harness', 'changes');
  const changeDir = resolveChild(changesRoot, changeId, 'changeId');
  const statePath = path.join(changeDir, 'state.json');
  if (!fs.existsSync(statePath)) throw new Error('state.json is missing');
  return JSON.parse(fs.readFileSync(statePath, 'utf-8'));
}

function executionIndex(root, changeId, taskId, runId, input, agentId) {
  const spoolPath = taskExecutionReceiptSpoolPath(root, changeId, taskId, runId);
  if (!fs.existsSync(spoolPath)) return 0;
  const spool = JSON.parse(fs.readFileSync(spoolPath, 'utf-8'));
  const receipt = spool?.receipt;
  if (spool?.spoolVersion !== 1 || spool?.runId !== runId || !receipt) {
    throw new Error('existing task receipt spool is invalid');
  }
  if (receipt.changeId !== changeId || receipt.taskId !== taskId
    || receipt.agent?.id !== agentId
    || JSON.stringify(receipt.inputDigests) !== JSON.stringify(input.inputDigests)) {
    throw new Error('existing task receipt spool does not match this execution');
  }
  return receipt.executions?.length || 0;
}

export function validateTaskRunLauncher(root, command, event = {}) {
  const parsed = parseTaskRunLauncher(root, command, event.cwd || root);
  if (!parsed.ok) return parsed;
  const problems = [];
  try {
    assertSafeId(parsed.changeId, 'changeId');
    assertSafeId(parsed.taskId, 'taskId');
    assertSafeRunId(parsed.runId, 'runId');
    if (activeChangeId(root) !== parsed.changeId) {
      throw new Error(`active change is not ${parsed.changeId}`);
    }
    const state = loadState(root, parsed.changeId);
    if (state.schemaVersion !== 6 || state.lifecycle !== 'active' || state.stage !== 'implement') {
      throw new Error('task-run requires an active State v6 change in implement');
    }
    if (state.currentTask !== parsed.taskId) {
      throw new Error(`currentTask must be ${parsed.taskId}`);
    }
    const input = loadHandoffV2(root, parsed.changeId, parsed.runId);
    if (input.role !== 'execute' || input.stage !== 'implement'
      || input.agent?.type !== 'enterprise-harness:implementer'
      || input.agent?.skill !== 'implement') {
      throw new Error('handoff must be an implementer/implement execute run');
    }
    const agentId = String(event.agent_id || '').trim();
    const activeBinding = activeHandoffAgentBinding(root, parsed.changeId, input, {
      agentId,
      sessionId: event.session_id,
    });
    const completedBinding = boundHarnessAgent(
      root,
      parsed.changeId,
      agentId,
      'enterprise-harness:implementer',
    );
    const binding = activeBinding || completedBinding;
    const boundRunId = binding?.binding?.runId || binding?.dispatch?.runId;
    const startedRunId = binding?.start?.runId || binding?.dispatch?.runId;
    if (!binding || boundRunId !== parsed.runId || startedRunId !== parsed.runId) {
      throw new Error('implementer binding does not match the execute handoff run');
    }
    if (!binding.start.cwd || canonicalPath(binding.start.cwd) !== canonicalPath(root)) {
      throw new Error('implementer start cwd does not match this worktree');
    }
    for (const ref of input.inputRefs) {
      if (sha256Artifact(root, ref) !== input.inputDigests[ref]) {
        throw new Error(`handoff input is stale: ${ref}`);
      }
    }
    if (fs.existsSync(taskExecutionReceiptPath(root, parsed.changeId, parsed.taskId))) {
      throw new Error('task is already finalized');
    }
    const index = executionIndex(
      root,
      parsed.changeId,
      parsed.taskId,
      parsed.runId,
      input,
      agentId,
    );
    const resolution = resolveTaskExecutionCommand(
      root,
      parsed.changeId,
      parsed.taskId,
      parsed.phase,
      index,
    );
    if (!resolution.ok) problems.push(...resolution.problems);
  } catch (error) {
    problems.push(error.message);
  }
  return { ...parsed, ok: problems.length === 0, problems };
}

export function activeTaskRunAuthorizationPath(root, changeId, runId) {
  assertSafeId(changeId, 'changeId');
  assertSafeRunId(runId, 'runId');
  const authorizationRoot = path.join(gitCommonDir(root), 'enterprise-harness', 'active-task-runs');
  const changeRoot = resolveChild(authorizationRoot, changeId, 'changeId');
  return path.join(changeRoot, `${runId}.json`);
}
