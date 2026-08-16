import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { loadHandoffV2 } from '../../../runtime/core/handoff-v2.mjs';
import { sha256Artifact, validateStageResult } from '../../../runtime/lib/result-contract.mjs';

const STRATEGIES = new Set(['tdd', 'regression', 'characterization', 'direct', 'migration', 'generation']);

function assertTasksArtifact(content) {
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
  return problems;
}

const [changeId, runId] = process.argv.slice(2);
if (!changeId || !runId) {
  console.error('Usage: node finalize-result.mjs <change-id> <run-id>');
  process.exit(2);
}

try {
  const root = process.cwd();
  const input = loadHandoffV2(root, changeId, runId);
  if (input.role !== 'execute' || input.stage !== 'plan'
    || input.agent?.type !== 'enterprise-harness:artifact-worker' || input.agent?.skill !== 'plan') {
    throw new Error('EH-PLAN-FINALIZE-001: handoff must be a plan artifact-worker execute run');
  }
  const artifactPath = `harness/changes/${changeId}/tasks.md`;
  const absolutePath = path.join(root, artifactPath);
  if (!fs.existsSync(absolutePath)) throw new Error(`EH-PLAN-FINALIZE-002: missing ${artifactPath}`);
  const problems = assertTasksArtifact(fs.readFileSync(absolutePath, 'utf-8'));
  if (problems.length > 0) throw new Error(`EH-PLAN-FINALIZE-003: ${problems.join('; ')}`);
  const assertions = [
    { id: 'tasks-shape', verdict: 'pass', evidence: [artifactPath] },
    { id: 'strategy-and-command-contract', verdict: 'pass', evidence: [artifactPath] },
  ];
  const result = {
    resultVersion: 1,
    type: 'stage-result',
    changeId,
    stage: 'plan',
    runId,
    producer: { agentType: input.agent.type, skill: input.agent.skill },
    inputDigests: { ...input.inputDigests },
    artifacts: [{ path: artifactPath, digest: sha256Artifact(root, artifactPath) }],
    assertions,
    selfCheck: { verdict: 'pass', findings: [], evidence: assertions.flatMap((assertion) => assertion.evidence) },
    tecpc: { ...input.tecpc },
    status: 'pass',
    needsDecision: null,
    completedAt: new Date().toISOString(),
  };
  const validationProblems = validateStageResult(root, result);
  if (validationProblems.length > 0) throw new Error(`EH-PLAN-FINALIZE-004: ${validationProblems.join('; ')}`);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  console.error(error.message);
  process.exit(2);
}
