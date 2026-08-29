import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import {
  createHandoffV2,
  loadHandoffV2FromMarker,
  v2ResultPath,
} from '../core/handoff-v2.mjs';
import { sha256Artifact } from '../lib/result-contract.mjs';
import { validateDesignStageGate } from '../lib/stage-results.mjs';
import { appendCompletedHandoffBinding } from './handoff-binding-fixture.mjs';
import { writeClassificationV2Fixture } from './classification-v2-fixture.mjs';
import { approvedRequirements } from './clarify-readiness-fixture.mjs';

const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'enterprise-harness-design-compound-'));
const changeId = 'design-compound';
const requirementsRef = `harness/changes/${changeId}/requirements.md`;
const designRef = `harness/changes/${changeId}/design.md`;
const testCasesRef = `harness/changes/${changeId}/test-cases.md`;
const architectureProofRef = `harness/changes/${changeId}/evidence/completion/design-architecture.json`;
const designProofRef = `harness/changes/${changeId}/evidence/completion/design.json`;
const riskRubricIds = ['api', 'data', 'architecture', 'rule', 'security'];

function writeJson(target, value) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
}

function stageResult(input, artifactRef, producer, completedAt) {
  return {
    resultVersion: 1,
    type: 'stage-result',
    changeId,
    stage: 'design',
    runId: input.runId,
    producer,
    inputDigests: { ...input.inputDigests },
    artifacts: [{ path: artifactRef, digest: sha256Artifact(root, artifactRef) }],
    assertions: [{ id: `${producer.skill}-contract`, verdict: 'pass', evidence: [artifactRef] }],
    selfCheck: { verdict: 'pass', findings: [], evidence: [artifactRef] },
    tecpc: { ...input.tecpc },
    status: 'pass',
    needsDecision: null,
    completedAt,
  };
}

function reviewResult(input, parent, artifactRef, reviewedAt) {
  return {
    resultVersion: 1,
    type: 'review-result',
    changeId,
    stage: 'design',
    runId: input.runId,
    parentRunId: parent.runId,
    reviewer: { agentType: input.agent.type, skill: input.agent.skill },
    reviewedRunId: parent.runId,
    reviewedArtifacts: [{ path: artifactRef, digest: sha256Artifact(root, artifactRef) }],
    rubricIds: [...input.rubricIds],
    tecpc: { ...input.tecpc },
    verdict: 'pass',
    correction: null,
    reviewedAt,
  };
}

try {
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: root, shell: false }).status, 0);
  fs.mkdirSync(path.join(root, 'harness', 'changes', changeId), { recursive: true });
  fs.writeFileSync(path.join(root, requirementsRef), approvedRequirements());
  const classificationReference = writeClassificationV2Fixture(root, changeId, {
    impact: { api: 'yes', data: 'yes', architecture: 'yes', rule: 'yes', security: 'yes' },
  });
  writeJson(path.join(root, 'harness', 'changes', changeId, 'state.json'), {
    schemaVersion: 6,
    revision: 1,
    changeId,
    lifecycle: 'active',
    stage: 'design',
    artifacts: { classification: classificationReference },
    validation: { status: 'missing', digest: null, validatedAt: null },
  });
  fs.writeFileSync(path.join(root, designRef), '# Design\n\nArchitecture contract.\n');
  fs.writeFileSync(path.join(root, testCasesRef), '# Test Cases\n\nDetailed cases.\n');

  const architectureTecpc = {
    target: 'produce architecture design',
    evidence: [designRef],
    context: [requirementsRef],
    path: `${requirementsRef} -> ${designRef}`,
    correction: null,
  };
  const architectureExecute = createHandoffV2(root, {
    changeId,
    stage: 'design',
    behavior: 'design.produce',
    agent: { type: 'enterprise-harness:artifact-worker', skill: 'design' },
    inputRefs: [requirementsRef],
    tecpc: architectureTecpc,
  });
  const architectureResult = stageResult(
    architectureExecute.input,
    designRef,
    { agentType: 'enterprise-harness:artifact-worker', skill: 'design' },
    '2026-08-28T00:00:00.000Z',
  );
  writeJson(v2ResultPath(root, changeId, architectureExecute.runId), architectureResult);
  const architectureCheck = createHandoffV2(root, {
    changeId,
    stage: 'design',
    behavior: 'design.review',
    role: 'check',
    parentRunId: architectureExecute.runId,
    agent: { type: 'enterprise-harness:reviewer', skill: 'review' },
    inputRefs: [designRef],
    rubricIds: ['design', ...riskRubricIds],
    tecpc: {
      ...architectureTecpc,
      target: 'review architecture design',
      evidence: [requirementsRef],
      context: [designRef],
      path: `${designRef} -> review architecture`,
    },
  });
  const architectureReview = reviewResult(
    architectureCheck.input,
    architectureExecute.input,
    designRef,
    '2026-08-28T00:00:01.000Z',
  );
  writeJson(v2ResultPath(root, changeId, architectureCheck.runId, 'check'), architectureReview);
  appendCompletedHandoffBinding(root, changeId, architectureExecute.input, { agentId: 'architecture-executor' });
  appendCompletedHandoffBinding(root, changeId, architectureCheck.input, { agentId: 'architecture-reviewer' });

  const unsealedArchitectureProblems = validateDesignStageGate(root, changeId).join('\n');
  assert.match(
    unsealedArchitectureProblems,
    /architecture proof is missing/u,
    'the approved recovery order must seal a valid architecture chain before test design starts',
  );
  assert.doesNotMatch(
    unsealedArchitectureProblems,
    /test-design StageResult is missing/u,
    'the Design gate must not skip ahead to test design before ArchitectureProof exists',
  );

  const { buildDesignArchitectureProof, buildCompoundDesignProof } = await import('../core/design-proof.mjs');
  const architectureProof = buildDesignArchitectureProof(root, architectureResult, architectureReview);
  writeJson(path.join(root, architectureProofRef), architectureProof);
  assert.match(
    validateDesignStageGate(root, changeId).join('\n'),
    /test-design StageResult is missing/u,
    'after ArchitectureProof is sealed, the next gate must be test-design execution',
  );

  const testDesignTecpc = {
    target: 'produce detailed test cases',
    evidence: [testCasesRef],
    context: [requirementsRef, designRef, architectureProofRef],
    path: `${architectureProofRef} -> ${testCasesRef}`,
    correction: null,
  };
  const testDesignExecute = createHandoffV2(root, {
    changeId,
    stage: 'design',
    behavior: 'design.test-cases',
    agent: { type: 'enterprise-harness:test-design-worker', skill: 'test-design' },
    inputRefs: [requirementsRef, designRef, architectureProofRef],
    tecpc: testDesignTecpc,
  });
  const testDesignResult = stageResult(
    testDesignExecute.input,
    testCasesRef,
    { agentType: 'enterprise-harness:test-design-worker', skill: 'test-design' },
    '2026-08-28T00:00:02.000Z',
  );
  writeJson(v2ResultPath(root, changeId, testDesignExecute.runId), testDesignResult);
  const testDesignCheck = createHandoffV2(root, {
    changeId,
    stage: 'design',
    behavior: 'design.test-cases.review',
    role: 'check',
    parentRunId: testDesignExecute.runId,
    agent: { type: 'enterprise-harness:reviewer', skill: 'review' },
    inputRefs: [testCasesRef],
    rubricIds: ['test-design', ...riskRubricIds],
    tecpc: {
      ...testDesignTecpc,
      target: 'review detailed test cases',
      evidence: [designRef],
      context: [requirementsRef],
      path: `${testCasesRef} -> review test design`,
    },
  });
  const testDesignReview = reviewResult(
    testDesignCheck.input,
    testDesignExecute.input,
    testCasesRef,
    '2026-08-28T00:00:03.000Z',
  );
  writeJson(v2ResultPath(root, changeId, testDesignCheck.runId, 'check'), testDesignReview);
  appendCompletedHandoffBinding(root, changeId, testDesignExecute.input, { agentId: 'test-design-executor' });
  appendCompletedHandoffBinding(root, changeId, testDesignCheck.input, { agentId: 'test-design-reviewer' });

  const compoundProof = buildCompoundDesignProof(root, architectureProof, testDesignResult, testDesignReview);
  writeJson(path.join(root, designProofRef), compoundProof);
  assert.deepEqual(validateDesignStageGate(root, changeId), []);

  function rejectsInvalidCheck(create) {
    try {
      const invalid = create();
      fs.rmSync(path.dirname(invalid.path), { recursive: true, force: true });
      return false;
    } catch (error) {
      assert.match(
        error.message,
        /design\.review|design\.test-cases\.review|canonical.*rubric/iu,
        'invalid Design checks must explain the exact behavior or rubric recovery',
      );
      return true;
    }
  }

  assert.deepEqual(
    [
      rejectsInvalidCheck(() => createHandoffV2(root, {
        changeId,
        stage: 'design',
        behavior: 'design.test-cases.review',
        role: 'check',
        parentRunId: architectureExecute.runId,
        agent: { type: 'enterprise-harness:reviewer', skill: 'review' },
        inputRefs: [designRef],
        tecpc: architectureCheck.input.tecpc,
        rubricIds: ['test-design'],
      })),
      rejectsInvalidCheck(() => createHandoffV2(root, {
        changeId,
        stage: 'design',
        behavior: 'design.review',
        role: 'check',
        parentRunId: architectureExecute.runId,
        agent: { type: 'enterprise-harness:reviewer', skill: 'review' },
        inputRefs: [designRef],
        tecpc: architectureCheck.input.tecpc,
        rubricIds: ['test-design'],
      })),
      rejectsInvalidCheck(() => createHandoffV2(root, {
        changeId,
        stage: 'design',
        behavior: 'design.review',
        role: 'check',
        parentRunId: testDesignExecute.runId,
        agent: { type: 'enterprise-harness:reviewer', skill: 'review' },
        inputRefs: [testCasesRef],
        tecpc: testDesignCheck.input.tecpc,
        rubricIds: ['design'],
      })),
      rejectsInvalidCheck(() => createHandoffV2(root, {
        changeId,
        stage: 'design',
        behavior: 'design.test-cases.review',
        role: 'check',
        parentRunId: testDesignExecute.runId,
        agent: { type: 'enterprise-harness:reviewer', skill: 'review' },
        inputRefs: [testCasesRef],
        tecpc: testDesignCheck.input.tecpc,
        rubricIds: ['design'],
      })),
      rejectsInvalidCheck(() => createHandoffV2(root, {
        changeId,
        stage: 'design',
        behavior: 'design.review',
        role: 'check',
        parentRunId: architectureExecute.runId,
        agent: { type: 'enterprise-harness:reviewer', skill: 'review' },
        inputRefs: [designRef],
        tecpc: architectureCheck.input.tecpc,
        rubricIds: ['design'],
      })),
      rejectsInvalidCheck(() => createHandoffV2(root, {
        changeId,
        stage: 'design',
        behavior: 'design.test-cases.review',
        role: 'check',
        parentRunId: testDesignExecute.runId,
        agent: { type: 'enterprise-harness:reviewer', skill: 'review' },
        inputRefs: [testCasesRef],
        tecpc: testDesignCheck.input.tecpc,
        rubricIds: ['test-design'],
      })),
    ],
    [true, true, true, true, true, true],
    'Design check creation must bind parent behavior and the complete authority-derived rubric list',
  );

  const swappedArchitectureReview = {
    ...architectureReview,
    rubricIds: ['test-design'],
  };
  writeJson(architectureCheck.path, {
    ...architectureCheck.input,
    behavior: 'design.test-cases.review',
    rubricIds: ['test-design'],
  });
  writeJson(v2ResultPath(root, changeId, architectureCheck.runId, 'check'), swappedArchitectureReview);
  assert.match(
    validateDesignStageGate(root, changeId).join('\n'),
    /architecture.*design\.review|design\.review.*architecture|canonical.*rubric/iu,
    'completion must reject a test-design review masquerading as the architecture check',
  );
  writeJson(architectureCheck.path, architectureCheck.input);
  writeJson(v2ResultPath(root, changeId, architectureCheck.runId, 'check'), architectureReview);

  const swappedTestDesignReview = {
    ...testDesignReview,
    rubricIds: ['design'],
  };
  writeJson(testDesignCheck.path, {
    ...testDesignCheck.input,
    behavior: 'design.review',
    rubricIds: ['design'],
  });
  writeJson(v2ResultPath(root, changeId, testDesignCheck.runId, 'check'), swappedTestDesignReview);
  assert.match(
    validateDesignStageGate(root, changeId).join('\n'),
    /test-design.*design\.test-cases\.review|design\.test-cases\.review.*test-design|canonical.*rubric/iu,
    'completion must reject an architecture review masquerading as the test-design check',
  );
  writeJson(testDesignCheck.path, testDesignCheck.input);
  writeJson(v2ResultPath(root, changeId, testDesignCheck.runId, 'check'), testDesignReview);

  const omittedArchitectureRisks = { ...architectureReview, rubricIds: ['design'] };
  writeJson(architectureCheck.path, { ...architectureCheck.input, rubricIds: ['design'] });
  writeJson(v2ResultPath(root, changeId, architectureCheck.runId, 'check'), omittedArchitectureRisks);
  assert.match(
    validateDesignStageGate(root, changeId).join('\n'),
    /canonical rubrics.*authority-derived/iu,
    'completion must reject an architecture review that omits classification-required risk rubrics',
  );
  writeJson(architectureCheck.path, architectureCheck.input);
  writeJson(v2ResultPath(root, changeId, architectureCheck.runId, 'check'), architectureReview);

  const omittedTestDesignRisks = { ...testDesignReview, rubricIds: ['test-design'] };
  writeJson(testDesignCheck.path, { ...testDesignCheck.input, rubricIds: ['test-design'] });
  writeJson(v2ResultPath(root, changeId, testDesignCheck.runId, 'check'), omittedTestDesignRisks);
  assert.match(
    validateDesignStageGate(root, changeId).join('\n'),
    /canonical rubrics.*authority-derived/iu,
    'completion must reject a test-design review that omits classification-required risk rubrics',
  );
  writeJson(testDesignCheck.path, testDesignCheck.input);
  writeJson(v2ResultPath(root, changeId, testDesignCheck.runId, 'check'), testDesignReview);

  assert.throws(
    () => buildDesignArchitectureProof(root, architectureResult, swappedArchitectureReview),
    /canonical.*design.*rubric|rubric.*design/iu,
    'ArchitectureProof construction must independently enforce the design rubric family',
  );
  assert.throws(
    () => buildCompoundDesignProof(root, architectureProof, testDesignResult, swappedTestDesignReview),
    /canonical.*test-design.*rubric|rubric.*test-design/iu,
    'compound DesignProof construction must independently enforce the test-design rubric family',
  );
  assert.throws(
    () => buildDesignArchitectureProof(root, architectureResult, omittedArchitectureRisks),
    /canonical rubrics.*authority-derived/iu,
    'ArchitectureProof must reject omitted classification-required risk rubrics',
  );
  assert.throws(
    () => buildCompoundDesignProof(root, architectureProof, testDesignResult, omittedTestDesignRisks),
    /canonical rubrics.*authority-derived/iu,
    'compound DesignProof must reject omitted classification-required risk rubrics',
  );

  const expandedArchitectureTecpc = {
    ...architectureExecute.input.tecpc,
    evidence: [...architectureExecute.input.tecpc.evidence, ...architectureCheck.input.tecpc.evidence],
    context: [...architectureExecute.input.tecpc.context, ...architectureCheck.input.tecpc.context],
  };
  writeJson(architectureExecute.path, { ...architectureExecute.input, tecpc: expandedArchitectureTecpc });
  writeJson(v2ResultPath(root, changeId, architectureExecute.runId), {
    ...architectureResult,
    tecpc: expandedArchitectureTecpc,
  });
  const architectureCollisionProblems = validateDesignStageGate(root, changeId);
  writeJson(architectureExecute.path, architectureExecute.input);
  writeJson(v2ResultPath(root, changeId, architectureExecute.runId), architectureResult);

  const expandedTestDesignTecpc = {
    ...testDesignExecute.input.tecpc,
    evidence: [...testDesignExecute.input.tecpc.evidence, ...testDesignCheck.input.tecpc.evidence],
    context: [...testDesignExecute.input.tecpc.context, ...testDesignCheck.input.tecpc.context],
  };
  writeJson(testDesignExecute.path, { ...testDesignExecute.input, tecpc: expandedTestDesignTecpc });
  writeJson(v2ResultPath(root, changeId, testDesignExecute.runId), {
    ...testDesignResult,
    tecpc: expandedTestDesignTecpc,
  });
  const testDesignCollisionProblems = validateDesignStageGate(root, changeId);
  writeJson(testDesignExecute.path, testDesignExecute.input);
  writeJson(v2ResultPath(root, changeId, testDesignExecute.runId), testDesignResult);
  assert.deepEqual(
    [
      architectureCollisionProblems.some((problem) => /architecture proof does not exactly bind the canonical architecture chain/iu.test(problem)),
      testDesignCollisionProblems.some((problem) => /design CompletionProof does not exactly bind canonical result, TECPC, artifacts, and run IDs/u.test(problem)),
    ],
    [true, true],
    'existing proofs must not survive architecture or test-design TECPC provenance collisions',
  );

  const tecpcMutations = [
    [
      v2ResultPath(root, changeId, architectureExecute.runId),
      architectureResult,
      { ...architectureResult, tecpc: { ...architectureResult.tecpc, target: 'tampered architecture result' } },
    ],
    [
      v2ResultPath(root, changeId, architectureCheck.runId, 'check'),
      architectureReview,
      { ...architectureReview, tecpc: { ...architectureReview.tecpc, target: 'tampered architecture review' } },
    ],
    [
      v2ResultPath(root, changeId, testDesignExecute.runId),
      testDesignResult,
      { ...testDesignResult, tecpc: { ...testDesignResult.tecpc, target: 'tampered test-design result' } },
    ],
    [
      v2ResultPath(root, changeId, testDesignCheck.runId, 'check'),
      testDesignReview,
      { ...testDesignReview, tecpc: { ...testDesignReview.tecpc, target: 'tampered test-design review' } },
    ],
  ];
  const tecpcGateProblems = [];
  for (const [resultPath, original, mutation] of tecpcMutations) {
    writeJson(resultPath, mutation);
    tecpcGateProblems.push(validateDesignStageGate(root, changeId));
    writeJson(resultPath, original);
  }
  assert.deepEqual(
    tecpcGateProblems.map((problems) => problems.some((problem) => /TECPC does not match (?:execute|check) handoff/u.test(problem))),
    [true, true, true, true],
    'every architecture/test-design result TECPC must exactly match its frozen handoff TECPC',
  );

  const architectureProofPath = path.join(root, architectureProofRef);
  writeJson(architectureProofPath, {
    ...architectureProof,
    artifacts: [{ ...architectureProof.artifacts[0], digest: 'f'.repeat(64) }],
  });
  assert.match(validateDesignStageGate(root, changeId).join('\n'), /architecture.*digest|stale/iu);
  writeJson(architectureProofPath, architectureProof);

  const originalDesign = fs.readFileSync(path.join(root, designRef), 'utf-8');
  fs.appendFileSync(path.join(root, designRef), '\nmutated\n');
  assert.match(validateDesignStageGate(root, changeId).join('\n'), /stale|digest/iu);
  fs.writeFileSync(path.join(root, designRef), originalDesign);

  const originalCases = fs.readFileSync(path.join(root, testCasesRef), 'utf-8');
  fs.appendFileSync(path.join(root, testCasesRef), '\nmutated\n');
  assert.match(validateDesignStageGate(root, changeId).join('\n'), /stale|digest/iu);
  fs.writeFileSync(path.join(root, testCasesRef), originalCases);

  writeJson(v2ResultPath(root, changeId, architectureCheck.runId, 'check'), {
    ...architectureReview,
    verdict: 'block',
    correction: 'repair architecture',
  });
  assert.match(validateDesignStageGate(root, changeId).join('\n'), /ReviewResult did not pass/u);
  writeJson(v2ResultPath(root, changeId, architectureCheck.runId, 'check'), architectureReview);

  writeJson(v2ResultPath(root, changeId, testDesignCheck.runId, 'check'), {
    ...testDesignReview,
    verdict: 'block',
    correction: 'repair cases',
  });
  assert.match(validateDesignStageGate(root, changeId).join('\n'), /ReviewResult did not pass/u);
  writeJson(v2ResultPath(root, changeId, testDesignCheck.runId, 'check'), testDesignReview);

  writeJson(v2ResultPath(root, changeId, testDesignExecute.runId), {
    ...testDesignResult,
    producer: { agentType: 'enterprise-harness:artifact-worker', skill: 'design' },
  });
  assert.match(validateDesignStageGate(root, changeId).join('\n'), /producer does not match handoff agent/u);
  writeJson(v2ResultPath(root, changeId, testDesignExecute.runId), testDesignResult);

  const statePath = path.join(root, 'harness', 'changes', changeId, 'state.json');
  const classificationPath = path.join(root, classificationReference.path);
  const debtPath = path.join(root, 'harness', 'changes', changeId, 'debt-assessment.json');
  const authorityBaseline = {
    state: fs.readFileSync(statePath, 'utf-8'),
    classification: fs.readFileSync(classificationPath, 'utf-8'),
    debt: fs.readFileSync(debtPath, 'utf-8'),
  };
  const restoreAuthority = () => {
    fs.writeFileSync(statePath, authorityBaseline.state);
    fs.writeFileSync(classificationPath, authorityBaseline.classification);
    fs.writeFileSync(debtPath, authorityBaseline.debt);
  };
  const throwsAuthorityProblem = (operation) => {
    try {
      operation();
      return false;
    } catch (error) {
      assert.match(error.message, /classification authority|classification artifact|classification input/iu);
      return true;
    }
  };
  const authoritySurface = (label) => {
    const consumed = loadHandoffV2FromMarker(root, path.relative(root, architectureCheck.path));
    const gateProblems = validateDesignStageGate(root, changeId);
    const result = {
      handoffConsumption: !consumed.ok,
      completionGate: gateProblems.some((problem) => /classification authority|classification artifact|classification input/iu.test(problem)),
      architectureProof: throwsAuthorityProblem(() => (
        buildDesignArchitectureProof(root, architectureResult, architectureReview)
      )),
      compoundDesignProof: throwsAuthorityProblem(() => (
        buildCompoundDesignProof(root, architectureProof, testDesignResult, testDesignReview)
      )),
    };
    if (!consumed.ok) assert.match(consumed.problems.join('; '), /classification authority|classification artifact|classification input/iu, label);
    assert.deepEqual(result, {
      handoffConsumption: true,
      completionGate: true,
      architectureProof: true,
      compoundDesignProof: true,
    }, label);
  };
  const authorityMutations = [
    ['missing state', () => fs.rmSync(statePath)],
    ['malformed state', () => fs.writeFileSync(statePath, '{\n')],
    ['missing classification', () => fs.rmSync(classificationPath)],
    ['malformed classification', () => {
      fs.writeFileSync(classificationPath, '{\n');
      const state = JSON.parse(authorityBaseline.state);
      writeJson(statePath, {
        ...state,
        artifacts: {
          ...state.artifacts,
          classification: {
            ...state.artifacts.classification,
            digest: sha256Artifact(root, classificationReference.path),
          },
        },
      });
    }],
    ['classification digest mismatch', () => fs.appendFileSync(classificationPath, '\n')],
    ['stale classification input', () => fs.appendFileSync(debtPath, '\n')],
  ];
  for (const [label, mutate] of authorityMutations) {
    restoreAuthority();
    mutate();
    authoritySurface(label);
  }
  restoreAuthority();

  writeJson(v2ResultPath(root, changeId, testDesignCheck.runId, 'check'), {
    ...testDesignReview,
    parentRunId: architectureExecute.runId,
  });
  assert.match(validateDesignStageGate(root, changeId).join('\n'), /review must bind|does not bind/iu);

  console.log(`PASS design-compound-gate ${mode}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
