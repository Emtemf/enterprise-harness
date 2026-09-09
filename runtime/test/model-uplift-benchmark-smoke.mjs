import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const benchmark = path.join(root, 'benchmarks/model-uplift-v1');
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-model-uplift-smoke-'));

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
  console.log('PASS model-uplift-benchmark smoke');
} finally {
  fs.rmSync(fixture, { recursive: true, force: true });
}
