import crypto from 'node:crypto';
import fs from 'node:fs';
import { agentForV2Handoff } from '../core/handoff-agent.mjs';
import { resolveWithin } from './safe-paths.mjs';
import { isWaiverFresh, validateWaiver } from './waiver.mjs';

const DIGEST = /^[a-f0-9]{64}$/u;
const RUN_ID = /^run_[0-9a-f-]{36}$/u;
const STAGES = new Set(['clarify', 'design', 'plan', 'implement', 'verify', 'archive']);
const ROLES = new Set(['execute', 'check']);
const RESULT_STATUSES = new Set(['pass', 'block', 'needs_decision']);
const REVIEW_VERDICTS = new Set(['pass', 'block', 'unsupported']);
const TECPC_FIELDS = new Set(['target', 'evidence', 'context', 'path', 'correction']);
const ARTIFACT_FIELDS = new Set(['path', 'digest']);
const ASSERTION_FIELDS = new Set(['id', 'verdict', 'evidence']);
const SELF_CHECK_FIELDS = new Set(['verdict', 'findings', 'evidence']);
const STAGE_RESULT_FIELDS = new Set([
  'resultVersion', 'type', 'changeId', 'stage', 'runId', 'producer', 'inputDigests',
  'artifacts', 'waivers', 'assertions', 'selfCheck', 'tecpc', 'status', 'needsDecision', 'completedAt',
]);
const REVIEW_RESULT_FIELDS = new Set([
  'resultVersion', 'type', 'changeId', 'stage', 'runId', 'parentRunId', 'reviewer',
  'reviewedRunId', 'reviewedArtifacts', 'rubricIds', 'tecpc', 'verdict', 'correction', 'reviewedAt',
]);
const COMPLETION_PROOF_FIELDS = new Set([
  'proofVersion', 'type', 'changeId', 'stage', 'executionRunId', 'reviewRunId', 'taskProofs', 'waivers',
  'artifacts', 'target', 'evidence', 'context', 'path', 'createdAt',
]);
const HANDOFF_V2_FIELDS = new Set([
  'handoffVersion', 'runId', 'changeId', 'stage', 'behavior', 'role', 'parentRunId',
  'agent', 'tecpc', 'inputRefs', 'inputDigests', 'rubricIds', 'createdAt',
]);
const RESEARCH_PACKET_FIELDS = new Set([
  'packetVersion', 'type', 'changeId', 'source', 'question', 'scope', 'facts', 'uncertainties', 'authority',
  'fallback', 'degraded', 'recommendedDecision', 'inputRefs', 'inputDigests', 'collectedAt',
]);
const RESEARCH_FACT_FIELDS = new Set(['claim', 'sources']);
const RESEARCH_SOURCES = new Set(['code-explore', 'doc-research']);

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function rejectUnknownProperties(value, field, allowed, problems) {
  if (!isObject(value)) return;
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) problems.push(`${field} has unknown property ${key}`);
  }
}

function isDigest(value) {
  return typeof value === 'string' && DIGEST.test(value);
}

function isIsoDate(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function validateStringArray(value, field, problems) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item.trim())) {
    problems.push(`${field} must be a non-empty string array`);
  }
}

function validateRubricIds(value, field, problems, { required = true } = {}) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item.trim())) {
    problems.push(`${field} must be a string array`);
    return;
  }
  if (required && value.length === 0) problems.push(`${field} must not be empty`);
  if (new Set(value).size !== value.length) problems.push(`${field} must not contain duplicates`);
}

function validateDigestMap(value, field, problems) {
  if (!isObject(value)) {
    problems.push(`${field} must be an object`);
    return;
  }
  for (const [ref, digest] of Object.entries(value)) {
    if (!ref.trim()) problems.push(`${field} has an empty reference`);
    if (!isDigest(digest)) problems.push(`${field}.${ref} must be a sha256 digest`);
  }
}

function validateProducer(value, field, problems) {
  if (!isObject(value) || !String(value.agentType || '').trim() || !String(value.skill || '').trim()) {
    problems.push(`${field} requires agentType and skill`);
  }
}

export function sha256Artifact(root, artifactPath) {
  const absolute = resolveWithin(root, artifactPath, 'artifactPath');
  return crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex');
}

export function validateTecpc(tecpc, { allowEmpty = false } = {}) {
  const problems = [];
  if (!isObject(tecpc)) return ['tecpc must be an object'];
  rejectUnknownProperties(tecpc, 'tecpc', TECPC_FIELDS, problems);
  if (!String(tecpc.target || '').trim()) problems.push('tecpc.target is required');
  if (allowEmpty) {
    if (!Array.isArray(tecpc.evidence) || tecpc.evidence.some((item) => typeof item !== 'string' || !item.trim())) {
      problems.push('tecpc.evidence must be a string array');
    }
    if (!Array.isArray(tecpc.context) || tecpc.context.some((item) => typeof item !== 'string' || !item.trim())) {
      problems.push('tecpc.context must be a string array');
    }
  } else {
    validateStringArray(tecpc.evidence, 'tecpc.evidence', problems);
    validateStringArray(tecpc.context, 'tecpc.context', problems);
  }
  if (typeof tecpc.path !== 'string') problems.push('tecpc.path must be a string');
  if (tecpc.correction !== null && (typeof tecpc.correction !== 'string' || !tecpc.correction.trim())) {
    problems.push('tecpc.correction must be null or a non-empty string');
  }
  return problems;
}

function validateArtifacts(root, artifacts, field, problems) {
  if (!Array.isArray(artifacts) || artifacts.length === 0) {
    problems.push(`${field} must be a non-empty array`);
    return;
  }
  for (const artifact of artifacts) {
    rejectUnknownProperties(artifact, field, ARTIFACT_FIELDS, problems);
    if (!isObject(artifact) || !String(artifact.path || '').trim() || !isDigest(artifact.digest)) {
      problems.push(`${field} entries require path and sha256 digest`);
      continue;
    }
    try {
      if (sha256Artifact(root, artifact.path) !== artifact.digest) {
        problems.push(`artifact digest is stale: ${artifact.path}`);
      }
    } catch (error) {
      problems.push(`artifact is unreadable: ${artifact.path} (${error.message})`);
    }
  }
}

function validateWaivers(waivers, artifacts, field, problems) {
  if (waivers === undefined) return;
  if (!Array.isArray(waivers)) {
    problems.push(`${field} must be an array`);
    return;
  }
  if (waivers.length > 0) {
    problems.push(
      `${field}: waivers are disabled until trusted authorization evidence is available`,
    );
  }
  const waiverIds = new Set();
  for (const [index, waiver] of waivers.entries()) {
    const waiverField = `${field}[${index}]`;
    try {
      validateWaiver(waiver);
    } catch (error) {
      problems.push(`${waiverField}: ${error.message}`);
      continue;
    }
    if (waiverIds.has(waiver.waiverId)) problems.push(`${field} must not contain duplicate waiverId ${waiver.waiverId}`);
    waiverIds.add(waiver.waiverId);
    const artifact = (artifacts || []).find(({ path }) => path === waiver.artifact.path);
    if (!artifact) {
      problems.push(`${waiverField} artifact is not a stage result artifact: ${waiver.artifact.path}`);
      continue;
    }
    if (!isWaiverFresh(waiver, artifact)) {
      problems.push(`${waiverField} artifact digest is stale: ${waiver.artifact.path}`);
    }
  }
}

function validateAssertions(assertions, problems) {
  if (!Array.isArray(assertions) || assertions.length === 0) {
    problems.push('assertions must be a non-empty array');
    return;
  }
  for (const assertion of assertions) {
    rejectUnknownProperties(assertion, 'assertion', ASSERTION_FIELDS, problems);
    if (!isObject(assertion) || !String(assertion.id || '').trim()) {
      problems.push('assertion requires id');
      continue;
    }
    if (!['pass', 'block'].includes(assertion.verdict)) {
      problems.push(`assertion ${assertion.id} has invalid verdict`);
    }
    validateStringArray(assertion.evidence, `assertion ${assertion.id}.evidence`, problems);
  }
}

function validateSelfCheck(selfCheck, problems) {
  if (!isObject(selfCheck)) {
    problems.push('selfCheck is required');
    return;
  }
  rejectUnknownProperties(selfCheck, 'selfCheck', SELF_CHECK_FIELDS, problems);
  if (!['pass', 'block'].includes(selfCheck.verdict)) problems.push('selfCheck has invalid verdict');
  if (!Array.isArray(selfCheck.findings) || selfCheck.findings.some((finding) => typeof finding !== 'string' || !finding.trim())) {
    problems.push('selfCheck.findings must be a string array');
  }
  validateStringArray(selfCheck.evidence, 'selfCheck.evidence', problems);
}

export function validateResearchPacket(root, packet) {
  const problems = [];
  if (!isObject(packet)) return ['research packet must be an object'];
  rejectUnknownProperties(packet, 'research packet', RESEARCH_PACKET_FIELDS, problems);
  if (packet.packetVersion !== 1) problems.push('packetVersion must be 1');
  if (packet.type !== 'research-packet') problems.push('type must be research-packet');
  if (!String(packet.changeId || '').trim()) problems.push('changeId is required');
  if (!RESEARCH_SOURCES.has(packet.source)) problems.push(`invalid research source ${packet.source}`);
  if (!String(packet.question || '').trim()) problems.push('question is required');
  validateStringArray(packet.scope, 'scope', problems);
  if (!Array.isArray(packet.uncertainties) || packet.uncertainties.some((item) => typeof item !== 'string' || !item.trim())) {
    problems.push('uncertainties must be a string array');
  }
  const expectedAuthority = packet.source === 'code-explore' ? 'codegraph-first' : 'context7-first';
  if (packet.authority !== expectedAuthority) problems.push(`authority must be ${expectedAuthority}`);
  if (packet.fallback !== null && (typeof packet.fallback !== 'string' || !packet.fallback.trim())) {
    problems.push('fallback must be null or a non-empty string');
  }
  if (typeof packet.degraded !== 'boolean') problems.push('degraded must be a boolean');
  if (packet.degraded && packet.fallback === null) problems.push('degraded research requires fallback detail');
  if (packet.recommendedDecision !== null && (typeof packet.recommendedDecision !== 'string' || !packet.recommendedDecision.trim())) {
    problems.push('recommendedDecision must be null or a non-empty string');
  }
  if (!Array.isArray(packet.facts) || packet.facts.length === 0) {
    problems.push('facts must be a non-empty array');
  } else {
    for (const fact of packet.facts) {
      rejectUnknownProperties(fact, 'research fact', RESEARCH_FACT_FIELDS, problems);
      if (!isObject(fact) || !String(fact.claim || '').trim()) problems.push('research fact requires claim');
      validateStringArray(fact?.sources, 'research fact.sources', problems);
    }
  }
  if (!Array.isArray(packet.inputRefs) || packet.inputRefs.some((ref) => typeof ref !== 'string' || !ref.trim())) {
    problems.push('inputRefs must be a string array');
  }
  validateDigestMap(packet.inputDigests, 'inputDigests', problems);
  for (const ref of packet.inputRefs || []) {
    if (!(ref in (packet.inputDigests || {}))) {
      problems.push(`inputDigests is missing ${ref}`);
      continue;
    }
    try {
      if (sha256Artifact(root, ref) !== packet.inputDigests[ref]) problems.push(`input digest is stale: ${ref}`);
    } catch (error) {
      problems.push(`input is unreadable: ${ref} (${error.message})`);
    }
  }
  if (!isIsoDate(packet.collectedAt)) problems.push('collectedAt must be an ISO timestamp');
  return problems;
}

export function validateStageResult(root, result) {
  const problems = [];
  if (!isObject(result)) return ['stage result must be an object'];
  rejectUnknownProperties(result, 'stage result', STAGE_RESULT_FIELDS, problems);
  if (result.resultVersion !== 1) problems.push('resultVersion must be 1');
  if (result.type !== 'stage-result') problems.push('type must be stage-result');
  if (!String(result.changeId || '').trim()) problems.push('changeId is required');
  if (!STAGES.has(result.stage)) problems.push(`invalid stage ${result.stage}`);
  if (!RUN_ID.test(String(result.runId || ''))) problems.push('runId must be a v2 run id');
  rejectUnknownProperties(result.producer, 'producer', new Set(['agentType', 'skill']), problems);
  validateProducer(result.producer, 'producer', problems);
  validateDigestMap(result.inputDigests, 'inputDigests', problems);
  validateArtifacts(root, result.artifacts, 'artifacts', problems);
  validateWaivers(result.waivers, result.artifacts, 'waivers', problems);
  validateAssertions(result.assertions, problems);
  validateSelfCheck(result.selfCheck, problems);
  problems.push(...validateTecpc(result.tecpc));
  if (!RESULT_STATUSES.has(result.status)) problems.push(`invalid status ${result.status}`);
  if (result.status === 'pass' && result.assertions?.some((assertion) => assertion?.verdict !== 'pass')) {
    problems.push('pass requires every assertion to pass');
  }
  if (result.status === 'pass' && result.selfCheck?.verdict !== 'pass') {
    problems.push('pass requires selfCheck to pass');
  }
  if (result.status === 'needs_decision' && !String(result.needsDecision || '').trim()) {
    problems.push('needs_decision requires needsDecision');
  }
  if (result.status !== 'needs_decision' && result.needsDecision !== null) {
    problems.push(`${result.status} requires needsDecision=null`);
  }
  if (!isIsoDate(result.completedAt)) problems.push('completedAt must be an ISO timestamp');
  return problems;
}

export function validateReviewResult(root, result, { stageResult } = {}) {
  const problems = [];
  if (!isObject(result)) return ['review result must be an object'];
  rejectUnknownProperties(result, 'review result', REVIEW_RESULT_FIELDS, problems);
  if (result.resultVersion !== 1) problems.push('resultVersion must be 1');
  if (result.type !== 'review-result') problems.push('type must be review-result');
  if (!String(result.changeId || '').trim()) problems.push('changeId is required');
  if (!STAGES.has(result.stage)) problems.push(`invalid stage ${result.stage}`);
  if (!RUN_ID.test(String(result.runId || ''))) problems.push('runId must be a v2 run id');
  if (!RUN_ID.test(String(result.parentRunId || ''))) problems.push('parentRunId must be a v2 run id');
  rejectUnknownProperties(result.reviewer, 'reviewer', new Set(['agentType', 'skill']), problems);
  validateProducer(result.reviewer, 'reviewer', problems);
  if (!RUN_ID.test(String(result.reviewedRunId || ''))) problems.push('reviewedRunId must be a v2 run id');
  if (result.runId === result.parentRunId || result.runId === result.reviewedRunId) {
    problems.push('review must use an independent run');
  }
  validateArtifacts(root, result.reviewedArtifacts, 'reviewedArtifacts', problems);
  validateRubricIds(result.rubricIds, 'rubricIds', problems);
  problems.push(...validateTecpc(result.tecpc));
  if (!REVIEW_VERDICTS.has(result.verdict)) problems.push(`invalid verdict ${result.verdict}`);
  if (result.verdict === 'pass' && result.correction !== null) problems.push('pass requires correction=null');
  if (result.verdict !== 'pass' && (typeof result.correction !== 'string' || !result.correction.trim())) {
    problems.push(`${result.verdict} requires a correction`);
  }
  if (!isIsoDate(result.reviewedAt)) problems.push('reviewedAt must be an ISO timestamp');
  if (stageResult) {
    if (result.changeId !== stageResult.changeId) problems.push('review changeId does not match stage result');
    if (result.stage !== stageResult.stage) problems.push('review stage does not match stage result');
    if (result.reviewedRunId !== stageResult.runId || result.parentRunId !== stageResult.runId) {
      problems.push('review must bind the stage result run');
    }
  }
  return problems;
}

export function validateCompletionProof(root, proof) {
  const problems = [];
  if (!isObject(proof)) return ['completion proof must be an object'];
  rejectUnknownProperties(proof, 'completion proof', COMPLETION_PROOF_FIELDS, problems);
  if (proof.proofVersion !== 1) problems.push('proofVersion must be 1');
  if (proof.type !== 'completion-proof') problems.push('type must be completion-proof');
  if (!String(proof.changeId || '').trim()) problems.push('changeId is required');
  if (!STAGES.has(proof.stage)) problems.push(`invalid stage ${proof.stage}`);
  if (proof.stage === 'implement') {
    if (!Array.isArray(proof.taskProofs)) {
      problems.push('implement completion proof requires taskProofs');
    } else {
      if (proof.taskProofs.length === 0) problems.push('implement completion proof requires taskProofs');
      const taskIds = new Set();
      for (const [index, taskProof] of proof.taskProofs.entries()) {
      if (!isObject(taskProof)) {
        problems.push(`taskProofs[${index}] must be an object`);
        continue;
      }
      const taskProofFields = new Set(['taskId', 'executionRunId', 'reviewRunId', 'artifacts']);
      rejectUnknownProperties(taskProof, `taskProofs[${index}]`, taskProofFields, problems);
      for (const field of ['taskId', 'executionRunId', 'reviewRunId', 'artifacts']) {
        if (!(field in taskProof)) problems.push(`taskProofs[${index}] is missing ${field}`);
      }
      if (!String(taskProof.taskId || '').trim()) problems.push(`taskProofs[${index}].taskId is required`);
      if (taskIds.has(taskProof.taskId)) problems.push(`duplicate task proof ${taskProof.taskId}`);
      taskIds.add(taskProof.taskId);
      if (!RUN_ID.test(String(taskProof.executionRunId || ''))) problems.push(`taskProofs[${index}].executionRunId is invalid`);
      if (!RUN_ID.test(String(taskProof.reviewRunId || ''))) problems.push(`taskProofs[${index}].reviewRunId is invalid`);
      if (taskProof.executionRunId === taskProof.reviewRunId) problems.push(`taskProofs[${index}] requires independent runs`);
      validateArtifacts(root, taskProof.artifacts, `taskProofs[${index}].artifacts`, problems);
      }
    }
  } else {
    if (!RUN_ID.test(String(proof.executionRunId || ''))) problems.push('executionRunId must be a v2 run id');
    if (!RUN_ID.test(String(proof.reviewRunId || ''))) problems.push('reviewRunId must be a v2 run id');
    if (proof.executionRunId === proof.reviewRunId) problems.push('completion proof requires independent execution and review runs');
  }
  validateArtifacts(root, proof.artifacts, 'artifacts', problems);
  validateWaivers(proof.waivers, proof.artifacts, 'waivers', problems);
  if (!String(proof.target || '').trim()) problems.push('target is required');
  validateStringArray(proof.evidence, 'evidence', problems);
  validateStringArray(proof.context, 'context', problems);
  if (typeof proof.path !== 'string') problems.push('path must be a string');
  if (!isIsoDate(proof.createdAt)) problems.push('createdAt must be an ISO timestamp');
  return problems;
}

export function validateHandoffV2Contract(input) {
  const problems = [];
  if (!isObject(input)) return ['handoff must be an object'];
  rejectUnknownProperties(input, 'handoff', HANDOFF_V2_FIELDS, problems);
  rejectUnknownProperties(input.agent, 'agent', new Set(['type', 'skill']), problems);
  if (input.handoffVersion !== 2) problems.push('handoffVersion must be 2');
  if (!RUN_ID.test(String(input.runId || ''))) problems.push('runId must be a v2 run id');
  if (!String(input.changeId || '').trim()) problems.push('changeId is required');
  if (!STAGES.has(input.stage)) problems.push(`invalid stage ${input.stage}`);
  if (!String(input.behavior || '').trim()) problems.push('behavior is required');
  if (!ROLES.has(input.role)) problems.push(`invalid role ${input.role}`);
  if (input.role === 'check' && !RUN_ID.test(String(input.parentRunId || ''))) problems.push('check requires parentRunId');
  if (input.role === 'execute' && input.parentRunId !== null) problems.push('execute requires parentRunId=null');
  validateProducer({ agentType: input.agent?.type, skill: input.agent?.skill }, 'agent', problems);
  if (STAGES.has(input.stage) && ROLES.has(input.role) && String(input.behavior || '').trim()) {
    try {
      const expectedAgent = agentForV2Handoff(input.stage, input.behavior, input.role);
      if (input.agent?.type !== expectedAgent.type || input.agent?.skill !== expectedAgent.skill) {
        problems.push(`agent must be ${expectedAgent.type} with skill ${expectedAgent.skill}`);
      }
    } catch (error) {
      problems.push(error.message);
    }
  }
  problems.push(...validateTecpc(input.tecpc, { allowEmpty: true }));
  if (!Array.isArray(input.inputRefs) || input.inputRefs.some((ref) => typeof ref !== 'string' || !ref.trim())) {
    problems.push('inputRefs must be a string array');
  }
  validateDigestMap(input.inputDigests, 'inputDigests', problems);
  for (const ref of input.inputRefs || []) {
    if (!(ref in (input.inputDigests || {}))) problems.push(`inputDigests is missing ${ref}`);
  }
  validateRubricIds(input.rubricIds, 'rubricIds', problems, { required: input.role === 'check' });
  if (input.role === 'execute' && Array.isArray(input.rubricIds) && input.rubricIds.length !== 0) {
    problems.push('execute handoff must have an empty rubricIds array');
  }
  if (!isIsoDate(input.createdAt)) problems.push('createdAt must be an ISO timestamp');
  return problems;
}
