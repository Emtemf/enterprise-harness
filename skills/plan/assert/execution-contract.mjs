const STRATEGIES = new Set(['tdd', 'regression', 'characterization', 'direct', 'migration', 'generation']);

function taskBlocks(content) {
  const headings = [...content.matchAll(/^## Task ([^\n]+)$/gmu)];
  return headings.map((heading, index) => ({
    label: heading[1],
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
  for (const task of taskBlocks(content)) {
    const prefix = `Task ${task.label}`;
    const strategy = fieldValue(task.content, 'Strategy').replaceAll('`', '');
    if (!STRATEGIES.has(strategy)) {
      problems.push(`${prefix} has invalid execution strategy ${strategy || 'missing'}`);
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
  }
  return {
    id: 'strategy-and-command-contract',
    verdict: problems.length === 0 ? 'pass' : 'block',
    evidence: [artifactPath],
    findings: problems,
  };
}
