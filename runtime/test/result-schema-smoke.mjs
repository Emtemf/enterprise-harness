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
const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: false });
ajv.addSchema(JSON.parse(fs.readFileSync(path.join(schemaDir, 'tecpc.schema.json'), 'utf-8')));
ajv.addSchema(JSON.parse(fs.readFileSync(path.join(schemaDir, 'waiver.schema.json'), 'utf-8')));
const validateCompletionProofSchema = ajv.compile(completionProofSchema);
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

console.log(`PASS result-schema ${mode}`);
