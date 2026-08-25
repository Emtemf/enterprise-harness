import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeClassificationV2Fixture as writeClassificationArtifact } from './classification-v2-fixture.mjs';
import { validateCompletionPredicate, validateState } from '../lib/checks.mjs';

const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const verifySource = fs.readFileSync(path.join(sourceRoot, 'runtime', 'verify.mjs'), 'utf-8');
assert.match(verifySource, /validateCompletionPredicate\(root, activeForCompletion\.changeId, activeForCompletion\.data\)/u);
assert.match(verifySource, /activeForCompletion\.data\.schemaVersion === 6/u);
assert.match(verifySource, /const developmentChangeProblems = releaseSurface\s*\? \[\]/u);

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'enterprise-harness-verify-v6-'));
const changeId = 'verify-v6-probe';
const changeDir = path.join(root, 'harness', 'changes', changeId);

try {
  fs.mkdirSync(changeDir, { recursive: true });
  const classification = writeClassificationArtifact(root, changeId, {
    impact: { api: 'no', data: 'no', architecture: 'yes', rule: 'yes', security: 'yes' },
  });
  fs.writeFileSync(path.join(changeDir, 'validation.md'), '# Validation\n');

  const staleVerify = {
    schemaVersion: 6,
    revision: 1,
    changeId,
    lifecycle: 'active',
    stage: 'verify',
    artifacts: { classification },
    validation: { status: 'stale', digest: null, validatedAt: null },
  };
  const verifyStateProblems = validateState(root, changeId, staleVerify).map((item) => `${item.code}:${item.message}`);
  assert.ok(
    verifyStateProblems.some((problem) => problem.includes('EH-COMPLETION-FRESHNESS-103')),
    `expected freshness blocker, got ${JSON.stringify(verifyStateProblems)}`,
  );

  const badLifecycle = {
    ...staleVerify,
    lifecycle: 'paused',
  };
  const lifecycleProblems = validateState(root, changeId, badLifecycle).map((item) => `${item.code}:${item.message}`);
  assert.ok(
    lifecycleProblems.some((problem) => problem.includes('EH-COMPLETION-STATE-101')),
    `expected lifecycle blocker, got ${JSON.stringify(lifecycleProblems)}`,
  );

  const badStage = {
    ...staleVerify,
    stage: 'design',
  };
  const stageProblems = validateState(root, changeId, badStage).map((item) => `${item.code}:${item.message}`);
  assert.ok(
    stageProblems.some((problem) => problem.includes('EH-COMPLETION-STATE-101')),
    `expected stage blocker, got ${JSON.stringify(stageProblems)}`,
  );

  const completionProblems = validateCompletionPredicate(root, changeId, staleVerify);
  assert.ok(completionProblems.length > 0, 'stale v6 verify change must fail completion predicate');
  assert.ok(
    completionProblems.some((problem) => /EH-COMPLETION-FRESHNESS-103|EH-COMPLETION-STATE-101/u.test(problem)),
    `expected completion blockers, got ${JSON.stringify(completionProblems)}`,
  );

  const releaseSurfaceProblems = validateState(root, changeId, {
    schemaVersion: 6,
    revision: 1,
    changeId,
    lifecycle: 'active',
    stage: 'verify',
    artifacts: { classification },
    validation: { status: 'fresh', digest: 'f'.repeat(64), validatedAt: '2026-08-18T00:00:00.000Z' },
  }).map((item) => `${item.code}:${item.message}`);
  assert.ok(
    !releaseSurfaceProblems.some((problem) => problem.includes('EH-COMPLETION-STATE-101')),
    `fresh v6 verify should not fail state gate, got ${JSON.stringify(releaseSurfaceProblems)}`,
  );

  console.log(`PASS checks-v6-completion ${mode}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
