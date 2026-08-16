import fs from 'node:fs';
import path from 'node:path';
import {
  gitCommonDir,
  normalizeAgentType,
  trustedHandoffAgentBindings,
} from './agent-evidence.mjs';
import { validateTaskExecutionReceipt } from './task-execution-receipt.mjs';
import { loadHandoffV2, v2ResultPath } from '../core/handoff-v2.mjs';
import { buildCompletionProof } from '../core/completion-proof.mjs';
import {
  sha256Artifact,
  validateCompletionProof,
  validateHandoffV2Contract,
  validateReviewResult,
  validateStageResult,
} from './result-contract.mjs';

const REQUIRED_STAGE_RESULT_ARTIFACTS = Object.freeze({
  clarify: (changeId) => [
    `harness/changes/${changeId}/requirements.md`,
    `harness/changes/${changeId}/classification.json`,
  ],
  design: (changeId) => [`harness/changes/${changeId}/design.md`],
  plan: (changeId) => [`harness/changes/${changeId}/tasks.md`],
  implement: () => [],
  verify: (changeId) => [`harness/changes/${changeId}/validation.md`],
  archive: (changeId) => [
    `harness/changes/${changeId}/validation.md`,
    `harness/changes/${changeId}/evidence/completion/verify.json`,
  ],
});

export function requiredStageResultArtifacts(changeId, stage) {
  return [...(REQUIRED_STAGE_RESULT_ARTIFACTS[stage]?.(changeId) ?? [])];
}

function readJson(file, label, problems) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch (error) {
    problems.push(`${label} is invalid JSON: ${error.message}`);
    return null;
  }
}

function runIds(root, changeId) {
  const dir = path.join(gitCommonDir(root), 'enterprise-harness', 'runs', changeId);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function freshInputDigests(root, input) {
  const problems = [];
  for (const ref of input.inputRefs || []) {
    try {
      if (sha256Artifact(root, ref) !== input.inputDigests?.[ref]) {
        problems.push(`handoff input digest is stale: ${ref}`);
      }
    } catch (error) {
      problems.push(`handoff input is unreadable: ${ref} (${error.message})`);
    }
  }
  return problems;
}

function loadRun(root, changeId, runId, role, problems) {
  let input;
  try {
    input = loadHandoffV2(root, changeId, runId);
  } catch (error) {
    problems.push(error.message);
    return null;
  }
  const contractProblems = [
    ...validateHandoffV2Contract(input),
    ...freshInputDigests(root, input),
  ];
  if (contractProblems.length > 0) {
    problems.push(...contractProblems.map((problem) => `${runId}: ${problem}`));
    return null;
  }
  if (input.role !== role) return null;
  const resultPath = v2ResultPath(root, changeId, runId, role);
  if (!fs.existsSync(resultPath)) return { input, result: null, resultPath };
  return { input, result: readJson(resultPath, resultPath, problems), resultPath };
}

function matchingProducer(result, input) {
  return normalizeAgentType(result?.producer?.agentType) === normalizeAgentType(input?.agent?.type)
    && result?.producer?.skill === input?.agent?.skill;
}

function matchingReviewer(result, input) {
  return normalizeAgentType(result?.reviewer?.agentType) === normalizeAgentType(input?.agent?.type)
    && result?.reviewer?.skill === input?.agent?.skill;
}

function sameDigestMap(left, right) {
  const leftEntries = Object.entries(left || {}).sort(([a], [b]) => a.localeCompare(b));
  const rightEntries = Object.entries(right || {}).sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(leftEntries) === JSON.stringify(rightEntries);
}

function sameArtifacts(left, right) {
  const normalize = (artifacts) => (artifacts || [])
    .map(({ path: artifactPath, digest }) => [artifactPath, digest])
    .sort(([leftPath], [rightPath]) => leftPath.localeCompare(rightPath));
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}

function taskIdsFromPlan(root, changeId, problems) {
  const planRef = `harness/changes/${changeId}/tasks.md`;
  const planPath = path.join(root, planRef);
  if (!fs.existsSync(planPath)) {
    problems.push(`implement plan is missing: ${planRef}`);
    return { planRef, taskIds: [] };
  }
  const content = fs.readFileSync(planPath, 'utf-8');
  const taskIds = [...content.matchAll(/^## Task\s+\d+:\s*([A-Za-z0-9][A-Za-z0-9._-]*)/gmu)]
    .map((match) => match[1]);
  if (taskIds.length === 0) problems.push('implement plan defines no executable tasks');
  if (new Set(taskIds).size !== taskIds.length) problems.push('implement plan contains duplicate task ids');
  return { planRef, taskIds };
}

function implementCompletionProof(root, changeId, executions, problems) {
  const { planRef, taskIds } = taskIdsFromPlan(root, changeId, problems);
  if (taskIds.length === 0) return null;
  const taskProofs = [];
  const allArtifacts = [];
  const allWaivers = [];
  const evidence = [];

  for (const taskId of taskIds) {
    const candidates = executions.filter((execution) => execution.result.artifacts.some((artifact) => (
      artifact.path === `harness/changes/${changeId}/evidence/tasks/${taskId}.json`
    )));
    let completed = null;
    for (const execution of candidates) {
      const receiptArtifact = execution.result.artifacts.find((artifact) => artifact.path.endsWith(`/${taskId}.json`));
      if (!receiptArtifact) continue;
      let receipt;
      try {
        receipt = JSON.parse(fs.readFileSync(path.join(root, receiptArtifact.path), 'utf-8'));
      } catch (error) {
        problems.push(`${execution.input.runId}: task ${taskId} receipt is unreadable (${error.message})`);
        continue;
      }
      const receiptProblems = validateTaskExecutionReceipt(receipt, {
        root,
        requireTrusted: true,
        expectedInputDigests: execution.input.inputDigests,
      });
      if (receipt.changeId !== changeId || receipt.taskId !== taskId) receiptProblems.push(`receipt does not bind task ${taskId}`);
      if (receiptArtifact.digest !== sha256Artifact(root, receiptArtifact.path)) receiptProblems.push(`task ${taskId} receipt digest is stale`);
      for (const [ref, digest] of Object.entries(receipt.inputDigests || {})) {
        try {
          if (sha256Artifact(root, ref) !== digest) receiptProblems.push(`task ${taskId} input digest is stale: ${ref}`);
        } catch (error) {
          receiptProblems.push(`task ${taskId} input is unreadable: ${ref} (${error.message})`);
        }
      }
      if (receiptProblems.length > 0) {
        problems.push(...receiptProblems.map((problem) => `${execution.input.runId}: ${problem}`));
        continue;
      }
      for (const runId of runIds(root, changeId)) {
        const check = loadRun(root, changeId, runId, 'check', problems);
        if (!check?.input || check.input.stage !== 'implement' || check.input.parentRunId !== execution.input.runId) continue;
        if (!check.result) continue;
        const reviewProblems = validateReviewResult(root, check.result, { stageResult: execution.result });
        if (reviewProblems.length > 0) continue;
        if (!sameArtifacts(check.result.reviewedArtifacts, execution.result.artifacts)
          || !matchingReviewer(check.result, check.input)
          || check.result.verdict !== 'pass') continue;
        const reviewerBindings = trustedHandoffAgentBindings(root, changeId, check.input);
        const producerAgentIds = new Set(execution.agentBindings.map((binding) => binding.agentId));
        if (reviewerBindings.length === 0
          || !reviewerBindings.some((binding) => !producerAgentIds.has(binding.agentId))) continue;
        completed = {
          taskId,
          executionRunId: execution.input.runId,
          reviewRunId: check.input.runId,
          artifacts: execution.result.artifacts.map((artifact) => ({ ...artifact })),
        };
        allWaivers.push(...(execution.result.waivers || []));
        break;
      }
      if (completed) break;
    }
    if (!completed) {
      problems.push(`implement task ${taskId} has no fresh, independently reviewed passing result`);
    } else {
      taskProofs.push(completed);
      allArtifacts.push(...completed.artifacts);
      evidence.push(...completed.artifacts.map((artifact) => artifact.path));
    }
  }
  if (taskProofs.length !== taskIds.length) return null;
  const uniqueArtifacts = [...new Map(allArtifacts.map((artifact) => [artifact.path, artifact])).values()];
  const proof = {
    proofVersion: 1,
    type: 'completion-proof',
    changeId,
    stage: 'implement',
    taskProofs,
    waivers: allWaivers.map((waiver) => ({ ...waiver, artifact: { ...waiver.artifact } })),
    artifacts: uniqueArtifacts,
    target: 'all plan tasks independently implemented and reviewed',
    evidence: [...new Set(evidence)],
    context: [planRef],
    path: `${planRef} -> ${taskProofs.map((task) => task.taskId).join(' -> ')}`,
    createdAt: new Date().toISOString(),
  };
  const proofProblems = validateCompletionProof(root, proof);
  if (proofProblems.length > 0) {
    problems.push(...proofProblems.map((problem) => `implement completion proof: ${problem}`));
    return null;
  }
  return Object.freeze(proof);
}

export function resolveStageCompletionProof(root, changeId, stage, {
  requiredArtifactPath = null,
  requiredArtifactPaths = [],
} = {}) {
  const requiredArtifacts = [...new Set([
    ...(requiredArtifactPath ? [requiredArtifactPath] : []),
    ...requiredArtifactPaths,
  ])];
  const problems = [];
  const executions = [];
  const runs = runIds(root, changeId);

  for (const runId of runs) {
    const execution = loadRun(root, changeId, runId, 'execute', problems);
    if (!execution?.input || execution.input.stage !== stage) continue;
    if (!execution.result) {
      problems.push(`${runId}: StageResult is missing`);
      continue;
    }
    const resultProblems = validateStageResult(root, execution.result);
    if (resultProblems.length > 0) {
      problems.push(...resultProblems.map((problem) => `${runId}: ${problem}`));
      continue;
    }
    if (!matchingProducer(execution.result, execution.input)) {
      problems.push(`${runId}: StageResult producer does not match handoff agent`);
      continue;
    }
    if (execution.result.runId !== execution.input.runId
      || execution.result.changeId !== changeId
      || execution.result.stage !== stage) {
      problems.push(`${runId}: StageResult does not bind the ${stage} handoff`);
      continue;
    }
    if (!sameDigestMap(execution.result.inputDigests, execution.input.inputDigests)) {
      problems.push(`${runId}: StageResult input digests do not match the execute handoff`);
      continue;
    }
    const missingArtifacts = requiredArtifacts.filter((artifactPath) => (
      !execution.result.artifacts.some((artifact) => artifact.path === artifactPath)
    ));
    if (missingArtifacts.length > 0) {
      problems.push(`${runId}: StageResult does not bind ${missingArtifacts.join(', ')}`);
      continue;
    }
    if (execution.result.status !== 'pass') {
      problems.push(`${runId}: StageResult did not pass`);
      continue;
    }
    const isMainOwnedClarify = stage === 'clarify'
      && normalizeAgentType(execution.input.agent?.type) === 'enterprise-harness:main';
    const agentBindings = isMainOwnedClarify
      ? [{ agentId: 'enterprise-harness:main', sessionId: null }]
      : trustedHandoffAgentBindings(root, changeId, execution.input);
    if (agentBindings.length === 0) {
      problems.push(`${runId}: execute handoff has no trusted completed agent binding`);
      continue;
    }
    executions.push({ ...execution, agentBindings });
  }

  if (stage === 'implement') {
    const proof = implementCompletionProof(root, changeId, executions, problems);
    if (proof) return { proof, problems: [] };
    if (executions.length === 0) problems.push('implement has no fresh, valid passing StageResult');
    return { proof: null, problems };
  }

  if (executions.length === 0) {
    problems.push(`${stage} has no fresh, valid passing StageResult`);
    return { proof: null, problems };
  }

  for (const execution of executions) {
    for (const runId of runs) {
      const check = loadRun(root, changeId, runId, 'check', problems);
      if (!check?.input || check.input.stage !== stage || check.input.parentRunId !== execution.input.runId) continue;
      if (!check.result) {
        problems.push(`${runId}: ReviewResult is missing`);
        continue;
      }
      const reviewProblems = validateReviewResult(root, check.result, { stageResult: execution.result });
      if (reviewProblems.length > 0) {
        problems.push(...reviewProblems.map((problem) => `${runId}: ${problem}`));
        continue;
      }
      if (JSON.stringify(check.result.rubricIds) !== JSON.stringify(check.input.rubricIds)) {
        problems.push(`${runId}: ReviewResult rubrics do not match the check handoff`);
        continue;
      }
      if (!sameArtifacts(check.result.reviewedArtifacts, execution.result.artifacts)) {
        problems.push(`${runId}: ReviewResult artifacts do not match the StageResult`);
        continue;
      }
      if (!matchingReviewer(check.result, check.input)) {
        problems.push(`${runId}: ReviewResult reviewer does not match handoff agent`);
        continue;
      }
      const reviewerBindings = trustedHandoffAgentBindings(root, changeId, check.input);
      if (reviewerBindings.length === 0) {
        problems.push(`${runId}: check handoff has no trusted completed reviewer agent binding`);
        continue;
      }
      const producerAgentIds = new Set(execution.agentBindings.map((binding) => binding.agentId));
      if (!reviewerBindings.some((binding) => !producerAgentIds.has(binding.agentId))) {
        problems.push(`${runId}: execute and check handoffs must use distinct agent identities`);
        continue;
      }
      if (check.result.verdict !== 'pass') {
        problems.push(`${runId}: ReviewResult did not pass`);
        continue;
      }
      try {
        return { proof: buildCompletionProof(root, { stageResult: execution.result, reviewResult: check.result }), problems: [] };
      } catch (error) {
        problems.push(`${runId}: ${error.message}`);
      }
    }
  }

  problems.push(`${stage} has no fresh, independent passing ReviewResult`);
  return { proof: null, problems };
}

export function validateStageGate(root, changeId, stage, options) {
  return resolveStageCompletionProof(root, changeId, stage, options).problems;
}

export function validateDesignStageGate(root, changeId) {
  return validateStageGate(root, changeId, 'design', {
    requiredArtifactPath: `harness/changes/${changeId}/design.md`,
  });
}
