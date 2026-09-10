import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { controllerIdentityValid, modelIdentityValid } from '../../benchmarks/model-uplift-v1/lib/model-identity.mjs';
import { validatePreflightReceipt } from '../../benchmarks/model-uplift-v1/lib/preflight-receipt.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const benchmark = path.join(root, 'benchmarks/model-uplift-v1');
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-model-uplift-smoke-'));

const bareHaiku = { id: 'haiku-bare', model: 'haiku', controllerModelFamily: 'haiku', workerModelFamilies: [] };
const harnessHaiku = { id: 'haiku-harness', model: 'haiku', controllerModelFamily: 'haiku', workerModelFamilies: ['sonnet'] };
assert.equal(controllerIdentityValid(bareHaiku, ['claude-haiku-4-5'], ['claude-haiku-4-5']), true);
assert.equal(controllerIdentityValid(bareHaiku, ['glm-5.1'], ['claude-haiku-4-5']), false);
assert.equal(modelIdentityValid(bareHaiku, ['claude-haiku-4-5'], ['claude-haiku-4-5']), true);
assert.equal(modelIdentityValid(bareHaiku, ['claude-haiku-4-5'], ['glm-5.1']), false);
assert.equal(modelIdentityValid(harnessHaiku, ['claude-haiku-4-5', 'claude-sonnet-5'], ['claude-haiku-4-5'], ['claude-sonnet-5']), true);
assert.equal(modelIdentityValid(harnessHaiku, ['claude-haiku-4-5'], ['claude-haiku-4-5'], []), false);
const receiptNow = Date.parse('2026-09-10T00:00:00Z');
const validReceipt = {
  status: 'pass', generatedAt: '2026-09-10T00:00:00Z', expiresAfterHours: 24,
  claudeCodeVersion: '2.1.263', environmentFingerprint: 'env-digest',
  probes: ['haiku', 'sonnet', 'opus'].map((requestedModel) => ({ requestedModel, identityValid: true, complete: true, exitCode: 0 })),
};
assert.equal(validatePreflightReceipt(validReceipt, {
  expectedModels: new Set(['haiku', 'sonnet', 'opus']), environmentFingerprint: 'env-digest', claudeCodeVersion: '2.1.263', now: receiptNow,
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
    armId, caseId: 'case', repetition, completedArchive: armId === 'haiku-harness',
    grade: { accepted, effectScore }, totals: { costUsd, durationMs: 1 },
  });
  const records = Array.from({ length: 9 }, (_, index) => index + 1).flatMap((repetition) => [
    record('haiku-harness', repetition, 100, 0.4),
    record('haiku-bare', repetition, 70, 0.1, false),
    record('opus-bare', repetition, 100, 0.8),
  ]);
  fs.writeFileSync(rawPath, `${JSON.stringify({ records })}\n`);
  result = spawnSync(process.execPath, [path.join(benchmark, 'summarize.mjs'), rawPath, summaryPath], { encoding: 'utf-8', shell: false });
  assert.equal(result.status, 0, result.stderr);
  let summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
  assert.equal(summary.decision.eligibleForPublicClaim, false, 'nine pairs must remain diagnostic');
  assert.equal(summary.decision.publishableModelUplift, false);

  records.push(record('haiku-harness', 10, 100, 0.4), record('haiku-bare', 10, 70, 0.1, false), record('opus-bare', 10, 100, 0.8));
  fs.writeFileSync(rawPath, `${JSON.stringify({ records })}\n`);
  result = spawnSync(process.execPath, [path.join(benchmark, 'summarize.mjs'), rawPath, summaryPath], { encoding: 'utf-8', shell: false });
  assert.equal(result.status, 0, result.stderr);
  summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
  assert.equal(summary.decision.eligibleForPublicClaim, true);
  assert.equal(summary.decision.publishableModelUplift, true);
  assert.equal(summary.decision.diagnostic.bootstrap.effectGapMeanLower95Pp, 0);
  assert.equal(summary.decision.diagnostic.bootstrap.costPerAcceptedRatioUpper95, 0.5);

  records[0] = { ...records[0], grade: { accepted: true, effectScore: 0 } };
  fs.writeFileSync(rawPath, `${JSON.stringify({ records })}\n`);
  result = spawnSync(process.execPath, [path.join(benchmark, 'summarize.mjs'), rawPath, summaryPath], { encoding: 'utf-8', shell: false });
  assert.equal(result.status, 0, result.stderr);
  summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
  assert.equal(summary.decision.publishableModelUplift, false, 'an uncertain effect lower bound must block the claim');

  records[0] = { ...records[0], measurementValid: false, totals: { ...records[0].totals, costUsd: null } };
  fs.writeFileSync(rawPath, `${JSON.stringify({ records })}\n`);
  result = spawnSync(process.execPath, [path.join(benchmark, 'summarize.mjs'), rawPath, summaryPath], { encoding: 'utf-8', shell: false });
  assert.equal(result.status, 0, result.stderr);
  summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
  assert.equal(summary.decision.eligibleForPublicClaim, false, 'incomplete billing must block a public claim');
  assert.equal(summary.decision.publishableModelUplift, false);
  assert.equal(summary.arms.find(({ armId }) => armId === 'haiku-harness').costPerAcceptedChange, null);

  const identityRecords = Array.from({ length: 10 }, (_, index) => index + 1).flatMap((repetition) => [
    { ...record('haiku-harness', repetition, 100, 0.4), modelIdentityValid: repetition !== 1 },
    record('opus-bare', repetition, 100, 0.8),
  ]);
  fs.writeFileSync(rawPath, `${JSON.stringify({ records: identityRecords })}\n`);
  result = spawnSync(process.execPath, [path.join(benchmark, 'summarize.mjs'), rawPath, summaryPath], { encoding: 'utf-8', shell: false });
  assert.equal(result.status, 0, result.stderr);
  summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
  assert.equal(summary.decision.eligibleForPublicClaim, false, 'model identity conflict must block a public claim');
  console.log('PASS model-uplift-benchmark smoke');
} finally {
  fs.rmSync(fixture, { recursive: true, force: true });
}
