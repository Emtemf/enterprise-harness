#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const [rawPath, outputPath] = process.argv.slice(2);
if (!rawPath || !outputPath) {
  console.error('Usage: node summarize.mjs <raw-results.json> <summary.json>');
  process.exit(2);
}
const raw = JSON.parse(fs.readFileSync(path.resolve(rawPath), 'utf-8'));
const byArm = new Map();
for (const record of raw.records || []) {
  const rows = byArm.get(record.armId) || [];
  rows.push(record);
  byArm.set(record.armId, rows);
}
const median = (values) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
const percentile = (values, probability) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) * probability)];
};
const seededRandom = (initialSeed) => {
  let seed = initialSeed >>> 0;
  return () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 0x100000000;
  };
};
const bootstrapPairedDecision = (pairs, iterations = 10_000) => {
  if (pairs.length === 0 || pairs.some(({ measurementValid }) => !measurementValid)) {
    return { iterations, effectGapMeanLower95Pp: null, costPerAcceptedRatioUpper95: null };
  }
  const random = seededRandom(0x45485631);
  const effectMeans = [];
  const costRatios = [];
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const sample = Array.from({ length: pairs.length }, () => pairs[Math.floor(random() * pairs.length)]);
    effectMeans.push(mean(sample.map(({ effectGapPp }) => effectGapPp)));
    const treatmentAccepted = sample.filter(({ treatmentAccepted: accepted }) => accepted).length;
    const controlAccepted = sample.filter(({ controlAccepted: accepted }) => accepted).length;
    const treatmentCostPerAccepted = treatmentAccepted === 0
      ? Number.POSITIVE_INFINITY
      : sample.reduce((sum, { treatmentCostUsd }) => sum + treatmentCostUsd, 0) / treatmentAccepted;
    const controlCostPerAccepted = controlAccepted === 0
      ? Number.POSITIVE_INFINITY
      : sample.reduce((sum, { controlCostUsd }) => sum + controlCostUsd, 0) / controlAccepted;
    costRatios.push(Number.isFinite(treatmentCostPerAccepted) && Number.isFinite(controlCostPerAccepted)
      ? treatmentCostPerAccepted / controlCostPerAccepted
      : Number.POSITIVE_INFINITY);
  }
  const costUpper = percentile(costRatios, 0.975);
  return {
    iterations,
    effectGapMeanLower95Pp: percentile(effectMeans, 0.025),
    costPerAcceptedRatioUpper95: Number.isFinite(costUpper) ? costUpper : null,
  };
};
const arms = [...byArm].map(([armId, rows]) => {
  const accepted = rows.filter((row) => row.grade.accepted);
  const measuredCosts = rows.map((row) => row.totals.costUsd).filter((value) => Number.isFinite(value));
  const completeCost = measuredCosts.length === rows.length;
  return {
    armId,
    runs: rows.length,
    acceptedRuns: accepted.length,
    acceptanceRate: accepted.length / rows.length,
    effectScoreMedian: median(rows.map((row) => row.grade.effectScore)),
    measurementValidRuns: rows.filter((row) => row.measurementValid !== false && Number.isFinite(row.totals.costUsd)).length,
    costUsdMedian: completeCost ? median(measuredCosts) : null,
    costPerAcceptedChange: accepted.length === 0 || !completeCost
      ? null
      : measuredCosts.reduce((sum, value) => sum + value, 0) / accepted.length,
    durationMsMedian: median(rows.map((row) => row.totals.durationMs)),
    completedArchiveRate: rows.filter((row) => row.completedArchive).length / rows.length,
  };
});
const treatment = byArm.get('haiku-harness') || [];
const control = byArm.get('opus-bare') || [];
const pairs = treatment.flatMap((left) => {
  const right = control.find((candidate) => candidate.caseId === left.caseId && candidate.repetition === left.repetition);
  return right ? [{
    caseId: left.caseId,
    repetition: left.repetition,
    measurementValid: left.measurementValid !== false && right.measurementValid !== false
      && left.modelIdentityValid !== false && right.modelIdentityValid !== false
      && Number.isFinite(left.totals.costUsd) && Number.isFinite(right.totals.costUsd),
    effectGapPp: left.grade.effectScore - right.grade.effectScore,
    treatmentAccepted: left.grade.accepted,
    controlAccepted: right.grade.accepted,
    treatmentCostUsd: Number.isFinite(left.totals.costUsd) ? left.totals.costUsd : null,
    controlCostUsd: Number.isFinite(right.totals.costUsd) ? right.totals.costUsd : null,
    costGapUsd: Number.isFinite(left.totals.costUsd) && Number.isFinite(right.totals.costUsd)
      ? left.totals.costUsd - right.totals.costUsd : null,
  }] : [];
});
const treatmentSummary = arms.find(({ armId }) => armId === 'haiku-harness');
const controlSummary = arms.find(({ armId }) => armId === 'opus-bare');
const eligible = pairs.length >= 10 && pairs.every(({ measurementValid }) => measurementValid);
const bootstrap = bootstrapPairedDecision(pairs);
const diagnostic = {
  pairedRuns: pairs.length,
  medianEffectGapPp: median(pairs.map(({ effectGapPp }) => effectGapPp)),
  medianCostGapUsd: pairs.every(({ costGapUsd }) => Number.isFinite(costGapUsd)) ? median(pairs.map(({ costGapUsd }) => costGapUsd)) : null,
  observedNonInferiorAtFivePoints: pairs.length > 0 && median(pairs.map(({ effectGapPp }) => effectGapPp)) >= -5,
  observedCostLower: Boolean(treatmentSummary && controlSummary && treatmentSummary.costPerAcceptedChange !== null && controlSummary.costPerAcceptedChange !== null
    && treatmentSummary.costPerAcceptedChange < controlSummary.costPerAcceptedChange),
  bootstrap,
};
const publishableModelUplift = eligible
  && bootstrap.effectGapMeanLower95Pp !== null
  && bootstrap.effectGapMeanLower95Pp >= -5
  && bootstrap.costPerAcceptedRatioUpper95 !== null
  && bootstrap.costPerAcceptedRatioUpper95 < 1;
const summary = {
  schemaVersion: 1,
  source: path.resolve(rawPath),
  arms,
  pairs,
  decision: {
    eligibleForPublicClaim: eligible,
    publishableModelUplift,
    reason: eligible
      ? (publishableModelUplift ? 'paired bootstrap confidence bounds passed for effect non-inferiority and cost superiority' : 'effect or cost confidence-bound gate failed')
      : 'at least 10 paired observations with complete billing measurements are required',
    nonInferiorityMarginPp: 5,
    diagnostic,
  },
};
fs.writeFileSync(path.resolve(outputPath), `${JSON.stringify(summary, null, 2)}\n`);
console.log(`summary=${path.resolve(outputPath)}`);
