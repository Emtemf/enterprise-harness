import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHandoffV2 } from '../core/handoff-v2.mjs';
import { artifactDependencies } from '../lib/artifacts.mjs';

const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const sourceRoot = fileURLToPath(new URL('../../', import.meta.url));
const archiveFinalize = path.join(sourceRoot, 'skills/archive/scripts/finalize-result.mjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-test-cases-downstream-'));
const changeId = 'downstream-slice';
const base = `harness/changes/${changeId}`;
const validationRef = `${base}/validation.md`;
const verifyProofRef = `${base}/evidence/completion/verify.json`;
const testCasesRef = `${base}/test-cases.md`;
const designProofRef = `${base}/evidence/completion/design.json`;
const manifestRef = `${base}/evidence/archive-manifest.json`;

try {
  const graph = artifactDependencies();
  assert.deepEqual(graph.plan, ['design', 'testCases']);
  assert.deepEqual(graph.validation, ['requirements', 'design', 'testCases', 'plan', 'evidence']);

  fs.mkdirSync(path.join(root, base, 'evidence', 'completion'), { recursive: true });
  fs.writeFileSync(path.join(root, validationRef), '# Validation\n\n## Commands\n- node --test\n\n## Results\n- pass\n\n## Freshness\n- fresh\n\n## Coverage and exceptions\n- TC1 | executed | evidence/tasks/task-1.json\n');
  fs.writeFileSync(path.join(root, verifyProofRef), JSON.stringify({ type: 'completion-proof', stage: 'verify' }));
  fs.writeFileSync(path.join(root, testCasesRef), '# Test Cases\n');
  fs.writeFileSync(path.join(root, designProofRef), JSON.stringify({
    type: 'completion-proof', stage: 'design',
    stageProofs: [{ kind: 'test-design', executionRunId: 'run_test-design-execute', reviewRunId: 'run_test-design-review' }],
  }));
  const missingTestCases = createHandoffV2(root, {
    changeId,
    stage: 'archive',
    behavior: 'archive',
    agent: { type: 'enterprise-harness:artifact-worker', skill: 'archive' },
    inputRefs: [validationRef, verifyProofRef, testCasesRef, designProofRef],
    tecpc: { target: 'archive missing test cases', evidence: [validationRef, verifyProofRef], context: [testCasesRef, designProofRef], path: manifestRef, correction: null },
  });
  fs.renameSync(path.join(root, testCasesRef), path.join(root, `${testCasesRef}.missing`));
  const missing = spawnSync(process.execPath, [archiveFinalize, changeId, missingTestCases.runId], { cwd: root, encoding: 'utf-8', shell: false });
  assert.notEqual(missing.status, 0, 'archive must reject missing test-cases.md');
  assert.match(missing.stderr, /missing .*test-cases\.md/u);
  fs.renameSync(path.join(root, `${testCasesRef}.missing`), path.join(root, testCasesRef));
  const handoff = createHandoffV2(root, {
    changeId,
    stage: 'archive',
    behavior: 'archive',
    agent: { type: 'enterprise-harness:artifact-worker', skill: 'archive' },
    inputRefs: [validationRef, verifyProofRef, testCasesRef, designProofRef],
    tecpc: { target: 'archive downstream evidence', evidence: [validationRef, verifyProofRef], context: [testCasesRef, designProofRef], path: manifestRef, correction: null },
  });
  const result = spawnSync(process.execPath, [archiveFinalize, changeId, handoff.runId], { cwd: root, encoding: 'utf-8', shell: false });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(path.join(root, manifestRef)), true, 'archive must persist one manifest that traces test cases and DesignProof');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, manifestRef), 'utf-8'));
  assert.equal(manifest.testCases.path, testCasesRef);
  assert.equal(manifest.designProof.path, designProofRef);
  assert.ok(manifest.testDesign.executionRunId);
  assert.ok(manifest.testDesign.reviewRunId);
  console.log(`PASS test-cases-downstream-binding ${mode}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
