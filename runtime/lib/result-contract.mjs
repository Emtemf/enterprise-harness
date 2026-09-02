import crypto from 'node:crypto';
import fs from 'node:fs';
import { agentForV2Handoff } from '../core/handoff-agent.mjs';
import { isSafeId, isSafeRelativePath, resolveWithin } from './safe-paths.mjs';
import { isWaiverFresh, validateWaiver } from './waiver.mjs';
import { stageContractArtifactPaths } from './stage-contract.mjs';

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
  'proofVersion', 'type', 'changeId', 'stage', 'executionRunId', 'reviewRunId', 'stageProofs', 'taskProofs', 'waivers',
  'artifacts', 'reviewedArtifacts', 'decisionSnapshotRef', 'assertions', 'tecpc',
  'target', 'evidence', 'context', 'path', 'createdAt',
]);
const STAGE_PROOF_FIELDS = new Set(['kind', 'executionRunId', 'reviewRunId', 'artifacts']);
const DESIGN_STAGE_PROOF_KINDS = new Set(['architecture', 'test-design']);
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
const DECISION_EVENT_FIELDS = new Set([
  'eventVersion', 'type', 'eventId', 'changeId', 'stage', 'actor', 'decisionType', 'targetRef',
  'questionId', 'options', 'recommendedOption', 'selectedOption', 'publicRationale', 'evidenceRefs',
  'inputDigests', 'recordedAt',
]);
const DECISION_ACTOR_FIELDS = new Set(['type', 'id']);
const DECISION_ACTOR_TYPES = new Set(['user', 'main', 'runtime']);
const DECISION_TYPES = new Set([
  'clarify-answer', 'lane-applicability', 'debt-disposition', 'project-contract-disposition',
  'project-contract-proposal-approval', 'scope-confirmation', 'classification-route',
]);
const CLARIFY_SNAPSHOT_FIELDS = new Set([
  'snapshotVersion', 'type', 'changeId', 'eventIds', 'ledgerRef', 'prefixBytes', 'prefixDigest',
  'artifacts', 'sealedAt',
]);
const SNAPSHOT_LEDGER_REF_FIELDS = new Set(['path', 'digest']);
const SNAPSHOT_EVENT_ARTIFACT_FIELDS = new Set(['eventId', 'digest']);
const CLARIFY_ASSERTION_IDS = Object.freeze([
  'research-complete',
  'decisions-durable',
  'technical-debt-disposed',
  'project-contract-disposed',
  'requirements-ready',
  'classification-ready',
  'scope-confirmed',
]);

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

function isSchemaDateTime(value) {
  if (typeof value !== 'string') return false;
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:[Zz]|[+-](\d{2}):(\d{2}))$/u,
  );
  if (!match) return false;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, offsetHourText, offsetMinuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1
    && month <= 12
    && day >= 1
    && day <= daysInMonth[month - 1]
    && Number(hourText) <= 23
    && Number(minuteText) <= 59
    && Number(secondText) <= 60
    && (offsetHourText === undefined || Number(offsetHourText) <= 23)
    && (offsetMinuteText === undefined || Number(offsetMinuteText) <= 59);
}

function isSafeArtifactReference(value, { allowSourceLocator = false } = {}) {
  if (typeof value !== 'string' || !value) return false;
  let artifactPath = value;
  if (allowSourceLocator) {
    const locator = value.match(/^(.*):([1-9]\d*)$/u);
    if (locator) artifactPath = locator[1];
  }
  return !artifactPath.includes(':') && isSafeRelativePath(artifactPath);
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

export function validateDecisionEvent(changeId, event) {
  const problems = [];
  if (!isObject(event)) return ['decision event must be an object'];
  rejectUnknownProperties(event, 'decision event', DECISION_EVENT_FIELDS, problems);
  if (event.eventVersion !== 1) problems.push('eventVersion must be 1');
  if (event.type !== 'decision-event') problems.push('type must be decision-event');
  if (!isSafeId(event.eventId)) problems.push('eventId must be a safe identifier');
  if (!isSafeId(event.changeId)) problems.push('changeId must be a safe identifier');
  if (event.changeId !== changeId) problems.push(`changeId must be ${changeId}`);
  if (event.stage !== 'clarify') problems.push('stage must be clarify');

  if (!isObject(event.actor)) {
    problems.push('actor must be an object');
  } else {
    rejectUnknownProperties(event.actor, 'actor', DECISION_ACTOR_FIELDS, problems);
    if (!DECISION_ACTOR_TYPES.has(event.actor.type)) problems.push(`invalid actor type ${event.actor.type}`);
    if (!isSafeId(event.actor.id)) problems.push('actor.id must be a safe identifier');
  }
  if (!DECISION_TYPES.has(event.decisionType)) problems.push(`invalid decisionType ${event.decisionType}`);
  if (!isSafeArtifactReference(event.targetRef, { allowSourceLocator: true })) {
    problems.push('targetRef must be a safe artifact reference');
  }
  if (!isSafeId(event.questionId)) problems.push('questionId must be a safe identifier');

  if (!Array.isArray(event.options) || event.options.length < 2 || event.options.length > 5) {
    problems.push('options must contain between 2 and 5 entries');
  } else {
    if (event.options.some((option) => !isSafeId(option))) problems.push('options must contain safe identifiers');
    if (new Set(event.options).size !== event.options.length) problems.push('options must not contain duplicates');
  }
  if (Array.isArray(event.options) && event.options.length === 5
      && (event.decisionType !== 'clarify-answer' || event.selectedOption !== 'other')) {
    problems.push('five options are reserved for a redacted clarify-answer Other event');
  }
  if (!isSafeId(event.recommendedOption)) problems.push('recommendedOption must be a safe identifier');
  if (!isSafeId(event.selectedOption)) problems.push('selectedOption must be a safe identifier');
  if (!Array.isArray(event.options) || !event.options.includes(event.recommendedOption)) {
    problems.push('recommendedOption must be present in options');
  }
  if (!Array.isArray(event.options) || !event.options.includes(event.selectedOption)) {
    problems.push('selectedOption must be present in options');
  }
  if (typeof event.publicRationale !== 'string' || !event.publicRationale.trim()) {
    problems.push('publicRationale is required');
  }
  if (!Array.isArray(event.evidenceRefs) || event.evidenceRefs.length === 0
      || event.evidenceRefs.some((ref) => typeof ref !== 'string' || !ref.trim())) {
    problems.push('evidenceRefs must be a non-empty string array');
  } else if (event.evidenceRefs.some((ref) => !isSafeArtifactReference(ref, { allowSourceLocator: true }))) {
    problems.push('evidenceRefs must contain only safe artifact references');
  }
  validateDigestMap(event.inputDigests, 'inputDigests', problems);
  if (isObject(event.inputDigests) && Object.keys(event.inputDigests).length === 0) {
    problems.push('inputDigests must not be empty');
  }
  for (const ref of Object.keys(isObject(event.inputDigests) ? event.inputDigests : {})) {
    if (!isSafeArtifactReference(ref)) problems.push(`inputDigests has unsafe artifact reference ${ref}`);
  }
  if (!isSchemaDateTime(event.recordedAt)) problems.push('recordedAt must be an RFC3339 date-time');
  return problems;
}

export function validateClarifyDecisionSnapshot(changeId, snapshot) {
  const problems = [];
  if (!isObject(snapshot)) return ['clarify decision snapshot must be an object'];
  rejectUnknownProperties(snapshot, 'clarify decision snapshot', CLARIFY_SNAPSHOT_FIELDS, problems);
  if (snapshot.snapshotVersion !== 1) problems.push('snapshotVersion must be 1');
  if (snapshot.type !== 'clarify-decision-snapshot') problems.push('type must be clarify-decision-snapshot');
  if (!isSafeId(snapshot.changeId)) problems.push('changeId must be a safe identifier');
  if (snapshot.changeId !== changeId) problems.push(`changeId must be ${changeId}`);
  if (!Array.isArray(snapshot.eventIds) || snapshot.eventIds.length === 0) {
    problems.push('eventIds must be a non-empty array');
  } else {
    if (snapshot.eventIds.some((eventId) => !isSafeId(eventId))) problems.push('eventIds must contain safe identifiers');
    if (new Set(snapshot.eventIds).size !== snapshot.eventIds.length) problems.push('eventIds must not contain duplicates');
  }

  if (!isObject(snapshot.ledgerRef)) {
    problems.push('ledgerRef must be an object');
  } else {
    rejectUnknownProperties(snapshot.ledgerRef, 'ledgerRef', SNAPSHOT_LEDGER_REF_FIELDS, problems);
    if (typeof snapshot.ledgerRef.path !== 'string' || !snapshot.ledgerRef.path.trim()) {
      problems.push('ledgerRef.path is required');
    }
    if (!isDigest(snapshot.ledgerRef.digest)) problems.push('ledgerRef.digest must be a sha256 digest');
  }
  if (!Number.isInteger(snapshot.prefixBytes) || snapshot.prefixBytes < 1) {
    problems.push('prefixBytes must be a positive integer');
  }
  if (!isDigest(snapshot.prefixDigest)) problems.push('prefixDigest must be a sha256 digest');
  if (!Array.isArray(snapshot.artifacts) || snapshot.artifacts.length === 0) {
    problems.push('artifacts must be a non-empty array');
  } else {
    const artifactIds = [];
    for (const artifact of snapshot.artifacts) {
      if (!isObject(artifact)) {
        problems.push('artifacts entries must be objects');
        continue;
      }
      rejectUnknownProperties(artifact, 'snapshot artifact', SNAPSHOT_EVENT_ARTIFACT_FIELDS, problems);
      if (!isSafeId(artifact.eventId)) problems.push('snapshot artifact eventId must be a safe identifier');
      if (!isDigest(artifact.digest)) problems.push('snapshot artifact digest must be a sha256 digest');
      artifactIds.push(artifact.eventId);
    }
    if (new Set(artifactIds).size !== artifactIds.length) problems.push('artifacts must not contain duplicate eventIds');
    if (JSON.stringify(artifactIds) !== JSON.stringify(snapshot.eventIds)) {
      problems.push('artifacts must match eventIds in order');
    }
  }
  if (!isSchemaDateTime(snapshot.sealedAt)) problems.push('sealedAt must be an RFC3339 date-time');
  return problems;
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

function validateClarifyStageResult(root, result, problems) {
  const expectedArtifacts = stageContractArtifactPaths(result.changeId, 'clarify');
  const actualArtifacts = Array.isArray(result.artifacts)
    ? result.artifacts.map((artifact) => artifact?.path)
    : [];
  if (JSON.stringify(actualArtifacts) !== JSON.stringify(expectedArtifacts)) {
    problems.push(`Clarify artifacts must exactly bind ${expectedArtifacts.join(', ')}`);
  }
  const actualAssertions = Array.isArray(result.assertions)
    ? result.assertions.map((assertion) => assertion?.id)
    : [];
  if (JSON.stringify(actualAssertions) !== JSON.stringify(CLARIFY_ASSERTION_IDS)) {
    problems.push(`Clarify assertions must exactly contain ${CLARIFY_ASSERTION_IDS.join(', ')}`);
  }
  const artifactByPath = new Map((result.artifacts || []).map((artifact) => [artifact?.path, artifact]));
  for (const artifactPath of expectedArtifacts) {
    const artifact = artifactByPath.get(artifactPath);
    if (!artifact || result.inputDigests?.[artifactPath] !== artifact.digest) {
      problems.push(`Clarify inputDigests must bind the exact artifact digest for ${artifactPath}`);
    }
  }
  const boundReferences = new Set([
    ...actualArtifacts.filter((artifactPath) => typeof artifactPath === 'string'),
    ...Object.keys(isObject(result.inputDigests) ? result.inputDigests : {}),
  ]);
  for (const assertion of result.assertions || []) {
    for (const reference of assertion?.evidence || []) {
      if (!boundReferences.has(reference)) {
        problems.push(`assertion evidence must be a Clarify artifact or frozen input: ${reference}`);
      }
    }
  }
  if (result.tecpc?.correction !== null) problems.push('Clarify TECPC requires correction=null');
  if (typeof result.tecpc?.path !== 'string' || !result.tecpc.path.trim()) {
    problems.push('Clarify TECPC path must be non-empty');
  }
  for (const reference of [...(result.tecpc?.evidence || []), ...(result.tecpc?.context || [])]) {
    if (!boundReferences.has(reference)) {
      problems.push(`Clarify TECPC references must be artifacts or frozen inputs: ${reference}`);
    }
  }
  void root;
}

function sameArtifactBindings(left, right) {
  const normalized = (artifacts) => (artifacts || [])
    .map((artifact) => [artifact?.path, artifact?.digest])
    .sort(([leftPath], [rightPath]) => String(leftPath).localeCompare(String(rightPath)));
  return JSON.stringify(normalized(left)) === JSON.stringify(normalized(right));
}

function validateClarifyCompletionProof(root, proof, problems) {
  const expectedArtifacts = stageContractArtifactPaths(proof.changeId, 'clarify');
  const actualArtifacts = Array.isArray(proof.artifacts)
    ? proof.artifacts.map((artifact) => artifact?.path)
    : [];
  if (JSON.stringify(actualArtifacts) !== JSON.stringify(expectedArtifacts)) {
    problems.push(`Clarify proof artifacts must exactly bind ${expectedArtifacts.join(', ')}`);
  }
  validateArtifacts(root, proof.reviewedArtifacts, 'reviewedArtifacts', problems);
  if (!sameArtifactBindings(proof.artifacts, proof.reviewedArtifacts)) {
    problems.push('Clarify proof reviewedArtifacts must exactly match artifacts');
  }
  if (!isObject(proof.decisionSnapshotRef)) {
    problems.push('Clarify proof decisionSnapshotRef is required');
  } else {
    validateArtifacts(root, [proof.decisionSnapshotRef], 'decisionSnapshotRef', problems);
    const expectedSnapshotPath = expectedArtifacts[4];
    const artifact = (proof.artifacts || []).find(({ path: artifactPath }) => artifactPath === expectedSnapshotPath);
    if (proof.decisionSnapshotRef.path !== expectedSnapshotPath
        || proof.decisionSnapshotRef.digest !== artifact?.digest) {
      problems.push(`Clarify proof decisionSnapshotRef must bind ${expectedSnapshotPath}`);
    }
  }
  validateAssertions(proof.assertions, problems);
  const assertionIds = Array.isArray(proof.assertions)
    ? proof.assertions.map((assertion) => assertion?.id)
    : [];
  if (JSON.stringify(assertionIds) !== JSON.stringify(CLARIFY_ASSERTION_IDS)) {
    problems.push(`Clarify proof assertions must exactly contain ${CLARIFY_ASSERTION_IDS.join(', ')}`);
  }
  if (proof.assertions?.some((assertion) => assertion?.verdict !== 'pass')) {
    problems.push('Clarify proof requires every assertion to pass');
  }
  problems.push(...validateTecpc(proof.tecpc));
  if (proof.tecpc?.correction !== null) problems.push('Clarify proof TECPC requires correction=null');
  if (typeof proof.tecpc?.path !== 'string' || !proof.tecpc.path.trim()) {
    problems.push('Clarify proof TECPC path must be non-empty');
  }
  if (proof.target !== proof.tecpc?.target
      || JSON.stringify(proof.evidence) !== JSON.stringify(proof.tecpc?.evidence)
      || JSON.stringify(proof.context) !== JSON.stringify(proof.tecpc?.context)
      || proof.path !== proof.tecpc?.path) {
    problems.push('Clarify proof flattened TECPC fields must exactly match tecpc');
  }
  const evidenceBindings = new Set([
    ...(proof.artifacts || []).map((artifact) => artifact?.path),
    ...(proof.tecpc?.evidence || []),
    ...(proof.tecpc?.context || []),
  ]);
  for (const assertion of proof.assertions || []) {
    for (const reference of assertion?.evidence || []) {
      if (!evidenceBindings.has(reference)) {
        problems.push(`Clarify proof assertion evidence is unbound: ${reference}`);
      }
    }
  }
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
  if (result.stage === 'clarify') validateClarifyStageResult(root, result, problems);
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
  } else if (proof.stage === 'design') {
    if (!Array.isArray(proof.stageProofs) || proof.stageProofs.length !== 2) {
      problems.push('design completion proof requires exactly two stageProofs');
    } else {
      const kinds = new Set();
      for (const [index, stageProof] of proof.stageProofs.entries()) {
        if (!isObject(stageProof)) {
          problems.push(`stageProofs[${index}] must be an object`);
          continue;
        }
        rejectUnknownProperties(stageProof, `stageProofs[${index}]`, STAGE_PROOF_FIELDS, problems);
        for (const field of STAGE_PROOF_FIELDS) {
          if (!(field in stageProof)) problems.push(`stageProofs[${index}] is missing ${field}`);
        }
        if (!DESIGN_STAGE_PROOF_KINDS.has(stageProof.kind)) {
          problems.push(`stageProofs[${index}].kind must be architecture or test-design`);
        } else if (kinds.has(stageProof.kind)) {
          problems.push(`design completion proof has duplicate ${stageProof.kind} stageProof`);
        } else {
          kinds.add(stageProof.kind);
        }
        if (!RUN_ID.test(String(stageProof.executionRunId || ''))) {
          problems.push(`stageProofs[${index}].executionRunId is invalid`);
        }
        if (!RUN_ID.test(String(stageProof.reviewRunId || ''))) {
          problems.push(`stageProofs[${index}].reviewRunId is invalid`);
        }
        if (stageProof.executionRunId === stageProof.reviewRunId) {
          problems.push(`stageProofs[${index}] requires independent runs`);
        }
        validateArtifacts(root, stageProof.artifacts, `stageProofs[${index}].artifacts`, problems);
      }
      for (const kind of DESIGN_STAGE_PROOF_KINDS) {
        if (!kinds.has(kind)) problems.push(`design completion proof requires exactly one ${kind} stageProof`);
      }
      const expectedArtifactPath = {
        architecture: `harness/changes/${proof.changeId}/design.md`,
        'test-design': `harness/changes/${proof.changeId}/test-cases.md`,
      };
      for (const stageProof of proof.stageProofs) {
        if (!DESIGN_STAGE_PROOF_KINDS.has(stageProof?.kind)) continue;
        if (!Array.isArray(stageProof.artifacts)
            || stageProof.artifacts.length !== 1
            || stageProof.artifacts[0]?.path !== expectedArtifactPath[stageProof.kind]) {
          problems.push(`${stageProof.kind} stageProof must bind exactly ${expectedArtifactPath[stageProof.kind]}`);
        }
      }
      const flattened = proof.stageProofs.flatMap((stageProof) => stageProof?.artifacts || []);
      if (!sameArtifactBindings(flattened, proof.artifacts)) {
        problems.push('design completion proof artifacts must exactly flatten stageProofs artifacts');
      }
    }
    for (const field of ['executionRunId', 'reviewRunId', 'taskProofs']) {
      if (Object.hasOwn(proof, field)) problems.push(`design completion proof must not contain top-level ${field}`);
    }
  } else {
    if (!RUN_ID.test(String(proof.executionRunId || ''))) problems.push('executionRunId must be a v2 run id');
    if (!RUN_ID.test(String(proof.reviewRunId || ''))) problems.push('reviewRunId must be a v2 run id');
    if (proof.executionRunId === proof.reviewRunId) problems.push('completion proof requires independent execution and review runs');
    if (Object.hasOwn(proof, 'stageProofs')) problems.push('stageProofs is only valid for a Design completion proof');
    if (Object.hasOwn(proof, 'taskProofs')) problems.push('taskProofs is only valid for an Implement completion proof');
  }
  if (proof.stage === 'implement') {
    for (const field of ['executionRunId', 'reviewRunId', 'stageProofs']) {
      if (Object.hasOwn(proof, field)) problems.push(`implement completion proof must not contain ${field}`);
    }
  }
  validateArtifacts(root, proof.artifacts, 'artifacts', problems);
  validateWaivers(proof.waivers, proof.artifacts, 'waivers', problems);
  if (!String(proof.target || '').trim()) problems.push('target is required');
  validateStringArray(proof.evidence, 'evidence', problems);
  validateStringArray(proof.context, 'context', problems);
  if (typeof proof.path !== 'string') problems.push('path must be a string');
  if (!isIsoDate(proof.createdAt)) problems.push('createdAt must be an ISO timestamp');
  if (proof.stage === 'clarify') {
    validateClarifyCompletionProof(root, proof, problems);
  } else {
    for (const field of ['reviewedArtifacts', 'decisionSnapshotRef', 'assertions', 'tecpc']) {
      if (Object.hasOwn(proof, field)) problems.push(`${field} is only valid for a Clarify completion proof`);
    }
  }
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
