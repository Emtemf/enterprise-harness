const PHASES = Object.freeze({
  tdd: ['RED', 'GREEN', 'REFACTOR'],
  regression: ['REPRODUCE', 'VERIFY'],
  characterization: ['BASELINE', 'VERIFY'],
  direct: ['VERIFY'],
  migration: ['DRY_RUN', 'APPLY', 'ROLLBACK'],
  generation: ['GENERATE', 'VERIFY'],
});

const TOP_LEVEL_FIELDS = new Set(['schemaVersion', 'tasks']);
const TASK_FIELDS = new Set([
  'executionStrategy',
  'strategyRationale',
  'testCases',
  'minimalRedCase',
  'writeScope',
  'commands',
]);
const WRITE_SCOPE_FIELDS = new Set(['allowed', 'forbidden']);
const COMMAND_FIELDS = new Set(['phase', 'argv']);

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function safeScopePath(value) {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0') || value.includes('\\')) return false;
  if (value.startsWith('/') || /^[A-Za-z]:/u.test(value)) return false;
  const normalized = value.endsWith('/**') ? value.slice(0, -3) : value;
  return normalized.length > 0 && !normalized.split('/').some((part) => part === '' || part === '.' || part === '..');
}

function taskBindings(tasksContent) {
  const headings = [...String(tasksContent || '').matchAll(/^## Task\s+(\d+):\s*([A-Za-z0-9][A-Za-z0-9._-]*)\s*$/gmu)];
  return headings.map((heading, index) => {
    const start = heading.index + heading[0].length;
    const end = headings[index + 1]?.index ?? tasksContent.length;
    const task = tasksContent.slice(start, end);
    const testCasesLine = task.match(/^- Test cases:\s*([^\n]+)/mu)?.[1] || '';
    return {
      taskId: heading[2],
      strategy: task.match(/^- Strategy:\s*`?([a-z-]+)`?/mu)?.[1] || null,
      testCases: [...testCasesLine.matchAll(/\bTC[1-9][0-9]*\b/gu)].map((match) => match[0]),
      minimalRedCase: task.match(/^- Minimal RED case:\s*(TC[1-9][0-9]*)\b/mu)?.[1] || null,
    };
  });
}

/**
 * Validate the machine-owned Plan command freeze and its exact association to tasks.md.
 * @param {unknown} value parsed task-commands.json
 * @param {string} tasksContent canonical tasks.md
 * @returns {{ id: string, verdict: 'pass'|'block', evidence: string[], findings: string[] }}
 */
export function assertTaskCommandShape(value, tasksContent) {
  const problems = [];
  if (!isObject(value)) {
    problems.push('task-commands.json must be an object');
  } else {
    for (const field of Object.keys(value)) {
      if (!TOP_LEVEL_FIELDS.has(field)) problems.push(`task-commands.json has unknown property ${field}`);
    }
    if (value.schemaVersion !== 4) problems.push('task-commands.json schemaVersion must be 4');
    if (!isObject(value.tasks)) problems.push('task-commands.json tasks must be an object');
  }

  const bindings = taskBindings(tasksContent);
  const commandsByTask = isObject(value?.tasks) ? value.tasks : {};
  const expectedIds = bindings.map(({ taskId }) => taskId);
  const actualIds = Object.keys(commandsByTask);
  for (const taskId of expectedIds) {
    if (!Object.hasOwn(commandsByTask, taskId)) problems.push(`task command freeze is missing task ${taskId}`);
  }
  for (const taskId of actualIds) {
    if (!expectedIds.includes(taskId)) problems.push(`task command freeze contains unknown task ${taskId}`);
  }

  for (const binding of bindings) {
    const task = commandsByTask[binding.taskId];
    if (!isObject(task)) continue;
    for (const field of Object.keys(task)) {
      if (!TASK_FIELDS.has(field)) problems.push(`task ${binding.taskId} has unknown property ${field}`);
    }
    if (task.executionStrategy !== binding.strategy || !PHASES[task.executionStrategy]) {
      problems.push(`task ${binding.taskId} executionStrategy ${task.executionStrategy || 'missing'} must match tasks.md ${binding.strategy || 'missing'}`);
    }
    if (typeof task.strategyRationale !== 'string' || !task.strategyRationale.trim()) {
      problems.push(`task ${binding.taskId} strategyRationale is required`);
    }
    if (JSON.stringify(task.testCases) !== JSON.stringify(binding.testCases)) {
      problems.push(`task ${binding.taskId} testCases ${JSON.stringify(task.testCases)} must exactly match tasks.md ${JSON.stringify(binding.testCases)}`);
    }
    const expectedRed = binding.strategy === 'tdd' ? binding.minimalRedCase : null;
    if ((task.minimalRedCase ?? null) !== expectedRed) {
      problems.push(`task ${binding.taskId} minimalRedCase ${task.minimalRedCase ?? 'null'} must exactly match tasks.md ${expectedRed ?? 'null'}`);
    }
    if (!isObject(task.writeScope)) {
      problems.push(`task ${binding.taskId} writeScope is required`);
    } else {
      for (const field of Object.keys(task.writeScope)) {
        if (!WRITE_SCOPE_FIELDS.has(field)) problems.push(`task ${binding.taskId} writeScope has unknown property ${field}`);
      }
      const allowed = task.writeScope.allowed;
      const forbidden = task.writeScope.forbidden;
      if (!Array.isArray(allowed) || allowed.length === 0 || allowed.some((item) => !safeScopePath(item))) {
        problems.push(`task ${binding.taskId} writeScope.allowed must contain safe repo-relative paths`);
      }
      if (!Array.isArray(forbidden) || forbidden.some((item) => !safeScopePath(item))) {
        problems.push(`task ${binding.taskId} writeScope.forbidden must contain only safe repo-relative paths`);
      }
      if (Array.isArray(allowed) && new Set(allowed).size !== allowed.length) {
        problems.push(`task ${binding.taskId} writeScope.allowed contains duplicates`);
      }
      if (Array.isArray(forbidden) && new Set(forbidden).size !== forbidden.length) {
        problems.push(`task ${binding.taskId} writeScope.forbidden contains duplicates`);
      }
      if (Array.isArray(allowed) && Array.isArray(forbidden)
          && allowed.some((item) => forbidden.includes(item))) {
        problems.push(`task ${binding.taskId} writeScope cannot allow and forbid the same path`);
      }
    }
    const requiredPhases = PHASES[task.executionStrategy] || [];
    if (!Array.isArray(task.commands) || task.commands.length !== requiredPhases.length) {
      problems.push(`task ${binding.taskId} commands must contain exactly ${requiredPhases.length} phases`);
      continue;
    }
    for (const [index, phase] of requiredPhases.entries()) {
      const command = task.commands[index];
      if (isObject(command)) {
        for (const field of Object.keys(command)) {
          if (!COMMAND_FIELDS.has(field)) problems.push(`task ${binding.taskId} command ${index + 1} has unknown property ${field}`);
        }
      }
      if (!isObject(command) || command.phase !== phase) {
        problems.push(`task ${binding.taskId} command ${index + 1} must use phase ${phase}`);
      }
      if (!Array.isArray(command?.argv) || command.argv.length === 0
          || command.argv.some((argument) => typeof argument !== 'string' || argument.length === 0)) {
        problems.push(`task ${binding.taskId} command ${index + 1} argv must be a non-empty string array`);
      }
    }
  }

  return {
    id: 'task-command-shape',
    verdict: problems.length === 0 ? 'pass' : 'block',
    evidence: problems.length === 0 ? [] : ['harness/changes/<changeId>/task-commands.json'],
    findings: [...new Set(problems)],
  };
}
