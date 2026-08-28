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
  buildCompoundDesignProof,
  buildDesignArchitectureProof,
  readDesignArchitectureProof,
  sameDesignArchitectureProofBinding,
} from '../core/design-proof.mjs';
import { stageContractArtifactPaths } from './stage-contract.mjs';
import { buildClarifyArtifactReadiness } from './clarify-readiness.mjs';
import {
  sha256Artifact,
  validateCompletionProof,
  validateHandoffV2Contract,
  validateReviewResult,
  validateStageResult,
  validateTecpc,
} from './result-contract.mjs';

const REQUIRED_STAGE_RESULT_ARTIFACTS = Object.freeze({
  clarify: (changeId) => stageContractArtifactPaths(changeId, 'clarify'),
  design: (changeId) => [
    `harness/changes/${changeId}/design.md`,
    `harness/changes/${changeId}/test-cases.md`,
  ],
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

function freshestRunForStage(root, changeId, stage, role, { parentRunId = null } = {}) {
  let freshest = null;
  for (const runId of runIds(root, changeId)) {
    let input;
    try {
      input = loadHandoffV2(root, changeId, runId);
    } catch {
      continue;
    }
    if (input.stage !== stage || input.role !== role) continue;
    if ((input.parentRunId ?? null) !== parentRunId) continue;
    const createdAt = Date.parse(input.createdAt);
    if (!Number.isFinite(createdAt)) continue;
    if (!freshest || createdAt > freshest.createdAt || (createdAt === freshest.createdAt && runId > freshest.runId)) {
      freshest = { runId, input, createdAt };
    }
  }
  return freshest;
}

function freshestStageExecution(root, changeId, stage) {
  let freshest = null;
  for (const runId of runIds(root, changeId)) {
    let input;
    try {
      input = loadHandoffV2(root, changeId, runId);
    } catch {
      continue;
    }
    const agentType = normalizeAgentType(input.agent?.type);
    if (input.stage !== stage || input.role !== 'execute'
      || ['enterprise-harness:code-explore', 'enterprise-harness:doc-research'].includes(agentType)) continue;
    const createdAt = Date.parse(input.createdAt);
    if (!Number.isFinite(createdAt)) continue;
    if (!freshest || createdAt > freshest.createdAt || (createdAt === freshest.createdAt && runId > freshest.runId)) {
      freshest = { runId, input, createdAt };
    }
  }
  return freshest;
}

function freshestExecutionForBehavior(root, changeId, stage, behavior) {
  let freshest = null;
  for (const runId of runIds(root, changeId)) {
    let input;
    try {
      input = loadHandoffV2(root, changeId, runId);
    } catch {
      continue;
    }
    if (input.stage !== stage || input.role !== 'execute' || input.behavior !== behavior) continue;
    const createdAt = Date.parse(input.createdAt);
    if (!Number.isFinite(createdAt)) continue;
    if (!freshest || createdAt > freshest.createdAt || (createdAt === freshest.createdAt && runId > freshest.runId)) {
      freshest = { runId, input, createdAt };
    }
  }
  return freshest;
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
  const contractProblems = validateHandoffV2Contract(input);
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

function sameTecpc(left, right) {
  return left?.target === right?.target
    && JSON.stringify(left?.evidence || []) === JSON.stringify(right?.evidence || [])
    && JSON.stringify(left?.context || []) === JSON.stringify(right?.context || [])
    && left?.path === right?.path
    && left?.correction === right?.correction;
}

function sameArtifacts(left, right) {
  const normalize = (artifacts) => (artifacts || [])
    .map(({ path: artifactPath, digest }) => [artifactPath, digest])
    .sort(([leftPath], [rightPath]) => leftPath.localeCompare(rightPath));
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}

function layerStatus(problems) {
  return problems.some((problem) => /stale|digest|unreadable/u.test(problem)) ? 'stale' : 'blocked';
}

function layer(status = 'blocked', refs = [], problems = []) {
  return Object.freeze({ status, refs: Object.freeze([...refs]), problems: Object.freeze([...problems]) });
}

function readinessItems(readiness) {
  return new Map(readiness.items.map((item) => [item.id, item]));
}

function readinessItemsPass(items, ids) {
  return ids.every((id) => items.get(id)?.status === 'pass');
}

function readinessEvidence(items, ids) {
  return [...new Set(ids.flatMap((id) => items.get(id)?.evidenceRefs || []))];
}

function clarifyAssertion(id, passed, evidence) {
  return Object.freeze({ id, verdict: passed ? 'pass' : 'block', evidence: Object.freeze([...new Set(evidence)]) });
}

export function clarifyStageResultProjection(root, changeId) {
  const readiness = buildClarifyArtifactReadiness(root, changeId);
  const items = readinessItems(readiness);
  const requirementsRef = `harness/changes/${changeId}/requirements.md`;
  const classificationRef = `harness/changes/${changeId}/classification.json`;
  const debtRef = `harness/changes/${changeId}/debt-assessment.json`;
  const contractRef = `harness/changes/${changeId}/project-contract-assessment.json`;
  const decisionSnapshotRef = `harness/changes/${changeId}/evidence/decisions/clarify-decision-snapshot.json`;
  const researchIds = ['research-lanes-decided', 'required-research-fresh', 'research-conflicts-disposed'];
  const requirementsIds = ['topology-confirmed', 'ambiguity-threshold-met', 'no-pending-question', 'requirements-approved'];
  const assertions = Object.freeze([
    clarifyAssertion('research-complete', readinessItemsPass(items, researchIds), readinessEvidence(items, researchIds)),
    clarifyAssertion('decisions-durable', readinessItemsPass(items, ['decisions-sealed']), [decisionSnapshotRef]),
    clarifyAssertion('technical-debt-disposed', readinessItemsPass(items, ['technical-debt-disposed']), [debtRef]),
    clarifyAssertion('project-contract-disposed', readinessItemsPass(items, ['project-contract-disposed']), [contractRef]),
    clarifyAssertion('requirements-ready', readinessItemsPass(items, requirementsIds), [requirementsRef]),
    clarifyAssertion('classification-ready', readinessItemsPass(items, ['classification-fresh']), [classificationRef]),
    clarifyAssertion('scope-confirmed', readinessItemsPass(items, ['requirements-approved']), [decisionSnapshotRef]),
  ]);
  return Object.freeze({
    status: readiness.status,
    assertions,
    recovery: readiness.recovery ? Object.freeze({ ...readiness.recovery }) : null,
  });
}

export function completionChainForBehavior(root, changeId, behavior, requiredArtifacts) {
  const label = behavior === 'design.produce' ? 'architecture' : 'test-design';
  const chain = {
    stageResult: null,
    reviewResult: null,
    producerBindings: [],
    reviewerBindings: [],
    problems: [],
    executionRef: null,
    reviewRef: null,
    executeInput: null,
    reviewInput: null,
  };
  const executionCandidate = freshestExecutionForBehavior(root, changeId, 'design', behavior);
  if (!executionCandidate) {
    chain.problems.push(`${label} StageResult is missing`);
    return chain;
  }
  const executionProblems = [];
  const execution = loadRun(root, changeId, executionCandidate.runId, 'execute', executionProblems);
  chain.executeInput = execution?.input || null;
  chain.executionRef = execution?.resultPath
    ? path.relative(root, execution.resultPath).split(path.sep).join('/')
    : null;
  if (!execution?.input || execution.input.stage !== 'design' || execution.input.behavior !== behavior) {
    chain.problems.push(...executionProblems, `${label} StageResult is missing`);
    return chain;
  }
  executionProblems.push(...freshInputDigests(root, execution.input).map((problem) => `${executionCandidate.runId}: ${problem}`));
  if (!execution.result) executionProblems.push(`${executionCandidate.runId}: ${label} StageResult is missing`);
  if (execution.result) {
    executionProblems.push(...validateStageResult(root, execution.result).map((problem) => `${executionCandidate.runId}: ${problem}`));
    if (!matchingProducer(execution.result, execution.input)) {
      executionProblems.push(`${executionCandidate.runId}: StageResult producer does not match handoff agent`);
    }
    if (execution.result.runId !== execution.input.runId
        || execution.result.changeId !== changeId
        || execution.result.stage !== 'design') {
      executionProblems.push(`${executionCandidate.runId}: StageResult does not bind the design handoff`);
    }
    if (!sameDigestMap(execution.result.inputDigests, execution.input.inputDigests)) {
      executionProblems.push(`${executionCandidate.runId}: StageResult input digests do not match the execute handoff`);
    }
    if (!sameTecpc(execution.result.tecpc, execution.input.tecpc)) {
      executionProblems.push(`${executionCandidate.runId}: StageResult TECPC does not match execute handoff`);
    }
    const artifacts = Array.isArray(execution.result.artifacts) ? execution.result.artifacts : [];
    const missing = requiredArtifacts.filter((artifactPath) => !artifacts.some((artifact) => artifact.path === artifactPath));
    if (missing.length > 0) executionProblems.push(`${executionCandidate.runId}: StageResult does not bind ${missing.join(', ')}`);
    if (execution.result.status !== 'pass' || execution.result.selfCheck?.verdict !== 'pass') {
      executionProblems.push(`${executionCandidate.runId}: StageResult self-check did not pass`);
    }
  }
  chain.producerBindings = trustedHandoffAgentBindings(root, changeId, execution.input);
  if (chain.producerBindings.length === 0) {
    executionProblems.push(`${executionCandidate.runId}: execute handoff has no trusted completed agent binding`);
  }
  if (executionProblems.length > 0) {
    chain.problems.push(...executionProblems);
    return chain;
  }
  chain.stageResult = execution.result;

  const checkCandidate = freshestRunForStage(root, changeId, 'design', 'check', {
    parentRunId: execution.input.runId,
  });
  if (!checkCandidate) {
    chain.problems.push(`${executionCandidate.runId}: ${label} ReviewResult is missing`);
    return chain;
  }
  const reviewProblems = [];
  const check = loadRun(root, changeId, checkCandidate.runId, 'check', reviewProblems);
  chain.reviewInput = check?.input || null;
  chain.reviewRef = check?.resultPath
    ? path.relative(root, check.resultPath).split(path.sep).join('/')
    : null;
  if (!check?.input || check.input.stage !== 'design' || check.input.parentRunId !== execution.input.runId) {
    chain.problems.push(...reviewProblems, `${checkCandidate.runId}: ${label} ReviewResult is missing`);
    return chain;
  }
  reviewProblems.push(...freshInputDigests(root, check.input).map((problem) => `${checkCandidate.runId}: ${problem}`));
  if (!check.result) reviewProblems.push(`${checkCandidate.runId}: ${label} ReviewResult is missing`);
  if (check.result) {
    reviewProblems.push(...validateReviewResult(root, check.result, { stageResult: execution.result })
      .map((problem) => `${checkCandidate.runId}: ${problem}`));
    if (check.result.runId !== check.input.runId) {
      reviewProblems.push(`${checkCandidate.runId}: ReviewResult does not bind the check handoff run ID`);
    }
    if (JSON.stringify(check.result.rubricIds) !== JSON.stringify(check.input.rubricIds)) {
      reviewProblems.push(`${checkCandidate.runId}: ReviewResult rubrics do not match the check handoff`);
    }
    if (!sameTecpc(check.result.tecpc, check.input.tecpc)) {
      reviewProblems.push(`${checkCandidate.runId}: ReviewResult TECPC does not match check handoff`);
    }
    if (!sameArtifacts(check.result.reviewedArtifacts, execution.result.artifacts)) {
      reviewProblems.push(`${checkCandidate.runId}: ReviewResult artifacts do not match the StageResult`);
    }
    if (!matchingReviewer(check.result, check.input)) {
      reviewProblems.push(`${checkCandidate.runId}: ReviewResult reviewer does not match handoff agent`);
    }
    if (check.result.verdict !== 'pass') reviewProblems.push(`${checkCandidate.runId}: ReviewResult did not pass`);
  }
  chain.reviewerBindings = trustedHandoffAgentBindings(root, changeId, check.input);
  if (chain.reviewerBindings.length === 0) {
    reviewProblems.push(`${checkCandidate.runId}: check handoff has no trusted completed reviewer agent binding`);
  }
  const producerAgentIds = new Set(chain.producerBindings.map(({ agentId }) => agentId));
  if (chain.reviewerBindings.length > 0
      && !chain.reviewerBindings.some(({ agentId }) => !producerAgentIds.has(agentId))) {
    reviewProblems.push(`${checkCandidate.runId}: execute and check handoffs must use distinct agent identities`);
  }
  const tecpcProblems = [
    ...validateTecpc(execution.result?.tecpc),
    ...validateTecpc(check.result?.tecpc),
  ];
  if (execution.result?.tecpc?.correction !== null
      || check.result?.tecpc?.correction !== null
      || check.result?.correction !== null) {
    tecpcProblems.push('TECPC correction remains pending');
  }
  reviewProblems.push(...tecpcProblems);
  if (reviewProblems.length > 0) {
    chain.problems.push(...reviewProblems);
    return chain;
  }
  chain.reviewResult = check.result;
  return chain;
}

function designCompletionCandidateFor(root, changeId) {
  const state = {
    selfCheck: layer(), review: layer(), tecpc: layer(), proof: layer(),
    candidateProof: null, problems: [], chains: {},
  };
  const fail = (key, refs, problems) => {
    state[key] = layer(layerStatus(problems), refs, problems);
    state.problems = [...problems];
    return state;
  };
  const architecture = completionChainForBehavior(
    root,
    changeId,
    'design.produce',
    [`harness/changes/${changeId}/design.md`],
  );
  state.chains.architecture = architecture;
  if (architecture.problems.length > 0) {
    return fail(
      architecture.stageResult ? 'review' : 'selfCheck',
      [architecture.executionRef, architecture.reviewRef].filter(Boolean),
      architecture.problems,
    );
  }
  const testDesign = completionChainForBehavior(
    root,
    changeId,
    'design.test-cases',
    [`harness/changes/${changeId}/test-cases.md`],
  );
  state.chains.testDesign = testDesign;
  if (testDesign.problems.length > 0) {
    return fail(
      testDesign.stageResult ? 'review' : 'selfCheck',
      [testDesign.executionRef, testDesign.reviewRef].filter(Boolean),
      testDesign.problems,
    );
  }

  let architectureProof;
  try {
    architectureProof = readDesignArchitectureProof(root, changeId);
    const canonical = buildDesignArchitectureProof(root, architecture.stageResult, architecture.reviewResult);
    if (!sameDesignArchitectureProofBinding(architectureProof, canonical)) {
      throw new Error('EH-DESIGN-PROOF-001: architecture proof does not exactly bind the canonical architecture chain');
    }
  } catch (error) {
    return fail('proof', [architecture.executionRef, architecture.reviewRef].filter(Boolean), [error.message]);
  }

  try {
    state.candidateProof = buildCompoundDesignProof(
      root,
      architectureProof,
      testDesign.stageResult,
      testDesign.reviewResult,
    );
  } catch (error) {
    return fail('proof', [
      architecture.executionRef,
      architecture.reviewRef,
      testDesign.executionRef,
      testDesign.reviewRef,
    ].filter(Boolean), [error.message]);
  }
  state.selfCheck = layer('pass', [architecture.executionRef, testDesign.executionRef].filter(Boolean));
  state.review = layer('pass', [architecture.reviewRef, testDesign.reviewRef].filter(Boolean));
  state.tecpc = layer('pass', [
    architecture.executionRef,
    architecture.reviewRef,
    testDesign.executionRef,
    testDesign.reviewRef,
  ].filter(Boolean));
  return state;
}

function sameProofBinding(proof, candidate) {
  return proof?.changeId === candidate?.changeId
    && proof?.stage === candidate?.stage
    && proof?.executionRunId === candidate?.executionRunId
    && proof?.reviewRunId === candidate?.reviewRunId
    && JSON.stringify(proof?.stageProofs || []) === JSON.stringify(candidate?.stageProofs || [])
    && sameArtifacts(proof?.artifacts, candidate?.artifacts)
    && sameArtifacts(proof?.reviewedArtifacts, candidate?.reviewedArtifacts)
    && JSON.stringify(proof?.decisionSnapshotRef || null) === JSON.stringify(candidate?.decisionSnapshotRef || null)
    && JSON.stringify(proof?.assertions || []) === JSON.stringify(candidate?.assertions || [])
    && JSON.stringify(proof?.tecpc || null) === JSON.stringify(candidate?.tecpc || null)
    && JSON.stringify(proof?.waivers || []) === JSON.stringify(candidate?.waivers || [])
    && proof?.target === candidate?.target
    && JSON.stringify(proof?.evidence || []) === JSON.stringify(candidate?.evidence || [])
    && JSON.stringify(proof?.context || []) === JSON.stringify(candidate?.context || [])
    && proof?.path === candidate?.path;
}

function stageCompletionCandidateFor(root, changeId, stage, {
  requiredArtifactPath = null,
  requiredArtifactPaths = [],
} = {}) {
  if (stage === 'implement') {
    throw new Error('stageCompletionFor only supports singular non-implement stage completion');
  }
  if (stage === 'design') return designCompletionCandidateFor(root, changeId);
  const requiredArtifacts = [...new Set([
    ...requiredStageResultArtifacts(changeId, stage),
    ...(requiredArtifactPath ? [requiredArtifactPath] : []),
    ...requiredArtifactPaths,
  ])];
  const state = {
    selfCheck: layer(), review: layer(), tecpc: layer(), proof: layer(),
    candidateProof: null, problems: [],
  };
  const fail = (key, refs, problems) => {
    state[key] = layer(layerStatus(problems), refs, problems);
    state.problems = [...problems];
    return state;
  };
  const executionCandidate = freshestStageExecution(root, changeId, stage);
  if (!executionCandidate) return fail('selfCheck', [], [`${stage} has no fresh, valid passing StageResult`]);
  const executionProblems = [];
  const execution = loadRun(root, changeId, executionCandidate.runId, 'execute', executionProblems);
  const executionRef = execution?.resultPath ? path.relative(root, execution.resultPath).split(path.sep).join('/') : [];
  if (!execution?.input || execution.input.stage !== stage) {
    return fail('selfCheck', executionRef ? [executionRef] : [], [...executionProblems, `${stage} has no fresh, valid passing StageResult`]);
  }
  executionProblems.push(...freshInputDigests(root, execution.input).map((problem) => `${executionCandidate.runId}: ${problem}`));
  if (!execution.result) executionProblems.push(`${executionCandidate.runId}: StageResult is missing`);
  if (execution.result) {
    executionProblems.push(...validateStageResult(root, execution.result).map((problem) => `${executionCandidate.runId}: ${problem}`));
    if (stage === 'clarify') {
      const projection = clarifyStageResultProjection(root, changeId);
      if (projection.status !== 'ready') {
        executionProblems.push(`${executionCandidate.runId}: ${projection.recovery.code}: ${projection.recovery.action}`);
      } else if (JSON.stringify(execution.result.assertions) !== JSON.stringify(projection.assertions)) {
        executionProblems.push(`${executionCandidate.runId}: Clarify StageResult assertions do not match current canonical readiness`);
      }
    }
    if (!matchingProducer(execution.result, execution.input)) executionProblems.push(`${executionCandidate.runId}: StageResult producer does not match handoff agent`);
    if (execution.result.runId !== execution.input.runId || execution.result.changeId !== changeId || execution.result.stage !== stage) {
      executionProblems.push(`${executionCandidate.runId}: StageResult does not bind the ${stage} handoff`);
    }
    if (!sameDigestMap(execution.result.inputDigests, execution.input.inputDigests)) executionProblems.push(`${executionCandidate.runId}: StageResult input digests do not match the execute handoff`);
    const artifacts = Array.isArray(execution.result.artifacts) ? execution.result.artifacts : [];
    const missing = requiredArtifacts.filter((artifactPath) => !artifacts.some((artifact) => artifact.path === artifactPath));
    if (missing.length > 0) executionProblems.push(`${executionCandidate.runId}: StageResult does not bind ${missing.join(', ')}`);
    if (execution.result.status !== 'pass' || execution.result.selfCheck?.verdict !== 'pass') executionProblems.push(`${executionCandidate.runId}: StageResult self-check did not pass`);
  }
  const isMainOwnedClarify = stage === 'clarify' && normalizeAgentType(execution.input.agent?.type) === 'enterprise-harness:main';
  const producerBindings = isMainOwnedClarify ? [{ agentId: 'enterprise-harness:main' }] : trustedHandoffAgentBindings(root, changeId, execution.input);
  if (producerBindings.length === 0) executionProblems.push(`${executionCandidate.runId}: execute handoff has no trusted completed agent binding`);
  if (executionProblems.length > 0) return fail('selfCheck', executionRef ? [executionRef] : [], executionProblems);
  state.selfCheck = layer('pass', [executionRef]);

  const checkCandidate = freshestRunForStage(root, changeId, stage, 'check', { parentRunId: execution.input.runId });
  if (!checkCandidate) return fail('review', [], [`${executionCandidate.runId}: ReviewResult is missing`]);
  const reviewProblems = [];
  const check = loadRun(root, changeId, checkCandidate.runId, 'check', reviewProblems);
  const reviewRef = check?.resultPath ? path.relative(root, check.resultPath).split(path.sep).join('/') : null;
  if (!check?.input || check.input.stage !== stage || check.input.parentRunId !== execution.input.runId) {
    return fail('review', reviewRef ? [reviewRef] : [], [...reviewProblems, `${checkCandidate.runId}: ReviewResult is missing`]);
  }
  reviewProblems.push(...freshInputDigests(root, check.input).map((problem) => `${checkCandidate.runId}: ${problem}`));
  if (!check.result) reviewProblems.push(`${checkCandidate.runId}: ReviewResult is missing`);
  if (check.result) {
    reviewProblems.push(...validateReviewResult(root, check.result, { stageResult: execution.result }).map((problem) => `${checkCandidate.runId}: ${problem}`));
    if (check.result.runId !== check.input.runId) reviewProblems.push(`${checkCandidate.runId}: ReviewResult does not bind the check handoff run ID`);
    if (JSON.stringify(check.result.rubricIds) !== JSON.stringify(check.input.rubricIds)) reviewProblems.push(`${checkCandidate.runId}: ReviewResult rubrics do not match the check handoff`);
    if (!sameArtifacts(check.result.reviewedArtifacts, execution.result.artifacts)) reviewProblems.push(`${checkCandidate.runId}: ReviewResult artifacts do not match the StageResult`);
    if (!matchingReviewer(check.result, check.input)) reviewProblems.push(`${checkCandidate.runId}: ReviewResult reviewer does not match handoff agent`);
    if (check.result.verdict !== 'pass') reviewProblems.push(`${checkCandidate.runId}: ReviewResult did not pass`);
  }
  const reviewerBindings = trustedHandoffAgentBindings(root, changeId, check.input);
  if (reviewerBindings.length === 0) reviewProblems.push(`${checkCandidate.runId}: check handoff has no trusted completed reviewer agent binding`);
  const producerAgentIds = new Set(producerBindings.map(({ agentId }) => agentId));
  const hasReusedReviewer = reviewerBindings.some(({ agentId }) => producerAgentIds.has(agentId));
  const hasDistinctReviewer = reviewerBindings.some(({ agentId }) => !producerAgentIds.has(agentId));
  if (reviewerBindings.length > 0 && (stage === 'clarify' ? hasReusedReviewer : !hasDistinctReviewer)) {
    reviewProblems.push(`${checkCandidate.runId}: execute and check handoffs must use distinct agent identities`);
  }
  if (reviewProblems.length > 0) return fail('review', reviewRef ? [reviewRef] : [], reviewProblems);
  state.review = layer('pass', [reviewRef]);

  const tecpcProblems = [
    ...validateTecpc(execution.result.tecpc),
    ...validateTecpc(check.result.tecpc),
  ];
  if (execution.result.tecpc?.correction !== null || check.result.tecpc?.correction !== null || check.result.correction !== null) {
    tecpcProblems.push('TECPC correction remains pending');
  }
  if (tecpcProblems.length > 0) return fail('tecpc', [executionRef, reviewRef], tecpcProblems);

  try {
    state.candidateProof = buildCompletionProof(root, {
      stageResult: execution.result,
      reviewResult: check.result,
      producerAgentIds: producerBindings.map(({ agentId }) => agentId),
      reviewerAgentIds: reviewerBindings.map(({ agentId }) => agentId),
    });
  } catch (error) {
    return fail(stage === 'clarify' ? 'tecpc' : 'proof', [executionRef, reviewRef], [error.message]);
  }
  state.tecpc = layer('pass', [executionRef, reviewRef]);
  state.problems = [];
  return state;
}

export function stageCompletionFor(root, changeId, stage, options = {}) {
  const state = stageCompletionCandidateFor(root, changeId, stage, options);
  if (!state.candidateProof) return state;
  const proofRef = `harness/changes/${changeId}/evidence/completion/${stage}.json`;
  const proofPath = path.join(root, proofRef);
  if (!fs.existsSync(proofPath)) {
    const problems = [`${stage} CompletionProof is missing`];
    state.proof = layer('blocked', [], problems);
    state.problems = problems;
    return state;
  }
  const proofProblems = [];
  const proof = readJson(proofPath, proofRef, proofProblems);
  if (proof) {
    proofProblems.push(...validateCompletionProof(root, proof));
    if (!sameProofBinding(proof, state.candidateProof)) proofProblems.push(`${stage} CompletionProof does not exactly bind canonical result, TECPC, artifacts, and run IDs`);
  }
  if (proofProblems.length > 0) {
    state.proof = layer(layerStatus(proofProblems), [proofRef], proofProblems);
    state.problems = proofProblems;
    return state;
  }
  state.proof = layer('pass', [proofRef]);
  state.problems = [];
  return state;
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

  if (stage !== 'implement') {
    const completion = stageCompletionFor(root, changeId, stage, { requiredArtifactPath, requiredArtifactPaths });
    return completion.proof.status === 'pass' && completion.candidateProof
      ? { proof: completion.candidateProof, problems: [] }
      : { proof: null, problems: completion.problems };
  }

  for (const runId of runs) {
    const execution = loadRun(root, changeId, runId, 'execute', problems);
    if (!execution?.input || execution.input.stage !== stage) continue;
    const executionInputProblems = freshInputDigests(root, execution.input);
    if (executionInputProblems.length > 0) {
      problems.push(...executionInputProblems.map((problem) => `${runId}: ${problem}`));
      continue;
    }
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

  const proof = implementCompletionProof(root, changeId, executions, problems);
  if (proof) return { proof, problems: [] };
  if (executions.length === 0) problems.push('implement has no fresh, valid passing StageResult');
  return { proof: null, problems };
}

export function resolveStageCompletionCandidate(root, changeId, stage, options = {}) {
  if (stage === 'implement') return resolveStageCompletionProof(root, changeId, stage, options);
  const completion = stageCompletionCandidateFor(root, changeId, stage, options);
  return completion.candidateProof
    ? { proof: completion.candidateProof, problems: [] }
    : { proof: null, problems: completion.problems };
}

export function validateStageGate(root, changeId, stage, options) {
  if (stage === 'implement') return resolveStageCompletionProof(root, changeId, stage, options).problems;
  return stageCompletionFor(root, changeId, stage, options).problems;
}

export function validateDesignStageGate(root, changeId) {
  return validateStageGate(root, changeId, 'design', {
    requiredArtifactPath: `harness/changes/${changeId}/design.md`,
  });
}
