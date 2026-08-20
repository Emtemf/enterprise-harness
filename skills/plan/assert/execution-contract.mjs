const STRATEGIES = new Set(['tdd', 'regression', 'characterization', 'direct', 'migration', 'generation']);

function taskBlocks(content) {
  const headings = [...content.matchAll(/^## Task ([^\n]+)$/gmu)];
  return headings.map((heading, index) => ({
    label: heading[1],
    id: heading[1].match(/^\d+:\s*([A-Za-z0-9][A-Za-z0-9._-]*)$/u)?.[1] || null,
    content: content.slice(heading.index + heading[0].length, headings[index + 1]?.index ?? content.length),
  }));
}

function fieldValue(task, label) {
  return task.match(new RegExp(`^- ${label}:[\\t ]*(.*)$`, 'mu'))?.[1]?.trim() || '';
}

/**
 * Verify each task freezes a supported execution strategy, exact argv, acceptance, and recovery.
 * @param {string} content - tasks.md raw content
 * @param {string} artifactPath - evidence path reported in the assertion
 * @returns {{ id: string, verdict: 'pass'|'block', evidence: string[], findings: string[] }}
 */
export function assertExecutionContract(content, artifactPath = 'harness/changes/<changeId>/tasks.md') {
  const problems = [];
  const tasks = taskBlocks(content);
  const taskIds = new Set(tasks.map((task) => task.id).filter(Boolean));
  const priorTaskIds = new Set();
  for (const task of tasks) {
    const prefix = `Task ${task.label}`;
    const strategy = fieldValue(task.content, 'Strategy').replaceAll('`', '');
    if (!STRATEGIES.has(strategy)) {
      problems.push(`${prefix} has invalid execution strategy ${strategy || 'missing'}`);
    }
    const rawDependencies = fieldValue(task.content, 'Dependencies').replaceAll('`', '');
    if (!rawDependencies) {
      problems.push(`${prefix} must declare dependencies or none`);
    } else if (rawDependencies !== 'none') {
      const dependencies = rawDependencies.split(',').map((entry) => entry.trim()).filter(Boolean);
      for (const dependency of dependencies) {
        if (!taskIds.has(dependency)) problems.push(`${prefix} references unknown dependency ${dependency}`);
        else if (dependency === task.id) problems.push(`${prefix} cannot depend on itself`);
        else if (!priorTaskIds.has(dependency)) {
          problems.push(`${prefix} dependency ${dependency} must appear earlier in topological order`);
        }
      }
    }
    if (!fieldValue(task.content, 'Frozen primary argv')) {
      problems.push(`${prefix} is missing frozen primary argv`);
    }
    if (!fieldValue(task.content, 'Acceptance checks')) {
      problems.push(`${prefix} is missing acceptance checks`);
    }
    if (!fieldValue(task.content, 'Recovery/rollback')) {
      problems.push(`${prefix} is missing recovery/rollback`);
    }
    if (task.id) priorTaskIds.add(task.id);
  }
  return {
    id: 'strategy-and-command-contract',
    verdict: problems.length === 0 ? 'pass' : 'block',
    evidence: [artifactPath],
    findings: problems,
  };
}
