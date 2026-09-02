import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { writeProjectContractAssessment } from '../core/clarify-assessments.mjs';
import { appendDecisionEvent } from '../core/decision-ledger.mjs';
import {
  applyProjectContractProposal,
  persistProjectContractProposal,
  projectContractApplicationPath,
  projectContractProposalPath,
  projectContractStatus,
} from '../core/project-contract.mjs';

const mode = process.argv[2] || 'verify';
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);
const sourceRoot = fileURLToPath(new URL('../../', import.meta.url));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'enterprise-harness-project-contract-'));
const changeId = 'contract-safe-apply';
const changeRoot = path.join(root, 'harness', 'changes', changeId);
const sha = (value) => createHash('sha256').update(value).digest('hex');
const artifactDigest = (ref) => sha(fs.readFileSync(path.join(root, ref)));

function write(ref, content) {
  const target = path.join(root, ref);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf-8');
}

function event(overrides) {
  return {
    eventVersion: 1,
    type: 'decision-event',
    eventId: 'D-project-contract',
    changeId,
    stage: 'clarify',
    actor: { type: 'main', id: 'main-agent' },
    decisionType: 'project-contract-disposition',
    targetRef: `harness/changes/${changeId}/project-contract-assessment.json`,
    questionId: 'Q-project-contract',
    options: ['proposal-required', 'deferred'],
    recommendedOption: 'proposal-required',
    selectedOption: 'proposal-required',
    publicRationale: 'Current project contract has a stable baseline gap.',
    evidenceRefs: [`harness/changes/${changeId}/requirements.md`],
    inputDigests: { [`harness/changes/${changeId}/requirements.md`]: artifactDigest(`harness/changes/${changeId}/requirements.md`) },
    recordedAt: '2026-09-02T00:00:00.000Z',
    ...overrides,
  };
}

try {
  spawnSync('git', ['init', '-q'], { cwd: root, shell: false });
  fs.mkdirSync(changeRoot, { recursive: true });
  write(`harness/changes/${changeId}/state.json`, `${JSON.stringify({
    schemaVersion: 6,
    revision: 1,
    changeId,
    lifecycle: 'active',
    stage: 'clarify',
    artifacts: { classification: null },
    validation: { status: 'missing', digest: null, validatedAt: null },
  }, null, 2)}\n`);
  const requirementsRef = `harness/changes/${changeId}/requirements.md`;
  write(requirementsRef, '# Requirements\n\nUse a stable project contract.\n');
  appendDecisionEvent(root, changeId, event());
  const assessmentRef = `harness/changes/${changeId}/project-contract-assessment.json`;
  writeProjectContractAssessment(root, changeId, {
    assessmentVersion: 1,
    type: 'project-contract-assessment',
    changeId,
    files: [],
    gaps: [{ section: 'vision', evidence: `${requirementsRef}:3` }],
    conflicts: [],
    status: 'proposal-required',
    decisionEventId: 'D-project-contract',
    proposalRef: null,
    inputDigests: { [requirementsRef]: artifactDigest(requirementsRef) },
    updatedAt: '2026-09-02T00:01:00.000Z',
  });

  const draftRef = `harness/changes/${changeId}/evidence/project-contract/drafts/P-baseline.json`;
  const proposal = {
    proposalVersion: 1,
    type: 'project-contract-proposal',
    proposalId: 'P-baseline',
    changeId,
    targetPath: 'AGENTS.md',
    operation: 'create',
    expectedDigest: null,
    resultContent: '# Project contract\n\n- Keep stable rules here.\n',
    durability: 'project-stable',
    preferenceBasis: 'approved-baseline',
    rationale: 'The confirmed project baseline applies across changes.',
    resolves: ['vision'],
    sourceDecisionIds: ['D-project-contract'],
    inputDigests: { [assessmentRef]: artifactDigest(assessmentRef) },
    createdAt: '2026-09-02T00:02:00.000Z',
  };
  write(draftRef, `${JSON.stringify(proposal, null, 2)}\n`);
  const published = persistProjectContractProposal(root, changeId, draftRef);
  const proposalRef = projectContractProposalPath(changeId, proposal.proposalId);
  assert.equal(published.path, proposalRef);
  assert.throws(() => applyProjectContractProposal(root, changeId, proposalRef), /EH-PROJECT-CONTRACT-APPROVAL-163/u);
  assert.equal(fs.existsSync(path.join(root, 'AGENTS.md')), false, 'unapproved proposal must not write instructions');

  appendDecisionEvent(root, changeId, event({
    eventId: 'D-contract-approval',
    actor: { type: 'user', id: 'interactive-user' },
    decisionType: 'project-contract-proposal-approval',
    targetRef: proposalRef,
    questionId: 'Q-contract-approval',
    options: ['approve', 'revise', 'reject'],
    recommendedOption: 'approve',
    selectedOption: 'approve',
    publicRationale: 'Selected by the user through AskUserQuestion.',
    evidenceRefs: [proposalRef, assessmentRef],
    inputDigests: { [proposalRef]: artifactDigest(proposalRef), [assessmentRef]: artifactDigest(assessmentRef) },
    recordedAt: '2026-09-02T00:03:00.000Z',
  }));
  write('AGENTS.md', '# Concurrent project contract\n');
  assert.throws(() => applyProjectContractProposal(root, changeId, proposalRef), /EH-PROJECT-CONTRACT-APPLY-164/u,
    'target mutation after proposal publication must fail closed');
  assert.equal(fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf-8'), '# Concurrent project contract\n',
    'failed CAS must preserve concurrent target content');
  fs.rmSync(path.join(root, 'AGENTS.md'));
  const applied = applyProjectContractProposal(root, changeId, proposalRef);
  assert.equal(applied.path, projectContractApplicationPath(changeId, proposal.proposalId));
  assert.equal(fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf-8'), proposal.resultContent);
  assert.equal(projectContractStatus(root, changeId).status, 'use-existing');
  assert.equal(applyProjectContractProposal(root, changeId, proposalRef).recovered, true, 'apply must be idempotent');

  const stale = { ...proposal, proposalId: 'P-stale', operation: 'append', expectedDigest: '0'.repeat(64), resultContent: `${proposal.resultContent}\n- New.\n` };
  const staleRef = `harness/changes/${changeId}/evidence/project-contract/drafts/P-stale.json`;
  write(staleRef, `${JSON.stringify(stale, null, 2)}\n`);
  assert.throws(() => persistProjectContractProposal(root, changeId, staleRef), /EH-PROJECT-CONTRACT-PROPOSAL-162/u);

  const help = spawnSync(process.execPath, [path.join(sourceRoot, 'runtime/cli.mjs'), 'clarify', '--help'], { cwd: root, encoding: 'utf-8', shell: false });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /propose-project-contract/u);
  assert.match(help.stdout, /apply-project-contract/u);
  console.log(`PASS project-contract-proposal ${mode}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
