import {
  validateCompletionProof,
  validateReviewResult,
  validateStageResult,
} from '../lib/result-contract.mjs';
import { stageContractArtifactPaths } from '../lib/stage-contract.mjs';

function sameArtifacts(left, right) {
  const normalize = (artifacts) => (artifacts || [])
    .map(({ path, digest }) => [path, digest])
    .sort(([leftPath], [rightPath]) => leftPath.localeCompare(rightPath));
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}

export function buildCompletionProof(root, {
  stageResult,
  reviewResult,
  producerAgentIds = null,
  reviewerAgentIds = null,
  createdAt = new Date().toISOString(),
}) {
  const problems = [
    ...validateStageResult(root, stageResult),
    ...validateReviewResult(root, reviewResult, { stageResult }),
  ];
  if (stageResult?.status !== 'pass') problems.push('stage result must pass');
  if (stageResult?.selfCheck?.verdict !== 'pass') problems.push('stage self-check must pass');
  if (reviewResult?.verdict !== 'pass') problems.push('independent review must pass');
  if (!sameArtifacts(stageResult?.artifacts, reviewResult?.reviewedArtifacts)) {
    problems.push('reviewed artifacts must match the stage result');
  }
  if (stageResult?.stage === 'clarify') {
    if (!Array.isArray(producerAgentIds) || producerAgentIds.length === 0
        || !Array.isArray(reviewerAgentIds) || reviewerAgentIds.length === 0) {
      problems.push('Clarify proof requires trusted producer and reviewer agent IDs');
    } else {
      const producerBindings = new Set(producerAgentIds);
      const reused = reviewerAgentIds.find((agentId) => producerBindings.has(agentId));
      if (reused) problems.push(`reviewer agent ID ${reused} is present in the producer binding set`);
    }
  }
  if (problems.length > 0) throw new Error(`EH-COMPLETION-PROOF-001: ${problems.join('; ')}`);

  const clarifyFields = stageResult.stage === 'clarify' ? {
    reviewedArtifacts: reviewResult.reviewedArtifacts.map((artifact) => ({ ...artifact })),
    decisionSnapshotRef: { ...stageResult.artifacts.find(({ path }) => (
      path === stageContractArtifactPaths(stageResult.changeId, 'clarify')[4]
    )) },
    assertions: stageResult.assertions.map((assertion) => ({
      ...assertion,
      evidence: [...assertion.evidence],
    })),
    tecpc: {
      ...stageResult.tecpc,
      evidence: [...stageResult.tecpc.evidence],
      context: [...stageResult.tecpc.context],
    },
  } : {};
  const proof = Object.freeze({
    proofVersion: 1,
    type: 'completion-proof',
    changeId: stageResult.changeId,
    stage: stageResult.stage,
    executionRunId: stageResult.runId,
    reviewRunId: reviewResult.runId,
    waivers: (stageResult.waivers || []).map((waiver) => ({
      ...waiver,
      artifact: { ...waiver.artifact },
    })),
    artifacts: stageResult.artifacts.map((artifact) => ({ ...artifact })),
    ...clarifyFields,
    target: stageResult.tecpc.target,
    evidence: [...stageResult.tecpc.evidence],
    context: [...stageResult.tecpc.context],
    path: stageResult.tecpc.path,
    createdAt,
  });
  const proofProblems = validateCompletionProof(root, proof);
  if (proofProblems.length > 0) {
    throw new Error(`EH-COMPLETION-PROOF-001: ${proofProblems.join('; ')}`);
  }
  return proof;
}
