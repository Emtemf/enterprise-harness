import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  projectContractAssessmentPath,
  readProjectContractAssessment,
  validateProjectContractAssessment,
} from './clarify-assessments.mjs';
import { readDecisionEvents } from './decision-ledger.mjs';
import { statePathFor, validateV6State } from './change-state.mjs';
import {
  assertNoSymlinkComponents,
  assertSafeId,
  isSafeId,
  isSafeRelativePath,
  pathIsWithin,
  resolveWithin,
} from '../lib/safe-paths.mjs';
import { sha256Artifact } from '../lib/result-contract.mjs';
import { instructionLoadStatus } from '../lib/instruction-load-observations.mjs';
import { atomicWriteJson, withChangeTransaction, withFileLock } from '../lib/state-store.mjs';

const DIGEST = /^[a-f0-9]{64}$/u;
const PROPOSAL_FIELDS = new Set([
  'proposalVersion', 'type', 'proposalId', 'changeId', 'targetPath', 'operation',
  'expectedDigest', 'resultContent', 'durability', 'preferenceBasis', 'rationale',
  'resolves', 'sourceDecisionIds', 'inputDigests', 'createdAt',
]);
const OPERATIONS = new Set(['create', 'append', 'replace-managed-block']);
const DURABILITY = new Set(['project-stable', 'claude-project']);
const BASES = new Set(['explicit-team-rule', 'repeated-correction', 'approved-baseline']);
const MANAGED_START = '<!-- enterprise-harness:start -->';
const MANAGED_END = '<!-- enterprise-harness:end -->';

function failure(code, message) {
  return new Error(`${code}: ${message}`);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validDate(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function assertChangeId(changeId) {
  try { return assertSafeId(changeId, 'changeId'); } catch (error) {
    throw failure('EH-PATH-001', error.message);
  }
}

function changeRoot(root, changeId) {
  return resolveWithin(root, `harness/changes/${changeId}`, 'change root');
}

function resolveChangeArtifact(root, changeId, relativePath, label, { createParent = false } = {}) {
  try {
    const base = changeRoot(root, changeId);
    let target = resolveWithin(root, relativePath, label);
    if (!pathIsWithin(target, base)) throw new Error(`${label} escapes change root`);
    if (createParent) fs.mkdirSync(path.dirname(target), { recursive: true });
    target = resolveWithin(root, relativePath, label);
    if (!pathIsWithin(target, base)) throw new Error(`${label} escapes change root`);
    assertNoSymlinkComponents(base, target, label);
    return target;
  } catch (error) {
    throw failure('EH-PATH-001', error.message);
  }
}

function resolveInstructionTarget(root, relativePath) {
  try {
    const target = resolveWithin(root, relativePath, 'project instruction target');
    assertNoSymlinkComponents(root, target, 'project instruction target');
    return target;
  } catch (error) {
    throw failure('EH-PATH-001', error.message);
  }
}

function allowedTarget(value) {
  return value === 'AGENTS.md'
    || value === 'CLAUDE.md'
    || value === '.claude/CLAUDE.md'
    || /^\.claude\/rules\/[A-Za-z0-9][A-Za-z0-9._-]*\.md$/u.test(value);
}

function assertActiveClarify(root, changeId) {
  const target = statePathFor(root, changeId);
  if (!fs.existsSync(target)) throw failure('EH-PROJECT-CONTRACT-PROPOSAL-162', 'missing active State v6');
  let state;
  try { state = JSON.parse(fs.readFileSync(target, 'utf-8')); } catch (error) {
    throw failure('EH-PROJECT-CONTRACT-PROPOSAL-162', `invalid state JSON: ${error.message}`);
  }
  const problems = validateV6State(state, changeId);
  if (problems.length || state.lifecycle !== 'active' || state.stage !== 'clarify') {
    throw failure('EH-PROJECT-CONTRACT-PROPOSAL-162', `change must be active v6 Clarify: ${problems.join('; ') || `${state.lifecycle}/${state.stage}`}`);
  }
}

export function projectContractProposalPath(changeId, proposalId) {
  assertChangeId(changeId);
  try { assertSafeId(proposalId, 'proposalId'); } catch (error) {
    throw failure('EH-PATH-001', error.message);
  }
  return `harness/changes/${changeId}/evidence/project-contract/proposals/${proposalId}.json`;
}

export function projectContractApplicationPath(changeId, proposalId) {
  assertChangeId(changeId);
  try { assertSafeId(proposalId, 'proposalId'); } catch (error) {
    throw failure('EH-PATH-001', error.message);
  }
  return `harness/changes/${changeId}/evidence/project-contract/applications/${proposalId}.json`;
}

function staleInputs(root, inputDigests, problems, ignored = new Set()) {
  if (!isObject(inputDigests) || Object.keys(inputDigests).length === 0) {
    problems.push('inputDigests must be a non-empty object');
    return;
  }
  for (const [ref, digest] of Object.entries(inputDigests)) {
    if (!isSafeRelativePath(ref) || ref.includes(':') || !DIGEST.test(String(digest || ''))) {
      problems.push(`invalid input digest binding ${ref}`);
      continue;
    }
    if (ignored.has(ref)) continue;
    try {
      const target = resolveWithin(root, ref, 'proposal input');
      assertNoSymlinkComponents(root, target, 'proposal input');
      if (!fs.existsSync(target) || !fs.statSync(target).isFile()) problems.push(`proposal input is missing: ${ref}`);
      else if (sha256Artifact(root, ref) !== digest) problems.push(`proposal input is stale: ${ref}`);
    } catch (error) {
      problems.push(`proposal input is unsafe: ${ref}: ${error.message}`);
    }
  }
}

function managedParts(content) {
  const start = content.indexOf(MANAGED_START);
  const end = content.indexOf(MANAGED_END);
  if (start < 0 || end < start || content.indexOf(MANAGED_START, start + 1) >= 0
      || content.indexOf(MANAGED_END, end + 1) >= 0) return null;
  return {
    prefix: content.slice(0, start),
    suffix: content.slice(end + MANAGED_END.length),
  };
}

function operationProblems(root, proposal) {
  const problems = [];
  const target = resolveInstructionTarget(root, proposal.targetPath);
  const exists = fs.existsSync(target);
  const current = exists ? fs.readFileSync(target, 'utf-8') : null;
  const currentDigest = exists ? sha256(Buffer.from(current)) : null;
  const resultDigest = sha256(Buffer.from(proposal.resultContent || ''));
  if (proposal.operation === 'create') {
    if (proposal.expectedDigest !== null) problems.push('create requires expectedDigest=null');
    if (exists && currentDigest !== resultDigest) problems.push('create target already exists with different content');
  } else {
    if (!exists) problems.push(`${proposal.operation} requires an existing target`);
    if (!DIGEST.test(String(proposal.expectedDigest || ''))) problems.push(`${proposal.operation} requires expectedDigest`);
    else if (exists && proposal.expectedDigest !== currentDigest && currentDigest !== resultDigest) {
      problems.push(`target digest changed: expected ${proposal.expectedDigest}, got ${currentDigest}`);
    }
  }
  if (proposal.operation === 'append' && exists && currentDigest !== resultDigest) {
    if (!proposal.resultContent.startsWith(current) || proposal.resultContent.length <= current.length) {
      problems.push('append resultContent must preserve every existing byte and add a non-empty suffix');
    }
  }
  if (proposal.operation === 'replace-managed-block' && exists && currentDigest !== resultDigest) {
    const before = managedParts(current);
    const after = managedParts(proposal.resultContent);
    if (!before || !after || before.prefix !== after.prefix || before.suffix !== after.suffix) {
      problems.push('replace-managed-block may change only the unique Enterprise Harness managed block');
    }
  }
  return { problems, target, exists, currentDigest, resultDigest };
}

export function validateProjectContractProposal(root, changeId, proposal, { applied = false } = {}) {
  assertChangeId(changeId);
  const problems = [];
  if (!isObject(proposal)) return ['proposal must be an object'];
  for (const field of Object.keys(proposal)) {
    if (!PROPOSAL_FIELDS.has(field)) problems.push(`proposal has unknown property ${field}`);
  }
  if (proposal.proposalVersion !== 1) problems.push('proposalVersion must be 1');
  if (proposal.type !== 'project-contract-proposal') problems.push('type must be project-contract-proposal');
  if (!isSafeId(proposal.proposalId)) problems.push('proposalId must be a safe identifier');
  if (proposal.changeId !== changeId) problems.push(`changeId must be ${changeId}`);
  if (!allowedTarget(proposal.targetPath)) problems.push('targetPath is not an allowed project instruction path');
  if (!OPERATIONS.has(proposal.operation)) problems.push('operation is invalid');
  if (!DURABILITY.has(proposal.durability)) problems.push('durability is invalid');
  if (!BASES.has(proposal.preferenceBasis)) problems.push('preferenceBasis is invalid');
  if (proposal.durability === 'project-stable' && proposal.targetPath !== 'AGENTS.md') {
    problems.push('project-stable rules must target AGENTS.md');
  }
  if (proposal.durability === 'claude-project' && proposal.targetPath === 'AGENTS.md') {
    problems.push('claude-project rules must target CLAUDE.md or .claude/rules');
  }
  if (typeof proposal.resultContent !== 'string' || !proposal.resultContent.endsWith('\n')) {
    problems.push('resultContent must be non-empty UTF-8 text ending with newline');
  }
  if ((proposal.targetPath === 'CLAUDE.md' || proposal.targetPath === '.claude/CLAUDE.md'
      || String(proposal.targetPath || '').startsWith('.claude/rules/'))
      && String(proposal.resultContent || '').split('\n').length - 1 > 200) {
    problems.push('Claude project instruction files must not exceed 200 lines');
  }
  if (typeof proposal.rationale !== 'string' || !proposal.rationale.trim()) problems.push('rationale is required');
  for (const [field, validator] of [['resolves', (item) => typeof item === 'string' && item.trim()], ['sourceDecisionIds', isSafeId]]) {
    const value = proposal[field];
    if (!Array.isArray(value) || value.length === 0 || value.some((item) => !validator(item))
        || new Set(value).size !== value.length) problems.push(`${field} must be a unique non-empty array`);
  }
  if (!validDate(proposal.createdAt)) problems.push('createdAt must be an RFC3339 date-time');
  const assessmentRef = projectContractAssessmentPath(changeId);
  staleInputs(
    root,
    proposal.inputDigests,
    problems,
    applied ? new Set([assessmentRef, proposal.targetPath]) : new Set(),
  );

  let assessment;
  try { assessment = readProjectContractAssessment(root, changeId); } catch (error) {
    if (applied) {
      try {
        const target = resolveChangeArtifact(root, changeId, assessmentRef, 'project contract assessment');
        assessment = JSON.parse(fs.readFileSync(target, 'utf-8'));
      } catch { /* retain the original diagnostic below */ }
    }
  }
  if (!assessment) {
    try { readProjectContractAssessment(root, changeId); } catch (error) {
      problems.push(`project contract assessment is invalid: ${error.message}`);
    }
  }
  if (!applied && assessment && proposal.inputDigests?.[assessmentRef] !== sha256Artifact(root, assessmentRef)) {
    problems.push(`inputDigests must bind current ${assessmentRef}`);
  }
  if (assessment && !applied) {
    if (assessment.status !== 'proposal-required') problems.push('assessment status must be proposal-required');
    if (assessment.conflicts.length > 0) problems.push('assessment conflicts must be disposed before proposing writes');
    const gaps = new Set(assessment.gaps.map(({ section }) => section));
    if (proposal.resolves.some((section) => !gaps.has(section))) problems.push('resolves must name current assessment gaps');
    if (assessment.decisionEventId && !proposal.sourceDecisionIds.includes(assessment.decisionEventId)) {
      problems.push('sourceDecisionIds must include the proposal-required disposition event');
    }
  }
  let events = [];
  try { events = readDecisionEvents(root, changeId); } catch (error) { problems.push(`decision ledger is invalid: ${error.message}`); }
  for (const eventId of proposal.sourceDecisionIds || []) {
    if (!events.some((event) => event.eventId === eventId)) problems.push(`source decision is missing: ${eventId}`);
  }
  if (allowedTarget(proposal.targetPath) && OPERATIONS.has(proposal.operation)) {
    try { problems.push(...operationProblems(root, proposal).problems); } catch (error) { problems.push(error.message); }
  }
  return problems;
}

function readJson(root, changeId, relativePath, label) {
  const target = resolveChangeArtifact(root, changeId, relativePath, label);
  if (!fs.existsSync(target)) throw failure('EH-PROJECT-CONTRACT-PROPOSAL-162', `missing ${relativePath}`);
  try { return JSON.parse(fs.readFileSync(target, 'utf-8')); } catch (error) {
    throw failure('EH-PROJECT-CONTRACT-PROPOSAL-162', `invalid JSON at ${relativePath}: ${error.message}`);
  }
}

function immutableJson(target, value) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const bytes = `${JSON.stringify(value, null, 2)}\n`;
  if (fs.existsSync(target)) {
    if (fs.readFileSync(target, 'utf-8') === bytes) return false;
    throw failure('EH-PROJECT-CONTRACT-PROPOSAL-162', `immutable artifact already exists at ${target}`);
  }
  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, bytes, { encoding: 'utf-8', mode: 0o600, flag: 'wx' });
    fs.linkSync(temporary, target);
  } finally { fs.rmSync(temporary, { force: true }); }
  return true;
}

export function persistProjectContractProposal(root, changeId, draftRef) {
  assertChangeId(changeId);
  assertActiveClarify(root, changeId);
  if (!isSafeRelativePath(draftRef)) throw failure('EH-PATH-001', 'draft-ref must be repository-relative');
  const draft = readJson(root, changeId, draftRef, 'project contract proposal draft');
  const problems = validateProjectContractProposal(root, changeId, draft);
  if (problems.length) throw failure('EH-PROJECT-CONTRACT-PROPOSAL-162', problems.join('; '));
  const relativePath = projectContractProposalPath(changeId, draft.proposalId);
  const target = resolveChangeArtifact(root, changeId, relativePath, 'project contract proposal', { createParent: true });
  return withChangeTransaction(root, changeId, () => withFileLock(target, () => {
    const currentProblems = validateProjectContractProposal(root, changeId, draft);
    if (currentProblems.length) throw failure('EH-PROJECT-CONTRACT-PROPOSAL-162', currentProblems.join('; '));
    const created = immutableJson(target, draft);
    return Object.freeze({ path: relativePath, digest: sha256Artifact(root, relativePath), created });
  }));
}

export function readProjectContractProposal(root, changeId, proposalRef) {
  const proposal = readJson(root, changeId, proposalRef, 'project contract proposal');
  const canonical = projectContractProposalPath(changeId, proposal.proposalId);
  if (proposalRef !== canonical) throw failure('EH-PROJECT-CONTRACT-PROPOSAL-162', `proposal-ref must be ${canonical}`);
  const applicationExists = fs.existsSync(resolveChangeArtifact(
    root,
    changeId,
    projectContractApplicationPath(changeId, proposal.proposalId),
    'project contract application',
  ));
  let targetAlreadyMatches = false;
  if (allowedTarget(proposal.targetPath) && typeof proposal.resultContent === 'string') {
    const target = resolveInstructionTarget(root, proposal.targetPath);
    targetAlreadyMatches = fs.existsSync(target)
      && sha256(fs.readFileSync(target)) === sha256(Buffer.from(proposal.resultContent));
  }
  // A crash can occur after the atomic instruction write but before the receipt.
  // Exact content equality with the immutable proposal is sufficient to resume;
  // approval is still checked independently before apply completes the receipt.
  const applied = applicationExists || targetAlreadyMatches;
  const problems = validateProjectContractProposal(root, changeId, proposal, { applied });
  if (problems.length) throw failure('EH-PROJECT-CONTRACT-PROPOSAL-162', problems.join('; '));
  return Object.freeze(structuredClone(proposal));
}

function approvalFor(root, changeId, proposalRef, proposalDigest) {
  const approvals = readDecisionEvents(root, changeId).filter((event) => (
    event.decisionType === 'project-contract-proposal-approval'
      && event.targetRef === proposalRef
      && event.selectedOption === 'approve'
      && event.actor.type === 'user'
      && event.evidenceRefs.includes(proposalRef)
      && event.inputDigests?.[proposalRef] === proposalDigest
  ));
  if (approvals.length !== 1) {
    throw failure('EH-PROJECT-CONTRACT-APPROVAL-163', 'exactly one fresh user approval must bind the proposal digest');
  }
  return approvals[0];
}

function atomicWriteText(target, content) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = path.join(path.dirname(target), `.${path.basename(target)}.${process.pid}.${randomUUID()}.tmp`);
  try {
    fs.writeFileSync(temporary, content, { encoding: 'utf-8', mode: 0o644 });
    try { fs.renameSync(temporary, target); } catch (error) {
      if (['EPERM', 'EEXIST'].includes(error.code)) { fs.rmSync(target, { force: true }); fs.renameSync(temporary, target); }
      else throw error;
    }
  } finally { fs.rmSync(temporary, { force: true }); }
}

function nextAssessment(root, changeId, assessment, proposal, proposalRef, applicationRef, afterDigest) {
  const remaining = assessment.gaps.filter(({ section }) => !proposal.resolves.includes(section));
  const files = assessment.files.filter((file) => file.path !== proposal.targetPath);
  files.push({ path: proposal.targetPath, digest: afterDigest, scope: 'project', ownership: 'project' });
  const inputDigests = { ...assessment.inputDigests };
  inputDigests[proposal.targetPath] = afterDigest;
  inputDigests[proposalRef] = sha256Artifact(root, proposalRef);
  inputDigests[applicationRef] = sha256Artifact(root, applicationRef);
  return {
    ...assessment,
    files,
    gaps: remaining,
    status: remaining.length ? 'proposal-required' : 'use-existing',
    decisionEventId: remaining.length ? assessment.decisionEventId : null,
    proposalRef: remaining.length ? null : proposalRef,
    inputDigests,
    updatedAt: new Date().toISOString(),
  };
}

export function applyProjectContractProposal(root, changeId, proposalRef) {
  assertChangeId(changeId);
  assertActiveClarify(root, changeId);
  let proposal;
  try {
    proposal = readProjectContractProposal(root, changeId, proposalRef);
  } catch (error) {
    if (String(error?.message || '').startsWith('EH-PROJECT-CONTRACT-PROPOSAL-162:')) {
      throw failure('EH-PROJECT-CONTRACT-APPLY-164', error.message.replace(/^EH-PROJECT-CONTRACT-PROPOSAL-162:\s*/u, ''));
    }
    throw error;
  }
  const proposalDigest = sha256Artifact(root, proposalRef);
  approvalFor(root, changeId, proposalRef, proposalDigest);
  const applicationRef = projectContractApplicationPath(changeId, proposal.proposalId);
  const applicationTarget = resolveChangeArtifact(root, changeId, applicationRef, 'project contract application', { createParent: true });
  const instructionTarget = resolveInstructionTarget(root, proposal.targetPath);
  const assessmentRef = projectContractAssessmentPath(changeId);
  const assessmentTarget = resolveChangeArtifact(root, changeId, assessmentRef, 'project contract assessment');
  return withChangeTransaction(root, changeId, () => withFileLock(instructionTarget, () => withFileLock(assessmentTarget, () => {
    const operation = operationProblems(root, proposal);
    if (operation.problems.length) throw failure('EH-PROJECT-CONTRACT-APPLY-164', operation.problems.join('; '));
    let assessment;
    try { assessment = readProjectContractAssessment(root, changeId); } catch {
      try { assessment = JSON.parse(fs.readFileSync(assessmentTarget, 'utf-8')); } catch (error) {
        throw failure('EH-PROJECT-CONTRACT-APPLY-164', `cannot recover assessment: ${error.message}`);
      }
    }
    let priorReceipt = null;
    if (fs.existsSync(applicationTarget)) {
      try { priorReceipt = JSON.parse(fs.readFileSync(applicationTarget, 'utf-8')); } catch (error) {
        throw failure('EH-PROJECT-CONTRACT-APPLY-164', `invalid application receipt: ${error.message}`);
      }
      if (priorReceipt.proposalDigest !== proposalDigest || priorReceipt.afterDigest !== operation.resultDigest
          || priorReceipt.targetPath !== proposal.targetPath || operation.currentDigest !== priorReceipt.afterDigest) {
        throw failure('EH-PROJECT-CONTRACT-APPLY-164', 'application receipt conflicts with proposal or target');
      }
      if (assessment.status === 'use-existing' && assessment.proposalRef === proposalRef) {
        return Object.freeze({ path: applicationRef, digest: sha256Artifact(root, applicationRef), targetPath: proposal.targetPath, afterDigest: priorReceipt.afterDigest, recovered: true });
      }
    }
    const recovered = operation.exists && operation.currentDigest === operation.resultDigest;
    if (assessment.status !== 'proposal-required') {
      throw failure('EH-PROJECT-CONTRACT-APPLY-164', `assessment status changed to ${assessment.status}`);
    }
    if (!recovered) {
      const currentProblems = validateProjectContractProposal(root, changeId, proposal);
      if (currentProblems.length) throw failure('EH-PROJECT-CONTRACT-APPLY-164', currentProblems.join('; '));
    }
    const approval = approvalFor(root, changeId, proposalRef, proposalDigest);
    if (!recovered) atomicWriteText(instructionTarget, proposal.resultContent);
    const afterDigest = sha256Artifact(root, proposal.targetPath);
    const receipt = {
      applicationVersion: 1,
      type: 'project-contract-application',
      changeId,
      proposalId: proposal.proposalId,
      proposalRef,
      proposalDigest,
      approvalEventId: approval.eventId,
      targetPath: proposal.targetPath,
      beforeDigest: proposal.expectedDigest,
      afterDigest,
      operation: proposal.operation,
      recovered,
      appliedAt: new Date().toISOString(),
    };
    if (!priorReceipt) immutableJson(applicationTarget, receipt);
    const updated = nextAssessment(root, changeId, assessment, proposal, proposalRef, applicationRef, afterDigest);
    const problems = validateProjectContractAssessment(root, changeId, updated);
    if (problems.length) throw failure('EH-PROJECT-CONTRACT-APPLY-164', problems.join('; '));
    atomicWriteJson(assessmentTarget, updated);
    return Object.freeze({ path: applicationRef, digest: sha256Artifact(root, applicationRef), targetPath: proposal.targetPath, afterDigest, recovered });
  })));
}

export function projectContractStatus(root, changeId) {
  assertChangeId(changeId);
  const assessment = readProjectContractAssessment(root, changeId);
  const applicationsDirRef = `harness/changes/${changeId}/evidence/project-contract/applications`;
  const applicationsDir = resolveChangeArtifact(root, changeId, applicationsDirRef, 'project contract applications');
  const applications = fs.existsSync(applicationsDir)
    ? fs.readdirSync(applicationsDir).filter((name) => /^[A-Za-z0-9][A-Za-z0-9._-]*\.json$/u.test(name)).sort()
      .map((name) => {
        const ref = `${applicationsDirRef}/${name}`;
        return { ref, ...readJson(root, changeId, ref, 'project contract application') };
      })
    : [];
  const loads = assessment.files.map((file) => instructionLoadStatus(root, file.path, file.digest));
  return Object.freeze({
    changeId,
    status: assessment.status,
    gaps: assessment.gaps,
    proposalRef: assessment.proposalRef,
    applications,
    instructionLoads: loads,
  });
}
