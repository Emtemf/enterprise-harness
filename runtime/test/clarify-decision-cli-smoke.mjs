import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  classificationInputPath,
  decisionEventInputPath,
} from '../core/clarify-governance.mjs';
import { clarifyDecisionSnapshotPath, readDecisionEvents } from '../core/decision-ledger.mjs';
import {
  debtAssessmentPath,
  projectContractAssessmentPath,
  writeDebtAssessment,
  writeProjectContractAssessment,
} from '../core/clarify-assessments.mjs';
import { classificationArtifactPath } from '../core/classification-artifact.mjs';
import { sha256Artifact } from '../lib/result-contract.mjs';

const mode = process.argv[2] || 'verify';
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);
const cli = fileURLToPath(new URL('../cli.mjs', import.meta.url));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-clarify-cli-'));
const changeId = 'cli-chain';

function run(...args) {
  return spawnSync(process.execPath, [cli, 'clarify', ...args], { cwd: root, encoding: 'utf-8', shell: false });
}

function writeJson(ref, value) {
  const target = path.join(root, ref);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
}

function event(eventId, decisionType, targetRef, options, selectedOption, inputDigests) {
  return {
    eventVersion: 1,
    type: 'decision-event',
    eventId,
    changeId,
    stage: 'clarify',
    actor: { type: 'runtime', id: 'clarify-cli-test' },
    decisionType,
    targetRef,
    questionId: `question-${eventId}`,
    options,
    recommendedOption: selectedOption,
    selectedOption,
    publicRationale: `Durable ${decisionType} decision.`,
    evidenceRefs: Object.keys(inputDigests),
    inputDigests,
    recordedAt: '2026-08-25T00:00:00.000Z',
  };
}

try {
  spawnSync('git', ['init', '--quiet'], { cwd: root, shell: false });
  const changeDir = path.join(root, 'harness', 'changes', changeId);
  fs.mkdirSync(changeDir, { recursive: true });
  writeJson(`harness/changes/${changeId}/state.json`, {
    schemaVersion: 6, revision: 1, changeId, lifecycle: 'active', stage: 'clarify',
    artifacts: { classification: null },
    validation: { status: 'missing', digest: null, validatedAt: null },
  });
  const requirementsRef = `harness/changes/${changeId}/requirements.md`;
  fs.writeFileSync(path.join(root, requirementsRef), [
    '# Requirements', '', '## 事实探索门禁',
    '| Lane | Required | Brief ref | RunId | Packet ref | Status | Authority / fallback |',
    '|---|---|---|---|---|---|---|',
    '| code | no | none | none | none | not-required | No repository behavior is in scope. |',
    '| docs | no | none | none | none | not-required | No external contract is in scope. |',
    '- remaining fact uncertainty: none', '',
  ].join('\n'));
  const requirementsDigest = sha256Artifact(root, requirementsRef);

  const laneId = 'lane-code';
  const laneRef = decisionEventInputPath(changeId, laneId);
  writeJson(laneRef, event(laneId, 'lane-applicability', `${requirementsRef}#fact-lane-code`, ['required', 'not-required'], 'not-required', {
    [requirementsRef]: requirementsDigest,
  }));
  const recorded = run('record-decision', changeId, laneRef);
  assert.equal(recorded.status, 0, recorded.stderr);
  assert.equal(JSON.parse(recorded.stdout).duplicate, false);
  const duplicate = run('record-decision', changeId, laneRef);
  assert.equal(duplicate.status, 0, duplicate.stderr);
  assert.equal(JSON.parse(duplicate.stdout).duplicate, true);
  const unsafe = run('record-decision', changeId, '../escape.json');
  assert.equal(unsafe.status, 2);
  assert.match(unsafe.stderr, /EH-PATH-001/u);
  const malformedRef = decisionEventInputPath(changeId, 'malformed');
  const malformedPath = path.join(root, malformedRef);
  fs.mkdirSync(path.dirname(malformedPath), { recursive: true });
  fs.writeFileSync(malformedPath, '{not-json\n');
  const malformed = run('record-decision', changeId, malformedRef);
  assert.equal(malformed.status, 2);
  assert.match(malformed.stderr, /EH-DECISION-INPUT-147/u);
  const symlinkRef = decisionEventInputPath(changeId, 'symlink-event');
  const outside = path.join(os.tmpdir(), `eh-event-outside-${process.pid}.json`);
  fs.writeFileSync(outside, '{}\n');
  try {
    fs.symlinkSync(outside, path.join(root, symlinkRef), 'file');
    const symlinked = run('record-decision', changeId, symlinkRef);
    assert.equal(symlinked.status, 2);
    assert.match(symlinked.stderr, /EH-PATH-001/u);
  } catch (error) {
    if (!['EPERM', 'EACCES', 'UNKNOWN'].includes(error.code)) throw error;
  } finally {
    fs.rmSync(outside, { force: true });
  }
  fs.appendFileSync(path.join(root, requirementsRef), 'changed\n');
  const stale = run('record-decision', changeId, laneRef);
  assert.equal(stale.status, 2);
  assert.match(stale.stderr, /EH-DECISION-STALE-146/u);
  fs.writeFileSync(path.join(root, requirementsRef), [
    '# Requirements', '', '## 事实探索门禁',
    '| Lane | Required | Brief ref | RunId | Packet ref | Status | Authority / fallback |',
    '|---|---|---|---|---|---|---|',
    '| code | no | none | none | none | not-required | No repository behavior is in scope. |',
    '| docs | no | none | none | none | not-required | No external contract is in scope. |',
    '- remaining fact uncertainty: none', '',
  ].join('\n'));

  const docsLaneId = 'lane-docs';
  const docsLaneRef = decisionEventInputPath(changeId, docsLaneId);
  writeJson(docsLaneRef, event(docsLaneId, 'lane-applicability', `${requirementsRef}#fact-lane-docs`, ['required', 'not-required'], 'not-required', {
    [requirementsRef]: requirementsDigest,
  }));
  const docsRecorded = run('record-decision', changeId, docsLaneRef);
  assert.equal(docsRecorded.status, 0, docsRecorded.stderr);

  const sealed = run('seal-decisions', changeId, laneId, docsLaneId);
  assert.equal(sealed.status, 0, sealed.stderr);
  const sealedAgain = run('seal-decisions', changeId, laneId, docsLaneId);
  assert.equal(sealedAgain.status, 0, sealedAgain.stderr);
  const wrongSeal = run('seal-decisions', changeId, 'missing-event');
  assert.equal(wrongSeal.status, 2);
  assert.match(wrongSeal.stderr, /EH-DECISION-SNAPSHOT-104/u);

  const debtRef = debtAssessmentPath(changeId);
  writeDebtAssessment(root, changeId, {
    assessmentVersion: 1, type: 'debt-assessment', changeId, observations: [], dispositions: [],
    inputDigests: { [requirementsRef]: requirementsDigest }, updatedAt: '2026-08-25T00:01:00.000Z',
  });
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), '# Test instructions\n');
  const contractRef = projectContractAssessmentPath(changeId);
  writeProjectContractAssessment(root, changeId, {
    assessmentVersion: 1, type: 'project-contract-assessment', changeId,
    files: [{ path: 'CLAUDE.md', digest: sha256Artifact(root, 'CLAUDE.md'), scope: 'project', ownership: 'project' }],
    gaps: [], conflicts: [], status: 'use-existing', decisionEventId: null, proposalRef: null,
    inputDigests: { [requirementsRef]: requirementsDigest, 'CLAUDE.md': sha256Artifact(root, 'CLAUDE.md') },
    updatedAt: '2026-08-25T00:02:00.000Z',
  });
  assert.equal(run('validate-debt', changeId, debtRef).status, 0);
  assert.equal(run('validate-project-contract', changeId, contractRef).status, 0);

  const authoritativeRefs = [requirementsRef, clarifyDecisionSnapshotPath(changeId), debtRef, contractRef];
  const inputDigests = Object.fromEntries(authoritativeRefs.map((ref) => [ref, sha256Artifact(root, ref)]));
  const routeId = 'route-L1';
  const routeRef = decisionEventInputPath(changeId, routeId);
  writeJson(routeRef, event(routeId, 'classification-route', classificationArtifactPath(changeId), ['L0', 'L1', 'L2', 'L3'], 'L1', inputDigests));
  assert.equal(run('record-decision', changeId, routeRef).status, 0);

  const classifyRef = classificationInputPath(changeId);
  const score = (reason) => ({ value: 1, evidenceRefs: [requirementsRef], reason });
  writeJson(classifyRef, {
    scores: {
      functionalSize: score('One contained outcome.'), uncertainty: score('Facts are bounded.'),
      changeRisk: score('Low-risk local change.'), verificationDifficulty: score('Directly observable.'),
    },
    hardFlags: [], impact: { api: 'no', data: 'no', architecture: 'no', rule: 'no', security: 'no' },
    inputDigests, decisionEventId: routeId,
  });
  const classified = run('classify', changeId, classifyRef);
  assert.equal(classified.status, 0, classified.stderr);
  assert.equal(JSON.parse(classified.stdout).duplicate, false);
  assert.equal(JSON.parse(run('classify', changeId, classifyRef).stdout).duplicate, true);
  const state = JSON.parse(fs.readFileSync(path.join(changeDir, 'state.json'), 'utf-8'));
  assert.equal(state.artifacts.classification.path, classificationArtifactPath(changeId));
  assert.deepEqual(readDecisionEvents(root, changeId).map(({ eventId }) => eventId), [laneId, docsLaneId, routeId]);

  console.log(`PASS clarify-decision-cli ${mode}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
