import fs from 'node:fs';
import process from 'node:process';
import { loadHandoffV2, persistHandoffV2Result, v2ResultPath } from '../../../runtime/api/handoff.mjs';
import { sha256Artifact, validateReviewResult, validateStageResult } from '../../../runtime/api/result.mjs';

const [changeId, runId, verdict, correction = ''] = process.argv.slice(2);
if (!changeId || !runId || !verdict) {
  console.error('Usage: node skills/review/scripts/finalize-result.mjs <change-id> <run-id> <pass|block|unsupported> [correction]');
  process.exit(2);
}

try {
  const root = process.cwd();
  const input = loadHandoffV2(root, changeId, runId);
  if (input.role !== 'check' || input.agent?.type !== 'enterprise-harness:reviewer' || input.agent?.skill !== 'review') {
    throw new Error('EH-REVIEW-FINALIZE-001: handoff must be a reviewer check run');
  }
  for (const ref of input.inputRefs) {
    if (sha256Artifact(root, ref) !== input.inputDigests[ref]) {
      throw new Error(`EH-REVIEW-FINALIZE-005: handoff input digest is stale: ${ref}`);
    }
  }
  const parentPath = v2ResultPath(root, changeId, input.parentRunId, 'execute');
  if (!fs.existsSync(parentPath)) throw new Error('EH-REVIEW-FINALIZE-002: parent StageResult is missing');
  const stageResult = JSON.parse(fs.readFileSync(parentPath, 'utf-8'));
  const stageProblems = validateStageResult(root, stageResult);
  if (stageProblems.length > 0) throw new Error(`EH-REVIEW-FINALIZE-003: ${stageProblems.join('; ')}`);
  const review = {
    resultVersion: 1,
    type: 'review-result',
    changeId,
    stage: input.stage,
    runId,
    parentRunId: input.parentRunId,
    reviewer: { agentType: input.agent.type, skill: input.agent.skill },
    reviewedRunId: input.parentRunId,
    reviewedArtifacts: stageResult.artifacts.map((artifact) => ({ ...artifact })),
    rubricIds: [...input.rubricIds],
    tecpc: { ...input.tecpc },
    verdict,
    correction: verdict === 'pass' ? null : correction || null,
    reviewedAt: new Date().toISOString(),
  };
  const problems = validateReviewResult(root, review, { stageResult });
  if (problems.length > 0) throw new Error(`EH-REVIEW-FINALIZE-004: ${problems.join('; ')}`);
  persistHandoffV2Result(root, changeId, runId, review);
  process.stdout.write(JSON.stringify(review, null, 2) + '\n');
} catch (error) {
  console.error(error.message);
  process.exit(2);
}
