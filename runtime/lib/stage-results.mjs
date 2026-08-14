import fs from 'node:fs';
import path from 'node:path';
import { gitCommonDir, normalizeAgentType } from './agent-evidence.mjs';
import { loadHandoffV2, v2ResultPath } from '../core/handoff-v2.mjs';
import {
  sha256Artifact,
  validateHandoffV2Contract,
  validateReviewResult,
  validateStageResult,
} from './result-contract.mjs';

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

export function validateDesignStageGate(root, changeId) {
  const problems = [];
  const runs = runIds(root, changeId);
  const stages = [];

  for (const runId of runs) {
    const execution = loadRun(root, changeId, runId, 'execute', problems);
    if (!execution?.input || execution.input.stage !== 'design') continue;
    if (!execution.result) {
      problems.push(`${runId}: stage result is missing`);
      continue;
    }
    const stageProblems = validateStageResult(root, execution.result);
    if (stageProblems.length > 0) {
      problems.push(...stageProblems.map((problem) => `${runId}: ${problem}`));
      continue;
    }
    if (!matchingProducer(execution.result, execution.input)) {
      problems.push(`${runId}: stage result producer does not match handoff agent`);
      continue;
    }
    if (execution.result.runId !== execution.input.runId || execution.result.changeId !== changeId || execution.result.stage !== 'design') {
      problems.push(`${runId}: stage result does not bind the design handoff`);
      continue;
    }
    if (!sameDigestMap(execution.result.inputDigests, execution.input.inputDigests)) {
      problems.push(`${runId}: StageResult input digests do not match the execute handoff`);
      continue;
    }
    const designPath = `harness/changes/${changeId}/design.md`;
    if (!execution.result.artifacts.some((artifact) => artifact.path === designPath)) {
      problems.push(`${runId}: StageResult does not bind design.md`);
      continue;
    }
    stages.push(execution);
  }

  if (stages.length === 0) {
    problems.push('design has no fresh, valid StageResult');
    return problems;
  }

  const passes = stages.filter((stage) => stage.result.status === 'pass');
  if (passes.length === 0) {
    problems.push('design has no passing StageResult');
    return problems;
  }

  for (const stage of passes) {
    const reviews = [];
    for (const runId of runs) {
      const check = loadRun(root, changeId, runId, 'check', problems);
      if (!check?.input || check.input.stage !== 'design' || check.input.parentRunId !== stage.input.runId) continue;
      if (!check.result) {
        problems.push(`${runId}: ReviewResult is missing`);
        continue;
      }
      const reviewProblems = validateReviewResult(root, check.result, { stageResult: stage.result });
      if (reviewProblems.length > 0) {
        problems.push(...reviewProblems.map((problem) => `${runId}: ${problem}`));
        continue;
      }
      if (JSON.stringify(check.result.rubricIds) !== JSON.stringify(check.input.rubricIds)) {
        problems.push(`${runId}: ReviewResult rubrics do not match the check handoff`);
        continue;
      }
      if (!sameArtifacts(check.result.reviewedArtifacts, stage.result.artifacts)) {
        problems.push(`${runId}: ReviewResult artifacts do not match the StageResult`);
        continue;
      }
      if (!matchingReviewer(check.result, check.input)) {
        problems.push(`${runId}: ReviewResult reviewer does not match handoff agent`);
        continue;
      }
      reviews.push(check);
    }
    if (reviews.some((review) => review.result.verdict === 'pass')) return [];
  }

  problems.push('design has no fresh, independent passing ReviewResult');
  return problems;
}
