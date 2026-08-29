import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { canonicalReviewRubricProblems } from '../lib/review-rubrics.mjs';
import { sha256Artifact } from '../lib/result-contract.mjs';
import { approvedRequirements } from './clarify-readiness-fixture.mjs';
import { writeClassificationV2Fixture } from './classification-v2-fixture.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'enterprise-harness-rubric-authority-'));
const allRiskRubrics = ['api', 'data', 'architecture', 'rule', 'security'];

function writeJson(target, value) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
}

function prepareAuthority(changeId, impact) {
  const changeDir = path.join(root, 'harness', 'changes', changeId);
  const requirementsRef = `harness/changes/${changeId}/requirements.md`;
  fs.mkdirSync(changeDir, { recursive: true });
  fs.writeFileSync(path.join(root, requirementsRef), approvedRequirements());
  const classification = writeClassificationV2Fixture(root, changeId, { impact });
  const statePath = path.join(changeDir, 'state.json');
  writeJson(statePath, {
    schemaVersion: 6,
    revision: 1,
    changeId,
    lifecycle: 'active',
    stage: 'design',
    artifacts: { classification },
    validation: { status: 'missing', digest: null, validatedAt: null },
  });
  return { changeDir, classification, requirementsRef, statePath };
}

function problems(changeId, behavior, rubricIds) {
  return canonicalReviewRubricProblems({
    root,
    changeId,
    stage: 'design',
    behavior,
    rubricIds,
  });
}

try {
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: root, shell: false }).status, 0);

  const allRiskId = 'rubric-all-risk';
  const allRisk = prepareAuthority(allRiskId, {
    api: 'yes', data: 'yes', architecture: 'yes', rule: 'yes', security: 'yes',
  });
  assert.deepEqual(problems(allRiskId, 'design.review', ['design', ...allRiskRubrics]), []);
  assert.deepEqual(problems(allRiskId, 'design.test-cases.review', ['test-design', ...allRiskRubrics]), []);

  const noRiskId = 'rubric-no-risk';
  prepareAuthority(noRiskId, {
    api: 'no', data: 'no', architecture: 'no', rule: 'no', security: 'no',
  });
  assert.deepEqual(problems(noRiskId, 'design.review', ['design']), []);
  assert.deepEqual(problems(noRiskId, 'design.test-cases.review', ['test-design']), []);

  const partialRiskId = 'rubric-partial-risk';
  prepareAuthority(partialRiskId, {
    api: 'yes', data: 'no', architecture: 'no', rule: 'no', security: 'yes',
  });
  assert.deepEqual(problems(partialRiskId, 'design.review', ['design', 'api', 'security']), []);
  assert.deepEqual(problems(partialRiskId, 'design.test-cases.review', ['test-design', 'api', 'security']), []);

  const authorityFailures = [
    ['all-risk architecture omission', problems(allRiskId, 'design.review', ['design'])],
    ['all-risk test-design omission', problems(allRiskId, 'design.test-cases.review', ['test-design'])],
    ['partial-risk omission', problems(partialRiskId, 'design.review', ['design', 'api'])],
  ];

  const stateText = fs.readFileSync(allRisk.statePath, 'utf-8');
  const classificationPath = path.join(root, allRisk.classification.path);
  const classificationText = fs.readFileSync(classificationPath, 'utf-8');
  const debtPath = path.join(allRisk.changeDir, 'debt-assessment.json');
  const debtText = fs.readFileSync(debtPath, 'utf-8');
  const restoreAuthority = () => {
    fs.writeFileSync(allRisk.statePath, stateText);
    fs.writeFileSync(classificationPath, classificationText);
    fs.writeFileSync(debtPath, debtText);
  };
  const mutateAndCollect = (label, mutate) => {
    restoreAuthority();
    mutate();
    authorityFailures.push([label, problems(allRiskId, 'design.review', ['design', ...allRiskRubrics])]);
  };

  mutateAndCollect('missing state', () => fs.rmSync(allRisk.statePath));
  mutateAndCollect('malformed state', () => fs.writeFileSync(allRisk.statePath, '{\n'));
  mutateAndCollect('missing classification', () => fs.rmSync(classificationPath));
  mutateAndCollect('malformed classification', () => {
    fs.writeFileSync(classificationPath, '{\n');
    const state = JSON.parse(stateText);
    writeJson(allRisk.statePath, {
      ...state,
      artifacts: {
        ...state.artifacts,
        classification: {
          ...state.artifacts.classification,
          digest: sha256Artifact(root, allRisk.classification.path),
        },
      },
    });
  });
  mutateAndCollect('classification digest mismatch', () => fs.appendFileSync(classificationPath, '\n'));
  mutateAndCollect('stale classification input', () => fs.appendFileSync(debtPath, '\n'));
  restoreAuthority();

  assert.deepEqual(
    authorityFailures.map(([label, failureProblems]) => [label, failureProblems.length > 0]),
    authorityFailures.map(([label]) => [label, true]),
    'rubric validation must use the complete, fresh classification referenced by State v6',
  );
  for (const [label, failureProblems] of authorityFailures) {
    assert.match(failureProblems.join('; '), /classification|state|canonical rubrics/iu, label);
  }

  console.log('PASS review-rubric-authority verify');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
