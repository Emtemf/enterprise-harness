const STRATEGIES = new Set(['tdd', 'regression', 'characterization', 'direct', 'migration', 'generation']);

/**
 * Verify tasks.md shape: headings, IDs, required sections, strategy, argv, acceptance, recovery.
 * @param {string} content - tasks.md raw content
 * @returns {{ id: string, verdict: 'pass'|'block', evidence: string[], findings: string[] }}
 */
export function assertTaskShape(content) {
  const problems = [];
  if (!content.startsWith('# Tasks\n')) problems.push('tasks.md must start with # Tasks');
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
    const strategy = task.match(/- Strategy:\s*`?([a-z-]+)`?/u)?.[1];
    if (!STRATEGIES.has(strategy)) problems.push(`task has invalid execution strategy ${strategy || 'missing'}`);
    if (!task.includes('- Frozen primary argv:')) problems.push('task is missing frozen primary argv');
    if (!task.includes('- Acceptance checks:')) problems.push('task is missing acceptance checks');
    if (!task.includes('- Recovery/rollback:')) problems.push('task is missing recovery/rollback');
  }
  return {
    id: 'task-shape',
    verdict: problems.length === 0 ? 'pass' : 'block',
    evidence: problems.length === 0 ? [] : ['harness/changes/<changeId>/tasks.md'],
    findings: problems,
  };
}
