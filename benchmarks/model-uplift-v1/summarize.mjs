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
  if (pairs.length === 0 || pairs.some(({ effectMeasurementValid }) => !effectMeasurementValid)) {
    return { iterations, effectGapMeanLower95Pp: null, costPerAcceptedRatioUpper95: null };
  }
  const random = seededRandom(0x45485631);
  const effectMeans = [];
  const costRatios = [];
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const sample = Array.from({ length: pairs.length }, () => pairs[Math.floor(random() * pairs.length)]);
    effectMeans.push(mean(sample.map(({ effectGapPp }) => effectGapPp)));
    if (sample.every(({ economicMeasurementValid }) => economicMeasurementValid)) {
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
  }
  const costUpper = percentile(costRatios, 0.975);
  return {
    iterations,
    effectGapMeanLower95Pp: percentile(effectMeans, 0.025),
    costPerAcceptedRatioUpper95: Number.isFinite(costUpper) ? costUpper : null,
  };
};
const providerCost = (row) => row.costAuthority === 'provider-billing' && Number.isFinite(row.providerCostUsd)
  ? row.providerCostUsd
  : null;
const arms = [...byArm].map(([armId, rows]) => {
  const accepted = rows.filter((row) => row.grade.accepted);
  const providerCosts = rows.map(providerCost).filter((value) => Number.isFinite(value));
  const completeProviderCost = providerCosts.length === rows.length;
  const aliasCosts = rows.map((row) => row.totals.costUsd).filter((value) => Number.isFinite(value));
  return {
    armId,
    runs: rows.length,
    acceptedRuns: accepted.length,
    acceptanceRate: accepted.length / rows.length,
    effectScoreMedian: median(rows.map((row) => row.grade.effectScore)),
    measurementValidRuns: rows.filter((row) => row.measurementValid !== false).length,
    providerCostValidRuns: providerCosts.length,
    reportedAliasCostUsdMedian: aliasCosts.length === rows.length ? median(aliasCosts) : null,
    providerCostUsdMedian: completeProviderCost ? median(providerCosts) : null,
    costPerAcceptedChange: accepted.length === 0 || !completeProviderCost
      ? null
      : providerCosts.reduce((sum, value) => sum + value, 0) / accepted.length,
    durationMsMedian: median(rows.map((row) => row.totals.durationMs)),
    completedArchiveRate: rows.filter((row) => row.completedArchive).length / rows.length,
  };
});
const treatmentArmId = raw.comparison?.treatmentArm || 'weak-harness';
const controlArmId = raw.comparison?.controlArm || 'strong-bare';
const treatment = byArm.get(treatmentArmId) || [];
const control = byArm.get(controlArmId) || [];
const pairs = treatment.flatMap((left) => {
  const right = control.find((candidate) => candidate.caseId === left.caseId && candidate.repetition === left.repetition);
  return right ? [{
    caseId: left.caseId,
    repetition: left.repetition,
    effectMeasurementValid: left.measurementValid !== false && right.measurementValid !== false
      && left.modelIdentityValid !== false && right.modelIdentityValid !== false,
    economicMeasurementValid: providerCost(left) !== null && providerCost(right) !== null,
    effectGapPp: left.grade.effectScore - right.grade.effectScore,
    treatmentAccepted: left.grade.accepted,
    controlAccepted: right.grade.accepted,
    treatmentCostUsd: providerCost(left),
    controlCostUsd: providerCost(right),
    costGapUsd: providerCost(left) !== null && providerCost(right) !== null
      ? providerCost(left) - providerCost(right) : null,
  }] : [];
});
const treatmentSummary = arms.find(({ armId }) => armId === treatmentArmId);
const controlSummary = arms.find(({ armId }) => armId === controlArmId);
const effectEligible = pairs.length >= 10 && pairs.every(({ effectMeasurementValid }) => effectMeasurementValid);
const economicEligible = effectEligible && pairs.every(({ economicMeasurementValid }) => economicMeasurementValid);
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
const publishableEffectUplift = effectEligible
  && bootstrap.effectGapMeanLower95Pp !== null
  && bootstrap.effectGapMeanLower95Pp >= -5;
const publishableEconomicAdvantage = economicEligible
  && bootstrap.costPerAcceptedRatioUpper95 !== null
  && bootstrap.costPerAcceptedRatioUpper95 < 1;
const summary = {
  schemaVersion: 2,
  source: path.resolve(rawPath),
  arms,
  pairs,
  decision: {
    eligibleForEffectClaim: effectEligible,
    publishableEffectUplift,
    eligibleForEconomicClaim: economicEligible,
    publishableEconomicAdvantage,
    publishableModelUplift: publishableEffectUplift && publishableEconomicAdvantage,
    reason: {
      effect: effectEligible ? (publishableEffectUplift ? 'effect non-inferiority confidence bound passed' : 'effect confidence-bound gate failed') : 'at least 10 identity-valid paired effect observations are required',
      economics: economicEligible ? (publishableEconomicAdvantage ? 'provider-billed cost confidence bound passed' : 'cost confidence-bound gate failed') : 'provider-billed cost is required; Claude alias cost estimates are not accepted',
    },
    nonInferiorityMarginPp: 5,
    diagnostic,
  },
};
fs.writeFileSync(path.resolve(outputPath), `${JSON.stringify(summary, null, 2)}\n`);
console.log(`summary=${path.resolve(outputPath)}`);
