import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const root = fileURLToPath(new URL('../../', import.meta.url));
const schemas = [
  ['research-packet.schema.json', 'research-packet'],
  ['stage-result.schema.json', 'stage-result'],
  ['review-result.schema.json', 'review-result'],
  ['tecpc.schema.json', null],
  ['handoff-v2.schema.json', null],
  ['completion-proof.schema.json', 'completion-proof'],
  ['waiver.schema.json', null],
  ['task-execution-receipt.schema.json', null],
  ['state.schema.json', null],
];

const clarifySchemas = [
  'lane-applicability-input.schema.json',
  'question-candidate.schema.json',
  'decision-event.schema.json',
  'clarify-decision-snapshot.schema.json',
  'debt-assessment.schema.json',
  'project-contract-assessment.schema.json',
  'classification.schema.json',
];

for (const name of clarifySchemas) {
  assert.ok(fs.existsSync(path.join(root, 'harness', 'schemas', name)), `missing ${name}`);
}

for (const [name, type] of schemas) {
  const schema = JSON.parse(fs.readFileSync(path.join(root, 'harness', 'schemas', name), 'utf-8'));
  assert.equal(schema.type, 'object', `${name} must define an object`);
  assert.equal(schema.additionalProperties, false, `${name} must reject unknown fields`);
  if (type) assert.equal(schema.properties?.type?.const, type, `${name} must pin its type`);
}

const schemaDir = path.join(root, 'harness', 'schemas');
const completionProofSchema = JSON.parse(fs.readFileSync(path.join(schemaDir, 'completion-proof.schema.json'), 'utf-8'));
const laneApplicabilityInputSchema = JSON.parse(fs.readFileSync(path.join(schemaDir, 'lane-applicability-input.schema.json'), 'utf-8'));
const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: false });
ajv.addSchema(JSON.parse(fs.readFileSync(path.join(schemaDir, 'tecpc.schema.json'), 'utf-8')));
ajv.addSchema(JSON.parse(fs.readFileSync(path.join(schemaDir, 'waiver.schema.json'), 'utf-8')));
const validateCompletionProofSchema = ajv.compile(completionProofSchema);
const validateLaneApplicabilityInputSchema = ajv.compile(laneApplicabilityInputSchema);
const validateResearchPacketSchema = ajv.compile(
  JSON.parse(fs.readFileSync(path.join(schemaDir, 'research-packet.schema.json'), 'utf-8')),
);
for (const examplePath of [
  'skills/explore-code/references/research-packet.example.json',
  'skills/research-docs/references/research-packet.example.json',
]) {
  const example = JSON.parse(fs.readFileSync(path.join(root, examplePath), 'utf-8'));
  assert.equal(
    validateResearchPacketSchema(example),
    true,
    `${examplePath} must satisfy research-packet.schema.json: ${JSON.stringify(validateResearchPacketSchema.errors)}`,
  );
}
const validLaneApplicabilityInput = {
  inputVersion: 1,
  type: 'lane-applicability-input',
  changeId: 'schema-clarify',
  requirementsRef: 'harness/changes/schema-clarify/requirements.md',
  requirementsDigest: '0'.repeat(64),
  lanes: {
    code: { selectedOption: 'required', publicRationale: '仓库行为在范围内。', evidenceRefs: ['harness/changes/schema-clarify/requirements.md'] },
    docs: { selectedOption: 'not-required', publicRationale: '不涉及外部版本化契约。', evidenceRefs: ['harness/changes/schema-clarify/requirements.md'] },
  },
};
assert.equal(validateLaneApplicabilityInputSchema(validLaneApplicabilityInput), true, JSON.stringify(validateLaneApplicabilityInputSchema.errors));
for (const [label, mutate] of [
  ['unknown lane input property', (candidate) => { candidate.unexpected = true; }],
  ['code lane not-required', (candidate) => { candidate.lanes.code.selectedOption = 'not-required'; }],
  ['unsafe requirements reference', (candidate) => { candidate.requirementsRef = '../requirements.md'; }],
]) {
  const candidate = structuredClone(validLaneApplicabilityInput);
  mutate(candidate);
  assert.equal(validateLaneApplicabilityInputSchema(candidate), false, `${label} must be rejected`);
}
const schemaChangeId = 'schema-clarify';
const canonicalArtifacts = [
  `harness/changes/${schemaChangeId}/requirements.md`,
  `harness/changes/${schemaChangeId}/classification.json`,
  `harness/changes/${schemaChangeId}/debt-assessment.json`,
  `harness/changes/${schemaChangeId}/project-contract-assessment.json`,
  `harness/changes/${schemaChangeId}/evidence/decisions/clarify-decision-snapshot.json`,
].map((artifactPath, index) => ({ path: artifactPath, digest: String(index + 1).repeat(64) }));
const assertionIds = [
  'research-complete',
  'decisions-durable',
  'technical-debt-disposed',
  'project-contract-disposed',
  'requirements-ready',
  'classification-ready',
  'scope-confirmed',
];
const validClarifyProof = {
  proofVersion: 1,
  type: 'completion-proof',
  changeId: schemaChangeId,
  stage: 'clarify',
  executionRunId: 'run_11111111-1111-4111-8111-111111111111',
  reviewRunId: 'run_22222222-2222-4222-8222-222222222222',
  artifacts: canonicalArtifacts,
  reviewedArtifacts: structuredClone(canonicalArtifacts),
  decisionSnapshotRef: structuredClone(canonicalArtifacts[4]),
  assertions: assertionIds.map((id) => ({ id, verdict: 'pass', evidence: [canonicalArtifacts[0].path] })),
  tecpc: {
    target: 'complete Clarify',
    evidence: canonicalArtifacts.map(({ path: artifactPath }) => artifactPath),
    context: [canonicalArtifacts[0].path],
    path: canonicalArtifacts.map(({ path: artifactPath }) => artifactPath).join(' -> '),
    correction: null,
  },
  target: 'complete Clarify',
  evidence: canonicalArtifacts.map(({ path: artifactPath }) => artifactPath),
  context: [canonicalArtifacts[0].path],
  path: canonicalArtifacts.map(({ path: artifactPath }) => artifactPath).join(' -> '),
  createdAt: '2026-08-25T00:00:00.000Z',
};

assert.equal(validateCompletionProofSchema(validClarifyProof), true, JSON.stringify(validateCompletionProofSchema.errors));

function assertClarifyProofSchemaRejects(label, mutate) {
  const candidate = structuredClone(validClarifyProof);
  mutate(candidate);
  assert.equal(validateCompletionProofSchema(candidate), false, `${label} must be rejected by completion-proof.schema.json`);
}

assertClarifyProofSchemaRejects('noncanonical artifact path', (proof) => {
  proof.artifacts[0].path = `harness/changes/${schemaChangeId}/notes.md`;
});
assertClarifyProofSchemaRejects('noncanonical reviewed artifact path', (proof) => {
  proof.reviewedArtifacts[1].path = `harness/changes/${schemaChangeId}/routing.json`;
});
assertClarifyProofSchemaRejects('noncanonical decision snapshot reference', (proof) => {
  proof.decisionSnapshotRef = structuredClone(proof.artifacts[1]);
});
assertClarifyProofSchemaRejects('missing canonical assertion ID', (proof) => {
  proof.assertions[0].id = 'generic-clarify';
});

const designArtifact = {
  path: `harness/changes/${schemaChangeId}/design.md`,
  digest: '8'.repeat(64),
};
const testCasesArtifact = {
  path: `harness/changes/${schemaChangeId}/test-cases.md`,
  digest: '9'.repeat(64),
};
const validDesignProof = {
  proofVersion: 1,
  type: 'completion-proof',
  changeId: schemaChangeId,
  stage: 'design',
  stageProofs: [
    {
      kind: 'architecture',
      executionRunId: 'run_33333333-3333-4333-8333-333333333333',
      reviewRunId: 'run_44444444-4444-4444-8444-444444444444',
      artifacts: [designArtifact],
    },
    {
      kind: 'test-design',
      executionRunId: 'run_55555555-5555-4555-8555-555555555555',
      reviewRunId: 'run_66666666-6666-4666-8666-666666666666',
      artifacts: [testCasesArtifact],
    },
  ],
  artifacts: [designArtifact, testCasesArtifact],
  waivers: [],
  target: 'complete Design',
  evidence: [designArtifact.path, testCasesArtifact.path],
  context: [validClarifyProof.artifacts[0].path],
  path: `${designArtifact.path} -> ${testCasesArtifact.path}`,
  createdAt: '2026-08-28T00:00:00.000Z',
};
assert.equal(validateCompletionProofSchema(validDesignProof), true, JSON.stringify(validateCompletionProofSchema.errors));
for (const field of ['executionRunId', 'reviewRunId', 'taskProofs']) {
  const candidate = structuredClone(validDesignProof);
  candidate[field] = field === 'taskProofs' ? [] : 'run_77777777-7777-4777-8777-777777777777';
  assert.equal(validateCompletionProofSchema(candidate), false, `Design proof must reject top-level ${field}`);
}
const missingTestDesign = structuredClone(validDesignProof);
missingTestDesign.stageProofs = [missingTestDesign.stageProofs[0]];
assert.equal(validateCompletionProofSchema(missingTestDesign), false, 'Design proof must require both stage proof kinds');
const duplicateArchitecture = structuredClone(validDesignProof);
duplicateArchitecture.stageProofs[1].kind = 'architecture';
assert.equal(validateCompletionProofSchema(duplicateArchitecture), false, 'Design proof must require exactly one stage proof of each kind');

const planArtifact = {
  path: `harness/changes/${schemaChangeId}/tasks.md`,
  digest: 'a'.repeat(64),
};
const validPlanProof = {
  proofVersion: 1,
  type: 'completion-proof',
  changeId: schemaChangeId,
  stage: 'plan',
  executionRunId: 'run_77777777-7777-4777-8777-777777777777',
  reviewRunId: 'run_88888888-8888-4888-8888-888888888888',
  artifacts: [planArtifact],
  target: 'complete Plan',
  evidence: [planArtifact.path],
  context: [designArtifact.path, testCasesArtifact.path],
  path: `${designArtifact.path} -> ${planArtifact.path}`,
  createdAt: '2026-08-28T00:00:01.000Z',
};
assert.equal(validateCompletionProofSchema(validPlanProof), true, JSON.stringify(validateCompletionProofSchema.errors));
for (const field of ['stageProofs', 'taskProofs']) {
  const candidate = structuredClone(validPlanProof);
  candidate[field] = field === 'stageProofs' ? validDesignProof.stageProofs : [];
  assert.equal(validateCompletionProofSchema(candidate), false, `non-Design proof must reject ${field}`);
}

const receiptArtifact = {
  path: `harness/changes/${schemaChangeId}/evidence/tasks/task-one.json`,
  digest: 'b'.repeat(64),
};
const validImplementProof = {
  proofVersion: 1,
  type: 'completion-proof',
  changeId: schemaChangeId,
  stage: 'implement',
  taskProofs: [{
    taskId: 'task-one',
    executionRunId: 'run_99999999-9999-4999-8999-999999999999',
    reviewRunId: 'run_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    artifacts: [receiptArtifact],
  }],
  artifacts: [receiptArtifact],
  target: 'complete Implement',
  evidence: [receiptArtifact.path],
  context: [planArtifact.path],
  path: `${planArtifact.path} -> task-one`,
  createdAt: '2026-08-28T00:00:02.000Z',
};
assert.equal(validateCompletionProofSchema(validImplementProof), true, JSON.stringify(validateCompletionProofSchema.errors));
for (const field of ['executionRunId', 'reviewRunId', 'stageProofs']) {
  const candidate = structuredClone(validImplementProof);
  candidate[field] = field === 'stageProofs'
    ? validDesignProof.stageProofs
    : 'run_bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  assert.equal(validateCompletionProofSchema(candidate), false, `Implement proof must reject ${field}`);
}

console.log(`PASS result-schema ${mode}`);
