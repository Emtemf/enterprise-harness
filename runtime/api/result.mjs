// Runtime public API: stage/review result contract.
// Skills may only import from runtime/api/*; runtime/core and runtime/lib are internal.

export {
  sha256Artifact,
  validateCompletionProof,
  validateResearchPacket,
  validateReviewResult,
  validateStageResult,
} from '../lib/result-contract.mjs';
export { selectReviewRubrics } from '../lib/review-rubrics.mjs';
export {
  clarifyStageResultProjection,
  requiredStageResultArtifacts,
  validateCanonicalDesignProof,
} from '../lib/stage-results.mjs';
export {
  acceptedTestCasesFromMarkdown,
  taskTestCaseBindingsFromMarkdown,
  validatePlanTestCaseBindings,
} from '../lib/plan-test-case-binding.mjs';
