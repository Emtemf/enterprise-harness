import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  debtAssessmentPath,
  projectContractAssessmentPath,
  readDebtAssessment,
  readProjectContractAssessment,
  validateDebtAssessment,
  validateProjectContractAssessment,
  writeDebtAssessment,
  writeProjectContractAssessment,
} from '../core/clarify-assessments.mjs';
import { appendDecisionEvent } from '../core/decision-ledger.mjs';

const mode = process.argv[2] || 'verify';
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const runtimeCli = fileURLToPath(new URL('../cli.mjs', import.meta.url));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'enterprise-harness-clarify-assessments-'));
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const artifactDigest = (relativePath) => digest(fs.readFileSync(path.join(root, relativePath)));

function writeArtifact(relativePath, content) {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content, 'utf-8');
  return relativePath;
}

function inputDigests(...refs) {
  return Object.fromEntries(refs.map((ref) => [ref, artifactDigest(ref)]));
}

function decisionEvent(changeId, eventId, {
  decisionType,
  targetRef,
  selectedOption,
  actorType = 'user',
  inputRef = `harness/changes/${changeId}/requirements.md`,
} = {}) {
  return {
    eventVersion: 1,
    type: 'decision-event',
    eventId,
    changeId,
    stage: 'clarify',
    actor: { type: actorType, id: actorType === 'user' ? 'maintainer' : 'orchestrator' },
    decisionType,
    targetRef,
    questionId: `question-${eventId}`,
    options: [selectedOption, selectedOption === 'deferred' ? 'use-existing' : 'deferred'],
    recommendedOption: selectedOption,
    selectedOption,
    publicRationale: `Selected ${selectedOption}`,
    evidenceRefs: [inputRef],
    inputDigests: inputDigests(inputRef),
    recordedAt: '2026-08-25T00:00:00.000Z',
  };
}

function debtFixture(changeId, overrides = {}) {
  const requirementsRef = `harness/changes/${changeId}/requirements.md`;
  const codeRef = 'src/refund.js';
  return {
    assessmentVersion: 1,
    type: 'debt-assessment',
    changeId,
    observations: [{
      debtId: 'TD-001',
      claim: 'Refund retries have no deterministic unit coverage',
      evidenceRefs: [`${codeRef}:1`, requirementsRef],
      relevance: 'The requested cancellation path calls this retry boundary',
      impact: 'A regression could duplicate refunds',
    }],
    dispositions: [{
      debtId: 'TD-001',
      status: 'enabling-task',
      decisionEventId: 'debt-decision-1',
      authorityRef: requirementsRef,
    }],
    inputDigests: inputDigests(requirementsRef, codeRef),
    updatedAt: '2026-08-25T00:02:00.000Z',
    ...overrides,
  };
}

function contractFixture(changeId, overrides = {}) {
  const requirementsRef = `harness/changes/${changeId}/requirements.md`;
  return {
    assessmentVersion: 1,
    type: 'project-contract-assessment',
    changeId,
    files: [{
      path: 'CLAUDE.md',
      digest: artifactDigest('CLAUDE.md'),
      scope: 'project',
      ownership: 'project',
    }],
    gaps: [],
    conflicts: [],
    status: 'use-existing',
    decisionEventId: null,
    proposalRef: null,
    inputDigests: inputDigests(requirementsRef, 'CLAUDE.md'),
    updatedAt: '2026-08-25T00:03:00.000Z',
    ...overrides,
  };
}

function seedChange(changeId) {
  writeArtifact(`harness/changes/${changeId}/requirements.md`, `# Requirements for ${changeId}\n`);
}

function appendDebtDecision(changeId, eventId = 'debt-decision-1', overrides = {}) {
  const targetRef = `harness/changes/${changeId}/requirements.md`;
  appendDecisionEvent(root, changeId, decisionEvent(changeId, eventId, {
    decisionType: 'debt-disposition',
    targetRef,
    selectedOption: 'enabling-task',
    ...overrides,
  }));
}

function appendContractDecision(changeId, eventId, status, overrides = {}) {
  appendDecisionEvent(root, changeId, decisionEvent(changeId, eventId, {
    decisionType: 'project-contract-disposition',
    targetRef: projectContractAssessmentPath(changeId),
    selectedOption: status,
    ...overrides,
  }));
}

function runCli(args) {
  return spawnSync(process.execPath, [runtimeCli, ...args], {
    cwd: root,
    encoding: 'utf-8',
    shell: false,
  });
}

function assertCliPathBlock(result) {
  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /^BLOCK \[EH-PATH-001\].*recovery=\S.+\n$/u);
  assert.equal(result.stderr.trim().split('\n').length, 1, 'CLI path failure must be one line');
  assert.equal((result.stderr.match(/recovery=/gu) || []).length, 1, 'CLI path failure must have one recovery');
  assert.doesNotMatch(result.stderr, /\n\s+at\s|Error:/u, 'CLI path failure must not expose a stack');
}

try {
  writeArtifact('src/refund.js', 'export function retryRefund() {}\n');
  writeArtifact('CLAUDE.md', '# Project instructions\n\nRun the focused and full tests.\n');

  const debtChange = 'debt-round-trip';
  seedChange(debtChange);
  appendDebtDecision(debtChange);
  const debt = debtFixture(debtChange);
  assert.deepEqual(validateDebtAssessment(root, debtChange, debt), []);
  const debtRef = writeDebtAssessment(root, debtChange, debt);
  assert.deepEqual(debtRef, {
    path: debtAssessmentPath(debtChange),
    digest: artifactDigest(debtAssessmentPath(debtChange)),
  });
  assert.deepEqual(readDebtAssessment(root, debtChange), debt);
  assert.throws(
    () => writeDebtAssessment(root, debtChange, {
      ...debt,
      inputDigests: inputDigests(`harness/changes/${debtChange}/requirements.md`),
    }),
    /EH-DEBT-SCHEMA-120/u,
  );
  assert.throws(
    () => writeDebtAssessment(root, debtChange, {
      ...debt,
      inputDigests: inputDigests('src/refund.js'),
    }),
    /EH-DEBT-SCHEMA-120/u,
  );

  const staleEvidenceChange = 'debt-read-stale-evidence';
  seedChange(staleEvidenceChange);
  appendDebtDecision(staleEvidenceChange);
  writeDebtAssessment(root, staleEvidenceChange, debtFixture(staleEvidenceChange));
  const refundSource = fs.readFileSync(path.join(root, 'src/refund.js'), 'utf-8');
  writeArtifact('src/refund.js', `${refundSource}// later mutation\n`);
  assert.throws(
    () => readDebtAssessment(root, staleEvidenceChange),
    /EH-DEBT-STALE-122/u,
  );
  writeArtifact('src/refund.js', refundSource);

  const noDebtChange = 'no-debt';
  seedChange(noDebtChange);
  const noDebt = debtFixture(noDebtChange, {
    observations: [],
    dispositions: [],
    inputDigests: inputDigests(`harness/changes/${noDebtChange}/requirements.md`),
  });
  assert.deepEqual(validateDebtAssessment(root, noDebtChange, noDebt), []);
  writeDebtAssessment(root, noDebtChange, noDebt);
  assert.deepEqual(readDebtAssessment(root, noDebtChange), noDebt);

  const missingDisposition = { ...debt, dispositions: [] };
  assert.throws(
    () => writeDebtAssessment(root, debtChange, missingDisposition),
    /EH-DEBT-DISPOSITION-121/u,
  );
  const duplicateDisposition = {
    ...debt,
    dispositions: [...debt.dispositions, { ...debt.dispositions[0] }],
  };
  assert.throws(
    () => writeDebtAssessment(root, debtChange, duplicateDisposition),
    /EH-DEBT-DISPOSITION-121/u,
  );
  const unrelatedWithoutEvidence = {
    ...debt,
    observations: [{ ...debt.observations[0], evidenceRefs: [] }],
  };
  assert.throws(
    () => writeDebtAssessment(root, debtChange, unrelatedWithoutEvidence),
    /EH-DEBT-SCHEMA-120/u,
  );
  assert.throws(
    () => writeDebtAssessment(root, debtChange, { ...debt, updatedAt: '2026-02-30T00:00:00Z' }),
    /EH-DEBT-SCHEMA-120/u,
  );
  assert.throws(
    () => writeDebtAssessment(root, debtChange, {
      ...debt,
      observations: [{ ...debt.observations[0], evidenceRefs: ['../outside.js:1'] }],
    }),
    /EH-DEBT-SCHEMA-120/u,
  );
  assert.throws(
    () => writeDebtAssessment(root, '../escape', debt),
    /EH-PATH-001/u,
  );

  const wrongTypeChange = 'debt-wrong-type';
  seedChange(wrongTypeChange);
  appendDecisionEvent(root, wrongTypeChange, decisionEvent(wrongTypeChange, 'debt-decision-1', {
    decisionType: 'clarify-answer',
    targetRef: `harness/changes/${wrongTypeChange}/requirements.md`,
    selectedOption: 'enabling-task',
  }));
  assert.throws(
    () => writeDebtAssessment(root, wrongTypeChange, debtFixture(wrongTypeChange)),
    /EH-DEBT-DISPOSITION-121/u,
  );

  const wrongTargetChange = 'debt-wrong-target';
  seedChange(wrongTargetChange);
  appendDebtDecision(wrongTargetChange, 'debt-decision-1', { targetRef: 'src/refund.js:1' });
  assert.throws(
    () => writeDebtAssessment(root, wrongTargetChange, debtFixture(wrongTargetChange)),
    /EH-DEBT-DISPOSITION-121/u,
  );

  const staleDebtChange = 'debt-stale';
  seedChange(staleDebtChange);
  appendDebtDecision(staleDebtChange);
  const staleDebt = debtFixture(staleDebtChange);
  writeArtifact(`harness/changes/${staleDebtChange}/requirements.md`, '# changed requirements\n');
  assert.throws(
    () => writeDebtAssessment(root, staleDebtChange, staleDebt),
    /EH-DEBT-STALE-122/u,
  );

  const contractChange = 'contract-round-trip';
  seedChange(contractChange);
  const contract = contractFixture(contractChange);
  assert.deepEqual(validateProjectContractAssessment(root, contractChange, contract), []);
  const contractRef = writeProjectContractAssessment(root, contractChange, contract);
  assert.deepEqual(contractRef, {
    path: projectContractAssessmentPath(contractChange),
    digest: artifactDigest(projectContractAssessmentPath(contractChange)),
  });
  assert.deepEqual(readProjectContractAssessment(root, contractChange), contract);
  assert.throws(
    () => writeProjectContractAssessment(root, contractChange, {
      ...contract,
      inputDigests: inputDigests(`harness/changes/${contractChange}/requirements.md`),
    }),
    /EH-PROJECT-CONTRACT-SCHEMA-123/u,
  );
  assert.throws(
    () => writeProjectContractAssessment(root, contractChange, {
      ...contract,
      decisionEventId: 'missing-use-existing-decision',
    }),
    /EH-PROJECT-CONTRACT-SCHEMA-123/u,
  );

  const missingContractChange = 'contract-missing';
  seedChange(missingContractChange);
  appendContractDecision(missingContractChange, 'contract-decision-1', 'proposal-required');
  const missingContract = contractFixture(missingContractChange, {
    files: [],
    status: 'proposal-required',
    decisionEventId: 'contract-decision-1',
    inputDigests: inputDigests(`harness/changes/${missingContractChange}/requirements.md`),
  });
  assert.deepEqual(validateProjectContractAssessment(root, missingContractChange, missingContract), []);
  writeProjectContractAssessment(root, missingContractChange, missingContract);

  const gapContractChange = 'contract-gap';
  seedChange(gapContractChange);
  appendContractDecision(gapContractChange, 'contract-decision-1', 'proposal-required', { actorType: 'main' });
  const gapContract = contractFixture(gapContractChange, {
    gaps: [{ section: 'verification-standard', evidence: 'No acceptance threshold is defined' }],
    status: 'proposal-required',
    decisionEventId: 'contract-decision-1',
  });
  assert.deepEqual(validateProjectContractAssessment(root, gapContractChange, gapContract), []);

  const conflictChange = 'contract-conflict';
  seedChange(conflictChange);
  const conflict = contractFixture(conflictChange, {
    conflicts: [{ section: 'verification', evidence: 'Project and vendor commands disagree' }],
    status: 'conflict',
    decisionEventId: 'contract-conflict-1',
  });
  assert.throws(
    () => writeProjectContractAssessment(root, conflictChange, conflict),
    /EH-PROJECT-CONTRACT-SCHEMA-123/u,
  );
  appendContractDecision(conflictChange, 'contract-conflict-1', 'conflict');
  assert.doesNotThrow(() => writeProjectContractAssessment(root, conflictChange, conflict));

  const deferredChange = 'contract-deferred';
  seedChange(deferredChange);
  appendContractDecision(deferredChange, 'contract-deferred-1', 'deferred', { actorType: 'main' });
  assert.throws(
    () => writeProjectContractAssessment(root, deferredChange, contractFixture(deferredChange, {
      status: 'deferred',
      decisionEventId: 'contract-deferred-1',
    })),
    /EH-PROJECT-CONTRACT-SCHEMA-123/u,
  );

  const staleClaudeDigest = {
    ...contract,
    files: [{ ...contract.files[0], digest: 'a'.repeat(64) }],
  };
  assert.throws(
    () => writeProjectContractAssessment(root, contractChange, staleClaudeDigest),
    /EH-PROJECT-CONTRACT-STALE-124/u,
  );
  for (const field of ['content', 'patch', 'apply', 'writeTarget']) {
    const autoApplyPayload = { ...contract, [field]: field === 'apply' ? true : 'CLAUDE.md' };
    assert.throws(
      () => writeProjectContractAssessment(root, contractChange, autoApplyPayload),
      /EH-PROJECT-CONTRACT-SCOPE-125/u,
    );
  }
  assert.throws(
    () => writeProjectContractAssessment(root, contractChange, {
      ...contract,
      files: [{ ...contract.files[0], path: '../CLAUDE.md' }],
    }),
    /EH-PROJECT-CONTRACT-SCOPE-125/u,
  );

  const wrongContractEventChange = 'contract-event-mismatch';
  seedChange(wrongContractEventChange);
  appendContractDecision(wrongContractEventChange, 'contract-decision-1', 'proposal-required', {
    targetRef: `harness/changes/${wrongContractEventChange}/requirements.md`,
  });
  assert.throws(
    () => writeProjectContractAssessment(root, wrongContractEventChange, contractFixture(wrongContractEventChange, {
      files: [],
      status: 'proposal-required',
      decisionEventId: 'contract-decision-1',
      inputDigests: inputDigests(`harness/changes/${wrongContractEventChange}/requirements.md`),
    })),
    /EH-PROJECT-CONTRACT-SCHEMA-123/u,
  );

  const proposalOutside = fs.mkdtempSync(path.join(os.tmpdir(), 'enterprise-harness-proposal-escape-'));
  try {
    fs.writeFileSync(path.join(proposalOutside, 'proposal.md'), '# external proposal\n', 'utf-8');
    fs.symlinkSync(
      path.join(proposalOutside, 'proposal.md'),
      path.join(root, 'proposal-link.md'),
      process.platform === 'win32' ? 'file' : undefined,
    );
    assert.throws(
      () => writeProjectContractAssessment(root, contractChange, {
        ...contract,
        proposalRef: 'proposal-link.md',
      }),
      /EH-PROJECT-CONTRACT-SCOPE-125/u,
    );
  } catch (error) {
    if (!['EPERM', 'EACCES', 'UNKNOWN'].includes(error.code)) throw error;
  } finally {
    fs.rmSync(path.join(root, 'proposal-link.md'), { force: true });
    fs.rmSync(proposalOutside, { recursive: true, force: true });
  }

  const malformedDebtPath = path.join(root, debtAssessmentPath(noDebtChange));
  fs.writeFileSync(malformedDebtPath, '{not-json}\n', 'utf-8');
  assert.throws(() => readDebtAssessment(root, noDebtChange), /EH-DEBT-SCHEMA-120/u);
  const malformedContractPath = path.join(root, projectContractAssessmentPath(contractChange));
  fs.writeFileSync(malformedContractPath, '{not-json}\n', 'utf-8');
  assert.throws(
    () => readProjectContractAssessment(root, contractChange),
    /EH-PROJECT-CONTRACT-SCHEMA-123/u,
  );

  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'enterprise-harness-assessment-escape-'));
  const symlinkChange = 'assessment-symlink';
  try {
    const changesDir = path.join(root, 'harness', 'changes');
    fs.mkdirSync(changesDir, { recursive: true });
    fs.symlinkSync(outside, path.join(changesDir, symlinkChange), process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(
      () => writeDebtAssessment(root, symlinkChange, {
        ...noDebt,
        changeId: symlinkChange,
      }),
      /EH-PATH-001/u,
    );
    assert.throws(
      () => writeProjectContractAssessment(root, symlinkChange, {
        ...contract,
        changeId: symlinkChange,
      }),
      /EH-PATH-001/u,
    );
    assertCliPathBlock(runCli([
      'clarify',
      'validate-debt',
      symlinkChange,
      debtAssessmentPath(symlinkChange),
    ]));
    assertCliPathBlock(runCli([
      'clarify',
      'validate-project-contract',
      symlinkChange,
      projectContractAssessmentPath(symlinkChange),
    ]));
    assert.equal(fs.readdirSync(outside).length, 0, 'assessment writes must not follow an external symlink');
  } catch (error) {
    if (!['EPERM', 'EACCES', 'UNKNOWN'].includes(error.code)) throw error;
  } finally {
    fs.rmSync(outside, { recursive: true, force: true });
  }

  const cliChange = 'assessment-cli';
  seedChange(cliChange);
  const cliDebt = debtFixture(cliChange, {
    observations: [],
    dispositions: [],
    inputDigests: inputDigests(`harness/changes/${cliChange}/requirements.md`),
  });
  const cliContract = contractFixture(cliChange);
  writeDebtAssessment(root, cliChange, cliDebt);
  writeProjectContractAssessment(root, cliChange, cliContract);
  const debtCli = runCli(['clarify', 'validate-debt', cliChange, debtAssessmentPath(cliChange)]);
  assert.equal(debtCli.status, 0, debtCli.stderr);
  assert.deepEqual(JSON.parse(debtCli.stdout), {
    path: debtAssessmentPath(cliChange),
    digest: artifactDigest(debtAssessmentPath(cliChange)),
  });
  const contractCli = runCli([
    'clarify',
    'validate-project-contract',
    cliChange,
    projectContractAssessmentPath(cliChange),
  ]);
  assert.equal(contractCli.status, 0, contractCli.stderr);
  assert.deepEqual(JSON.parse(contractCli.stdout), {
    path: projectContractAssessmentPath(cliChange),
    digest: artifactDigest(projectContractAssessmentPath(cliChange)),
  });
  const invalidCli = runCli(['clarify', 'validate-debt', cliChange, '../outside.json']);
  assert.equal(invalidCli.status, 2);
  assert.match(invalidCli.stderr, /^BLOCK \[EH-DEBT-SCHEMA-120\].*recovery=/u);
  assert.equal(invalidCli.stderr.trim().split('\n').length, 1, 'CLI failure must have one recovery line');
  assertCliPathBlock(runCli(['clarify', 'validate-debt', '../escape', '../escape.json']));
  assertCliPathBlock(runCli(['clarify', 'validate-project-contract', '../escape', '../escape.json']));

  const help = runCli(['clarify', '--help']);
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /clarify validate-debt <change-id> <artifact-ref>/u);
  assert.match(help.stdout, /clarify validate-project-contract <change-id> <artifact-ref>/u);

  const debtTemplate = JSON.parse(fs.readFileSync(fileURLToPath(new URL(
    '../../skills/harness/assets/debt-assessment.json.tmpl',
    import.meta.url,
  )), 'utf-8'));
  assert.deepEqual(debtTemplate.observations, []);
  assert.deepEqual(debtTemplate.dispositions, []);
  const projectTemplate = JSON.parse(fs.readFileSync(fileURLToPath(new URL(
    '../../skills/harness/assets/project-contract-assessment.json.tmpl',
    import.meta.url,
  )), 'utf-8'));
  assert.deepEqual(projectTemplate.files, []);
  assert.deepEqual(projectTemplate.gaps, []);
  assert.deepEqual(projectTemplate.conflicts, []);
  assert.equal(projectTemplate.proposalRef, null);

  console.log(`PASS clarify-assessments ${mode}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
