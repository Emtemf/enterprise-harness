const STRATEGIES = new Set(['tdd', 'regression', 'characterization', 'direct', 'migration', 'generation']);

/**
 * Verify tasks.md shape: headings, IDs, required sections, strategy, argv, acceptance, recovery.
 * @param {string} content - tasks.md raw content
 * @returns {{ id: string, verdict: 'pass'|'block', evidence: string[], findings: string[] }}
 */
export function assertTaskShape(content) {
  const problems = [];
  if (!content.startsWith('# Tasks\n')) problems.push('tasks.md must start with # Tasks');
  if (!/^Status:\s*finalized-plan\s*$/mu.test(content)) problems.push('tasks.md Status must be finalized-plan');
  if (/<[^>]+>/u.test(content)) problems.push('tasks.md contains an unresolved placeholder');
  const headings = [...content.matchAll(/^## Task ([^\n]+)$/gmu)];
  if (headings.length === 0) problems.push('tasks.md must define at least one ## Task <number>: <id>');
  const taskIds = new Set();
  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index];
    const parsed = heading[1].match(/^(\d+):\s*([A-Za-z0-9][A-Za-z0-9._-]*)$/u);
    if (!parsed) {
      problems.push(`task heading is malformed: ## Task ${heading[1]}`);
    } else {
      const number = Number(parsed[1]);
      const taskId = parsed[2];
      if (number !== index + 1) problems.push(`task heading number must be ${index + 1}: ${taskId}`);
      if (taskIds.has(taskId)) problems.push(`task id is duplicated: ${taskId}`);
      taskIds.add(taskId);
    }
    const taskStart = heading.index + heading[0].length;
    const taskEnd = headings[index + 1]?.index ?? content.length;
    const task = content.slice(taskStart, taskEnd);
    for (const requiredHeading of ['### Target and scope', '### Frozen inputs', '### Execution strategy', '### Commands and verification', '### Independent review']) {
      if (!task.includes(requiredHeading)) problems.push(`task is missing ${requiredHeading}`);
    }
    for (const field of [
      'Goal',
      'Modify',
      'Create',
      'Test',
      'Out of scope',
      'Consumes',
      'Input digests',
      'Design decisions/requirements',
      'Test cases',
      'Why this strategy fits',
      'Frozen primary argv',
      'Expected result',
      'Acceptance checks',
      'Recovery/rollback',
      'Applicable rubrics',
      'Reviewer input artifacts',
      'Review completion condition',
    ]) {
      const escaped = field.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
      if (!new RegExp(`^- ${escaped}:\\s*\\S[^\\n]*$`, 'mu').test(task)) {
        problems.push(`task is missing a non-empty ${field}`);
      }
    }
    if (!/- Strategy-specific precondition and receipt:\s*\n\s+-\s+`?[a-z]+`?:\s*\S/imu.test(task)) {
      problems.push('task is missing a strategy-specific precondition and receipt');
    }
    const strategy = task.match(/- Strategy:\s*`?([a-z-]+)`?/u)?.[1];
    if (!STRATEGIES.has(strategy)) problems.push(`task has invalid execution strategy ${strategy || 'missing'}`);
    const testCases = task.match(/- Test cases:\s*([^\n]+)/u)?.[1] || '';
    const tcIds = [...testCases.matchAll(/\bTC[1-9][0-9]*\b/gu)].map((match) => match[0]);
    if (tcIds.length === 0) problems.push('task must map to one or more TC* test cases');
    if (strategy === 'tdd' && !/- Minimal RED case:\s*TC[1-9][0-9]*/u.test(task)) {
      problems.push('tdd task must identify a minimal RED case');
    }
  }
  return {
    id: 'task-shape',
    verdict: problems.length === 0 ? 'pass' : 'block',
    evidence: problems.length === 0 ? [] : ['harness/changes/<changeId>/tasks.md'],
    findings: problems,
  };
}
