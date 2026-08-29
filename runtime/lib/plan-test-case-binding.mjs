// Canonical Plan ↔ Test Case association.  This is deliberately runtime-owned:
// a Skill's markdown assertion is useful guidance, but it cannot be the
// authority that decides whether a task can claim a test case.

const TASK_HEADING = /^## Task\s+(\d+):\s*([A-Za-z0-9][A-Za-z0-9._-]*)\s*$/gmu;
const TC_ID = /\bTC[1-9][0-9]*\b/gu;

export function acceptedTestCasesFromMarkdown(content) {
  const lines = String(content || '').split(/\r?\n/u);
  const header = lines.findIndex((line) => /^\|\s*TCID\s*\|/u.test(line));
  if (header < 0) return { ids: [], problems: ['test-cases.md has no TCID table'] };
  const ids = [];
  const problems = [];
  for (const line of lines.slice(header + 2)) {
    if (!line.startsWith('|')) break;
    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
    if (cells.length !== 10 || !/^TC[1-9][0-9]*$/u.test(cells[0])) continue;
    if (cells[9] === 'accepted') ids.push(cells[0]);
  }
  if (ids.length === 0) problems.push('test-cases.md has no accepted TC IDs');
  if (new Set(ids).size !== ids.length) problems.push('test-cases.md contains duplicate accepted TC IDs');
  return { ids, problems };
}

export function taskTestCaseBindingsFromMarkdown(content) {
  const text = String(content || '');
  const headings = [...text.matchAll(TASK_HEADING)];
  const tasks = [];
  const problems = [];
  for (const [index, heading] of headings.entries()) {
    const taskId = heading[2];
    const start = heading.index + heading[0].length;
    const end = headings[index + 1]?.index ?? text.length;
    const task = text.slice(start, end);
    const testCasesLine = task.match(/^- Test cases:\s*([^\n]+)/mu)?.[1] || '';
    const testCases = [...testCasesLine.matchAll(TC_ID)].map((match) => match[0]);
    const strategy = task.match(/^- Strategy:\s*`?([a-z-]+)`?/mu)?.[1] || null;
    const minimalRed = task.match(/^- Minimal RED case:\s*(TC[1-9][0-9]*)\b/mu)?.[1] || null;
    if (testCases.length === 0) problems.push(`task ${taskId} must map to one or more TC* test cases`);
    if (new Set(testCases).size !== testCases.length) problems.push(`task ${taskId} must not duplicate mapped TC IDs`);
    tasks.push({ taskId, strategy, testCases, minimalRed });
  }
  if (tasks.length === 0) problems.push('tasks.md defines no executable tasks');
  return { tasks, problems };
}

export function validatePlanTestCaseBindings(testCasesContent, tasksContent) {
  const accepted = acceptedTestCasesFromMarkdown(testCasesContent);
  const bindings = taskTestCaseBindingsFromMarkdown(tasksContent);
  const acceptedIds = new Set(accepted.ids);
  const problems = [...accepted.problems, ...bindings.problems];
  for (const task of bindings.tasks) {
    for (const tcId of task.testCases) {
      if (!acceptedIds.has(tcId)) problems.push(`task ${task.taskId} maps unknown accepted test case ${tcId}`);
    }
    if (task.strategy === 'tdd') {
      if (!task.minimalRed) {
        problems.push(`tdd task ${task.taskId} must identify a minimal RED case`);
      } else if (!task.testCases.includes(task.minimalRed)) {
        problems.push(`tdd task ${task.taskId} Minimal RED case ${task.minimalRed} must belong to that task mapping`);
      } else if (!acceptedIds.has(task.minimalRed)) {
        problems.push(`tdd task ${task.taskId} Minimal RED case ${task.minimalRed} is not accepted`);
      }
    }
  }
  return {
    accepted: accepted.ids,
    tasks: bindings.tasks,
    problems: [...new Set(problems)],
  };
}
