import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { routeIdentityValid, modelIdentityValid } from '../../benchmarks/model-uplift-v1/lib/model-identity.mjs';
import { validatePreflightReceipt } from '../../benchmarks/model-uplift-v1/lib/preflight-receipt.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const benchmark = path.join(root, 'benchmarks/model-uplift-v1');
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-model-uplift-smoke-'));
const matrix = JSON.parse(fs.readFileSync(path.join(benchmark, 'matrix.json'), 'utf-8'));
const businessProtocol = JSON.parse(fs.readFileSync(path.join(benchmark, 'business-evaluation.json'), 'utf-8'));

assert.deepEqual(matrix.arms.map(({ id }) => id), ['weak-harness', 'hybrid-harness', 'weak-bare', 'strong-bare', 'strong-harness']);
assert.deepEqual(matrix.comparisons.map(({ id }) => id), [
  'weak-workflow-uplift', 'weak-model-substitution', 'strong-workflow-uplift', 'hybrid-model-substitution',
]);
assert.equal(businessProtocol.publicationGate.minimumDistinctCases, 5);
assert.equal(businessProtocol.publicationGate.minimumPairedObservationsPerComparison, 20);
assert.ok(businessProtocol.decisionHierarchy.resourceOnly.includes('input_tokens'));
assert.ok(businessProtocol.tracks.some(({ id }) => id === 'clarification'));

const modelRoutes = {
  haiku: { messageModelFamilies: ['glm-5.1'], billingModelFamilies: ['haiku'] },
  sonnet: { messageModelFamilies: ['glm-5.2'], billingModelFamilies: ['sonnet'] },
};
const bareWeak = { id: 'weak-bare', controllerRoute: 'haiku', workerRoutes: [] };
const harnessWeak = { id: 'weak-harness', controllerRoute: 'haiku', workerRoutes: ['haiku'] };
const harnessHybrid = { id: 'hybrid-harness', controllerRoute: 'haiku', workerRoutes: ['sonnet'] };
assert.equal(routeIdentityValid(modelRoutes.haiku, ['glm-5.1'], ['claude-haiku-4-5']), true);
assert.equal(routeIdentityValid(modelRoutes.haiku, ['glm-5.2'], ['claude-haiku-4-5']), false);
assert.equal(modelIdentityValid(bareWeak, modelRoutes, ['claude-haiku-4-5'], ['glm-5.1']), true);
assert.equal(modelIdentityValid(bareWeak, modelRoutes, ['claude-haiku-4-5'], ['glm-5.2']), false);
assert.equal(modelIdentityValid(harnessWeak, modelRoutes, ['claude-haiku-4-5'], ['glm-5.1'], ['glm-5.1']), true);
assert.equal(modelIdentityValid(harnessWeak, modelRoutes, ['claude-haiku-4-5'], ['glm-5.1'], []), false);
assert.equal(modelIdentityValid(harnessHybrid, modelRoutes, ['claude-haiku-4-5', 'claude-sonnet-4-6'], ['glm-5.1'], ['glm-5.2']), true);
const receiptNow = Date.parse('2026-09-10T00:00:00Z');
const validReceipt = {
  status: 'pass', generatedAt: '2026-09-10T00:00:00Z', expiresAfterHours: 24,
  claudeCodeVersion: '2.1.263', environmentFingerprint: 'env-digest', routingProfile: 'cc-switch-glm-5.1-vs-5.2',
  probes: ['haiku', 'sonnet'].map((requestedModel) => ({ requestedModel, identityValid: true, complete: true, exitCode: 0 })),
};
assert.equal(validatePreflightReceipt(validReceipt, {
  expectedModels: new Set(['haiku', 'sonnet']), environmentFingerprint: 'env-digest', claudeCodeVersion: '2.1.263', now: receiptNow,
}), validReceipt);
assert.throws(() => validatePreflightReceipt({ ...validReceipt, generatedAt: '2026-09-08T00:00:00Z' }, {
  expectedModels: new Set(['haiku']), environmentFingerprint: 'env-digest', claudeCodeVersion: '2.1.263', now: receiptNow,
}), /expired/u);
assert.throws(() => validatePreflightReceipt(validReceipt, {
  expectedModels: new Set(['haiku']), environmentFingerprint: 'changed', claudeCodeVersion: '2.1.263', now: receiptNow,
}), /routing environment/u);

try {
  fs.mkdirSync(path.join(fixture, 'src'), { recursive: true });
  fs.copyFileSync(path.join(benchmark, 'reference/order-service.mjs'), path.join(fixture, 'src/order-service.mjs'));
  let result = spawnSync(process.execPath, [path.join(benchmark, 'grade.mjs'), fixture], { encoding: 'utf-8', shell: false });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const good = JSON.parse(result.stdout.trim());
  assert.equal(good.passed, 7);
  assert.equal(good.scorePercent, 100);

  const brokenPath = path.join(fixture, 'src/order-service.mjs');
  fs.writeFileSync(brokenPath, fs.readFileSync(brokenPath, 'utf-8').replace("throw new DomainError('ORDER_NOT_FOUND')", "throw new DomainError('WRONG_CODE')"));
  result = spawnSync(process.execPath, [path.join(benchmark, 'grade.mjs'), fixture], { encoding: 'utf-8', shell: false });
  assert.notEqual(result.status, 0, 'hidden grader must reject a broken business error contract');
  const broken = JSON.parse(result.stdout.trim());
  assert.equal(broken.results.find(({ id }) => id === 'unknown-order').pass, false);

  fs.copyFileSync(path.join(benchmark, 'reference/webhook-verifier.mjs'), path.join(fixture, 'src/webhook-verifier.mjs'));
  result = spawnSync(process.execPath, [path.join(benchmark, 'grade-webhook.mjs'), fixture], { encoding: 'utf-8', shell: false });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const webhook = JSON.parse(result.stdout.trim());
  assert.equal(webhook.passed, 7);
  assert.equal(webhook.scorePercent, 100);

  fs.mkdirSync(path.join(fixture, 'migrations'), { recursive: true });
  fs.copyFileSync(path.join(benchmark, 'reference/subscription-service.mjs'), path.join(fixture, 'src/subscription-service.mjs'));
  fs.copyFileSync(path.join(benchmark, 'reference/002_plan_change_requests.sql'), path.join(fixture, 'migrations/002_plan_change_requests.sql'));
  fs.copyFileSync(path.join(benchmark, 'reference/002_plan_change_requests.down.sql'), path.join(fixture, 'migrations/002_plan_change_requests.down.sql'));
  result = spawnSync(process.execPath, [path.join(benchmark, 'grade-subscription.mjs'), fixture], { encoding: 'utf-8', shell: false });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const subscription = JSON.parse(result.stdout.trim());
  assert.equal(subscription.passed, 7);
  assert.equal(subscription.scorePercent, 100);

  result = spawnSync(process.execPath, [path.join(benchmark, 'run.mjs'), '--help'], { encoding: 'utf-8', shell: false });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /--invocation-timeout-ms/u);
  assert.match(result.stdout, /--preflight-receipt/u);
  result = spawnSync(process.execPath, [path.join(benchmark, 'run.mjs'), '--case', 'all'], { encoding: 'utf-8', shell: false });
  assert.notEqual(result.status, 0, 'formal all-case matrix must require a preflight receipt');
  assert.match(result.stderr, /requires --preflight-receipt/u);

  const rawPath = path.join(fixture, 'raw.json');
  const summaryPath = path.join(fixture, 'summary.json');
  const record = (armId, repetition, effectScore, costUsd, accepted = true) => ({
    armId, caseId: `case-${((repetition - 1) % 5) + 1}`, repetition, completedArchive: armId === 'weak-harness',
    grade: { accepted, effectScore }, totals: { costUsd, durationMs: 1 },
    costAuthority: 'provider-billing', providerCostUsd: costUsd,
  });
  const records = Array.from({ length: 19 }, (_, index) => index + 1).flatMap((repetition) => [
    record('weak-harness', repetition, 90, 0.3),
    record('weak-bare', repetition, 70, 0.1, false),
    record('hybrid-harness', repetition, 95, 0.4),
    record('strong-bare', repetition, 90, 0.8),
    record('strong-harness', repetition, 100, 1.0),
  ]);
  const comparisons = [
    { id: 'weak-workflow-uplift', treatmentArm: 'weak-harness', controlArm: 'weak-bare', minimumEffectGapPp: 0, strictEffectGate: true },
    { id: 'weak-model-substitution', treatmentArm: 'weak-harness', controlArm: 'strong-bare', minimumEffectGapPp: -5 },
    { id: 'strong-workflow-uplift', treatmentArm: 'strong-harness', controlArm: 'strong-bare', minimumEffectGapPp: 0, strictEffectGate: true },
    { id: 'hybrid-model-substitution', treatmentArm: 'hybrid-harness', controlArm: 'strong-bare', minimumEffectGapPp: -5, economicComparison: true },
  ];
  const raw = () => ({ comparisons, records });
  fs.writeFileSync(rawPath, `${JSON.stringify(raw())}\n`);
  result = spawnSync(process.execPath, [path.join(benchmark, 'summarize.mjs'), rawPath, summaryPath], { encoding: 'utf-8', shell: false });
  assert.equal(result.status, 0, result.stderr);
  let summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
  assert.equal(summary.comparisons[0].decision.eligibleForEffectClaim, false, 'nineteen pairs must remain diagnostic');
  assert.equal(summary.comparisons[0].decision.diagnostic.diagnosticEligible, true);
  assert.equal(summary.decision.publishableEffectStory, false);

  records.push(
    record('weak-harness', 20, 90, 0.3),
    record('weak-bare', 20, 70, 0.1, false),
    record('hybrid-harness', 20, 95, 0.4),
    record('strong-bare', 20, 90, 0.8),
    record('strong-harness', 20, 100, 1.0),
  );
  fs.writeFileSync(rawPath, `${JSON.stringify(raw())}\n`);
  result = spawnSync(process.execPath, [path.join(benchmark, 'summarize.mjs'), rawPath, summaryPath], { encoding: 'utf-8', shell: false });
  assert.equal(result.status, 0, result.stderr);
  summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
  assert.equal(summary.decision.publishableEffectStory, true);
  assert.equal(summary.decision.publishableEconomicAdvantage, true);
  assert.equal(summary.decision.publishableCombinedClaim, true);
  assert.equal(summary.comparisons.find(({ id }) => id === 'weak-model-substitution').decision.diagnostic.bootstrap.effectGapMeanLower95Pp, 0);
  assert.equal(summary.comparisons.find(({ id }) => id === 'hybrid-model-substitution').decision.diagnostic.bootstrap.costPerAcceptedRatioUpper95, 0.5);

  records[0] = { ...records[0], grade: { accepted: true, effectScore: 0 } };
  fs.writeFileSync(rawPath, `${JSON.stringify(raw())}\n`);
  result = spawnSync(process.execPath, [path.join(benchmark, 'summarize.mjs'), rawPath, summaryPath], { encoding: 'utf-8', shell: false });
  assert.equal(result.status, 0, result.stderr);
  summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
  assert.equal(summary.decision.publishableEffectStory, false, 'an uncertain effect lower bound must block the claim');

  records[0] = { ...records[0], measurementValid: false, totals: { ...records[0].totals, costUsd: null }, providerCostUsd: null };
  fs.writeFileSync(rawPath, `${JSON.stringify(raw())}\n`);
  result = spawnSync(process.execPath, [path.join(benchmark, 'summarize.mjs'), rawPath, summaryPath], { encoding: 'utf-8', shell: false });
  assert.equal(result.status, 0, result.stderr);
  summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
  assert.equal(summary.comparisons.find(({ id }) => id === 'weak-workflow-uplift').decision.eligibleForEffectClaim, false, 'incomplete result must block an effect claim');
  assert.equal(summary.decision.publishableEffectStory, false);
  assert.equal(summary.arms.find(({ armId }) => armId === 'weak-harness').costPerAcceptedChange, null);

  const identityRecords = Array.from({ length: 20 }, (_, index) => index + 1).flatMap((repetition) => [
    { ...record('weak-harness', repetition, 100, 0.4), modelIdentityValid: repetition !== 1 },
    record('strong-bare', repetition, 100, 0.8),
  ]);
  const identityComparison = [{ id: 'identity-check', treatmentArm: 'weak-harness', controlArm: 'strong-bare', minimumEffectGapPp: -5 }];
  fs.writeFileSync(rawPath, `${JSON.stringify({ comparisons: identityComparison, records: identityRecords })}\n`);
  result = spawnSync(process.execPath, [path.join(benchmark, 'summarize.mjs'), rawPath, summaryPath], { encoding: 'utf-8', shell: false });
  assert.equal(result.status, 0, result.stderr);
  summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
  assert.equal(summary.comparisons[0].decision.eligibleForEffectClaim, false, 'model identity conflict must block an effect claim');

  const noProviderCost = identityRecords.map((item) => ({ ...item, modelIdentityValid: true, costAuthority: 'claude-code-alias-estimate', providerCostUsd: null }));
  fs.writeFileSync(rawPath, `${JSON.stringify({ comparisons: [{ ...identityComparison[0], economicComparison: true }], records: noProviderCost })}\n`);
  result = spawnSync(process.execPath, [path.join(benchmark, 'summarize.mjs'), rawPath, summaryPath], { encoding: 'utf-8', shell: false });
  assert.equal(result.status, 0, result.stderr);
  summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
  assert.equal(summary.comparisons[0].decision.publishableEffect, true, 'effect claim must not require provider pricing');
  assert.equal(summary.comparisons[0].decision.eligibleForEconomicClaim, false, 'Claude alias estimates must not qualify as provider cost');
  assert.equal(summary.comparisons[0].decision.publishableEconomics, false);
  console.log('PASS model-uplift-benchmark smoke');
} finally {
  fs.rmSync(fixture, { recursive: true, force: true });
}
