import fs from 'node:fs';
import path from 'node:path';
import { assertSafeId, resolveChild } from './safe-paths.mjs';
import { validateTaskWriteScope } from './task-write-scope.mjs';

export const TASK_EXECUTION_PHASES = Object.freeze({
  tdd: ['RED', 'GREEN', 'REFACTOR'],
  regression: ['REPRODUCE', 'VERIFY'],
  characterization: ['BASELINE', 'VERIFY'],
  direct: ['VERIFY'],
  migration: ['DRY_RUN', 'APPLY', 'ROLLBACK'],
  generation: ['GENERATE', 'VERIFY'],
});

export const TASK_EXECUTION_STRATEGIES = new Set(Object.keys(TASK_EXECUTION_PHASES));

const LEGACY_COMMAND_FIELDS = Object.freeze({
  tdd: ['redCommand', 'greenCommand', 'refactorCommand'],
  regression: ['reproduceCommand', 'verifyCommand'],
  characterization: ['baselineCommand', 'verifyCommand'],
  direct: ['verifyCommand'],
  migration: ['dryRunCommand', 'applyCommand', 'rollbackCommand'],
  generation: ['generateCommand', 'verifyCommand'],
});

function taskCommandsPath(root, changeId) {
  assertSafeId(changeId, 'changeId');
  return path.join(
    resolveChild(path.join(root, 'harness', 'changes'), changeId, 'changeId'),
    'task-commands.json',
  );
}

function validArgv(argv) {
  return Array.isArray(argv) && argv.length > 0
    && argv.every((argument) => typeof argument === 'string' && argument.length > 0);
}

export function frozenTaskExecutionCommands(task, strategy) {
  if (!TASK_EXECUTION_PHASES[strategy]) return [];
  if (Array.isArray(task?.commands)) {
    return task.commands.map((command) => ({
      phase: String(command?.phase || '').toUpperCase(),
      argv: command?.argv,
    }));
  }
  return LEGACY_COMMAND_FIELDS[strategy].map((field, index) => ({
    phase: TASK_EXECUTION_PHASES[strategy][index],
    argv: task?.[field],
  }));
}

/**
 * 读取冻结 task 的 strategy。receipt 验证仍只由
 * task-execution-receipt.mjs 负责，本模块只解析冻结执行计划。
 */
export function loadTaskExecutionStrategy(root, changeId, taskId, fallback = null) {
  assertSafeId(changeId, 'changeId');
  assertSafeId(taskId, 'taskId');
  const file = taskCommandsPath(root, changeId);
  if (!fs.existsSync(file)) {
    return { ok: false, strategy: null, problems: ['task command freeze is missing'] };
  }
  try {
    const frozen = JSON.parse(fs.readFileSync(file, 'utf-8'));
    const task = frozen?.tasks?.[taskId];
    if (!task) {
      return { ok: false, strategy: null, problems: [`task is not frozen: ${taskId}`] };
    }
  const strategy = task.executionStrategy ?? fallback ?? 'tdd';
    if (!TASK_EXECUTION_STRATEGIES.has(strategy)) {
      return { ok: false, strategy: null, problems: [`executionStrategy is invalid: ${strategy}`] };
    }
    const schemaVersion = frozen.schemaVersion;
    const scopeProblems = schemaVersion >= 4 ? validateTaskWriteScope(task.writeScope) : [];
    return { ok: scopeProblems.length === 0, strategy, task, schemaVersion, problems: scopeProblems };
  } catch (error) {
    return {
      ok: false,
      strategy: null,
      problems: [`task command freeze is unreadable: ${error.message}`],
    };
  }
}

export function loadTaskExecutionPlan(root, changeId, taskId, fallback = null) {
  const resolved = loadTaskExecutionStrategy(root, changeId, taskId, fallback);
  if (!resolved.ok) return { ...resolved, commands: [] };
  const requiredPhases = TASK_EXECUTION_PHASES[resolved.strategy];
  const commands = frozenTaskExecutionCommands(resolved.task, resolved.strategy);
  const problems = [];
  if (commands.length !== requiredPhases.length) {
    problems.push(`${resolved.strategy} requires exactly ${requiredPhases.length} frozen commands`);
  }
  for (const [index, requiredPhase] of requiredPhases.entries()) {
    const command = commands[index];
    if (command?.phase !== requiredPhase) {
      problems.push(`frozen command ${index + 1} must use phase ${requiredPhase}`);
    }
    if (!validArgv(command?.argv)) {
      problems.push(`frozen command ${index + 1} argv must be a non-empty string array`);
    }
  }
  if (resolved.strategy === 'direct' && !String(resolved.task.strategyRationale || '').trim()) {
    problems.push('direct execution requires a frozen strategyRationale');
  }
  return {
    ...resolved,
    ok: problems.length === 0,
    commands,
    requiredPhases,
    problems,
  };
}

export function resolveTaskExecutionCommand(
  root,
  changeId,
  taskId,
  rawPhase,
  executionIndex,
  fallback = null,
) {
  const plan = loadTaskExecutionPlan(root, changeId, taskId, fallback);
  if (!plan.ok) return { ...plan, command: null, phase: null, isFinal: false };
  if (!Number.isInteger(executionIndex) || executionIndex < 0) {
    return {
      ...plan,
      ok: false,
      command: null,
      phase: null,
      isFinal: false,
      problems: ['executionIndex must be a non-negative integer'],
    };
  }
  const phase = String(rawPhase || '').toUpperCase();
  const command = plan.commands[executionIndex] || null;
  const problems = [];
  if (!command) problems.push(`no frozen command at execution index ${executionIndex + 1}`);
  else if (command.phase !== phase) problems.push(`phase order violation: expected ${command.phase}`);
  return {
    ...plan,
    ok: problems.length === 0,
    command,
    phase,
    isFinal: executionIndex === plan.commands.length - 1,
    problems,
  };
}
