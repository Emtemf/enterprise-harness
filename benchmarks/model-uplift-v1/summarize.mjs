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
const minimumPairedObservations = 20;
const minimumDistinctCases = 5;
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
const providerCost = (row) => row.costAuthority === 'provider-billing' && Number.isFinite(row.providerCostUsd)
  ? row.providerCostUsd
  : null;
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
      const treatmentAccepted = sample.filter(({ treatmentAccepted }) => treatmentAccepted).length;
      const controlAccepted = sample.filter(({ controlAccepted }) => controlAccepted).length;
      const treatmentCost = treatmentAccepted === 0 ? Number.POSITIVE_INFINITY
        : sample.reduce((sum, pair) => sum + pair.treatmentCostUsd, 0) / treatmentAccepted;
      const controlCost = controlAccepted === 0 ? Number.POSITIVE_INFINITY
        : sample.reduce((sum, pair) => sum + pair.controlCostUsd, 0) / controlAccepted;
      costRatios.push(Number.isFinite(treatmentCost) && Number.isFinite(controlCost)
        ? treatmentCost / controlCost : Number.POSITIVE_INFINITY);
    }
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
  const providerCosts = rows.map(providerCost).filter(Number.isFinite);
  const completeProviderCost = providerCosts.length === rows.length;
  const aliasCosts = rows.map((row) => row.totals.costUsd).filter(Number.isFinite);
  const tokens = rows.map((row) => Number(row.totals.inputTokens || 0) + Number(row.totals.outputTokens || 0));
  return {
    armId,
    runs: rows.length,
    acceptedRuns: accepted.length,
    acceptanceRate: accepted.length / rows.length,
    effectScoreMedian: median(rows.map((row) => row.grade.effectScore)),
    measurementValidRuns: rows.filter((row) => row.measurementValid !== false).length,
    providerCostValidRuns: providerCosts.length,
    tokensMedian: median(tokens),
    reportedAliasCostUsdMedian: aliasCosts.length === rows.length ? median(aliasCosts) : null,
    providerCostUsdMedian: completeProviderCost ? median(providerCosts) : null,
    costPerAcceptedChange: accepted.length === 0 || !completeProviderCost
      ? null : providerCosts.reduce((sum, value) => sum + value, 0) / accepted.length,
    durationMsMedian: median(rows.map((row) => row.totals.durationMs)),
    completedArchiveRate: rows.filter((row) => row.completedArchive).length / rows.length,
  };
});
const configuredComparisons = raw.comparisons || (raw.comparison ? [{
  id: 'legacy-model-substitution',
  minimumEffectGapPp: -5,
  ...raw.comparison,
}] : []);
const comparisons = configuredComparisons.map((comparison) => {
  const treatment = byArm.get(comparison.treatmentArm) || [];
  const control = byArm.get(comparison.controlArm) || [];
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
  const validEffectMeasurements = pairs.every(({ effectMeasurementValid }) => effectMeasurementValid);
  const distinctCases = new Set(pairs.map(({ caseId }) => caseId)).size;
  const diagnosticEligible = pairs.length >= 10 && validEffectMeasurements;
  const effectEligible = pairs.length >= minimumPairedObservations
    && distinctCases >= minimumDistinctCases && validEffectMeasurements;
  const economicEligible = effectEligible && pairs.every(({ economicMeasurementValid }) => economicMeasurementValid);
  const bootstrap = bootstrapPairedDecision(pairs);
  const minimumEffectGapPp = Number(comparison.minimumEffectGapPp ?? -5);
  const confidenceGatePassed = comparison.strictEffectGate
    ? bootstrap.effectGapMeanLower95Pp > minimumEffectGapPp
    : bootstrap.effectGapMeanLower95Pp >= minimumEffectGapPp;
  const publishableEffect = effectEligible && bootstrap.effectGapMeanLower95Pp !== null && confidenceGatePassed;
  const publishableEconomics = economicEligible && bootstrap.costPerAcceptedRatioUpper95 !== null
    && bootstrap.costPerAcceptedRatioUpper95 < 1;
  return {
    ...comparison,
    pairs,
    decision: {
      eligibleForEffectClaim: effectEligible,
      publishableEffect,
      minimumEffectGapPp,
      strictEffectGate: Boolean(comparison.strictEffectGate),
      eligibleForEconomicClaim: economicEligible,
      publishableEconomics,
      reason: {
        effect: effectEligible ? (publishableEffect ? 'effect confidence-bound gate passed' : 'effect confidence-bound gate failed') : `at least ${minimumPairedObservations} identity-valid pairs across ${minimumDistinctCases} distinct holdout cases are required`,
        economics: economicEligible ? (publishableEconomics ? 'provider-billed cost confidence bound passed' : 'cost confidence-bound gate failed') : 'provider-billed cost is required; Claude alias cost estimates are not accepted',
      },
      diagnostic: {
        pairedRuns: pairs.length,
        distinctCases,
        diagnosticEligible,
        medianEffectGapPp: median(pairs.map(({ effectGapPp }) => effectGapPp)),
        medianCostGapUsd: pairs.every(({ costGapUsd }) => Number.isFinite(costGapUsd))
          ? median(pairs.map(({ costGapUsd }) => costGapUsd)) : null,
        bootstrap,
      },
    },
  };
});
const requiredEffectIds = ['weak-workflow-uplift', 'weak-model-substitution', 'strong-workflow-uplift'];
const requiredEffects = requiredEffectIds.map((id) => comparisons.find((item) => item.id === id)).filter(Boolean);
const economicComparison = comparisons.find((item) => item.economicComparison);
const publishableEffectStory = requiredEffects.length === requiredEffectIds.length
  && requiredEffects.every((item) => item.decision.publishableEffect);
const summary = {
  schemaVersion: 3,
  source: path.resolve(rawPath),
  arms,
  comparisons,
  decision: {
    publishableEffectStory,
    publishableEconomicAdvantage: Boolean(economicComparison?.decision.publishableEconomics),
    publishableCombinedClaim: publishableEffectStory && Boolean(economicComparison?.decision.publishableEconomics),
    effectRequirements: requiredEffectIds,
    economicComparison: economicComparison?.id || null,
    minimumPairedObservations,
    minimumDistinctCases,
  },
};
fs.writeFileSync(path.resolve(outputPath), `${JSON.stringify(summary, null, 2)}\n`);
console.log(`summary=${path.resolve(outputPath)}`);
