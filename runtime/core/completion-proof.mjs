import {
  validateCompletionProof,
  validateReviewResult,
  validateStageResult,
} from '../lib/result-contract.mjs';

function sameArtifacts(left, right) {
  const normalize = (artifacts) => (artifacts || [])
    .map(({ path, digest }) => [path, digest])
    .sort(([leftPath], [rightPath]) => leftPath.localeCompare(rightPath));
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}

export function buildCompletionProof(root, { stageResult, reviewResult, createdAt = new Date().toISOString() }) {
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
  if (problems.length > 0) throw new Error(`EH-COMPLETION-PROOF-001: ${problems.join('; ')}`);

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
