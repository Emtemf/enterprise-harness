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
const claimEligibleInput = raw.claimEligibleInput === true;
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
    return { iterations, effectGapMeanLower95Pp: null };
  }
  const random = seededRandom(0x45485631);
  const effectMeans = [];
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const sample = Array.from({ length: pairs.length }, () => pairs[Math.floor(random() * pairs.length)]);
    effectMeans.push(mean(sample.map(({ effectGapPp }) => effectGapPp)));
  }
  return {
    iterations,
    effectGapMeanLower95Pp: percentile(effectMeans, 0.025),
  };
};
const arms = [...byArm].map(([armId, rows]) => {
  const accepted = rows.filter((row) => row.grade.accepted);
  const aliasCosts = rows.map((row) => row.totals.costUsd).filter(Number.isFinite);
  const relayChargeUnits = rows.map((row) => row.relayChargeUnits).filter(Number.isFinite);
  const completeRelayCharge = relayChargeUnits.length === rows.length;
  const tokens = rows.map((row) => Number(row.totals.inputTokens || 0) + Number(row.totals.outputTokens || 0));
  return {
    armId,
    runs: rows.length,
    acceptedRuns: accepted.length,
    acceptanceRate: accepted.length / rows.length,
    effectScoreMedian: median(rows.map((row) => row.grade.effectScore)),
    measurementValidRuns: rows.filter((row) => row.measurementValid !== false).length,
    modelTierIdentityValidRuns: rows.filter((row) => row.modelTierIdentityValid === true).length,
    relayChargeValidRuns: relayChargeUnits.length,
    relayRequestCountMedian: median(rows.map((row) => row.relayRequestCount).filter(Number.isFinite)),
    relayChargeUnitsMedian: completeRelayCharge ? median(relayChargeUnits) : null,
    relayChargeUnitsPerAcceptedChange: accepted.length === 0 || !completeRelayCharge
      ? null : relayChargeUnits.reduce((sum, value) => sum + value, 0) / accepted.length,
    tokensMedian: median(tokens),
    reportedAliasCostUsdMedian: aliasCosts.length === rows.length ? median(aliasCosts) : null,
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
      modelTierIdentityValid: left.modelTierIdentityValid === true && right.modelTierIdentityValid === true,
      effectGapPp: left.grade.effectScore - right.grade.effectScore,
      treatmentAccepted: left.grade.accepted,
      controlAccepted: right.grade.accepted,
      treatmentRelayChargeUnits: Number.isFinite(left.relayChargeUnits) ? left.relayChargeUnits : null,
      controlRelayChargeUnits: Number.isFinite(right.relayChargeUnits) ? right.relayChargeUnits : null,
      relayChargeUnitGap: Number.isFinite(left.relayChargeUnits) && Number.isFinite(right.relayChargeUnits)
        ? left.relayChargeUnits - right.relayChargeUnits : null,
    }] : [];
  });
  const validEffectMeasurements = pairs.every(({ effectMeasurementValid }) => effectMeasurementValid);
  const validModelTierIdentities = pairs.every(({ modelTierIdentityValid }) => modelTierIdentityValid);
  const distinctCases = new Set(pairs.map(({ caseId }) => caseId)).size;
  const diagnosticEligible = pairs.length >= 10 && validEffectMeasurements && validModelTierIdentities;
  const effectEligible = claimEligibleInput && pairs.length >= minimumPairedObservations
    && distinctCases >= minimumDistinctCases && validEffectMeasurements && validModelTierIdentities;
  const bootstrap = bootstrapPairedDecision(pairs.map((pair) => ({
    ...pair,
    effectMeasurementValid: pair.effectMeasurementValid && pair.modelTierIdentityValid,
  })));
  const minimumEffectGapPp = Number(comparison.minimumEffectGapPp ?? -5);
  const confidenceGatePassed = comparison.strictEffectGate
    ? bootstrap.effectGapMeanLower95Pp > minimumEffectGapPp
    : bootstrap.effectGapMeanLower95Pp >= minimumEffectGapPp;
  const publishableEffect = effectEligible && bootstrap.effectGapMeanLower95Pp !== null && confidenceGatePassed;
  return {
    ...comparison,
    pairs,
    decision: {
      eligibleForEffectClaim: effectEligible,
      publishableEffect,
      minimumEffectGapPp,
      strictEffectGate: Boolean(comparison.strictEffectGate),
      reason: {
        effect: effectEligible ? (publishableEffect ? 'effect confidence-bound gate passed' : 'effect confidence-bound gate failed') : claimEligibleInput ? `at least ${minimumPairedObservations} identity-valid pairs across ${minimumDistinctCases} distinct holdout cases are required` : 'the case pack is diagnostic-only and cannot support a published claim',
        resources: 'relay charge units, token usage and duration are descriptive statistics and do not gate the effect claim',
      },
      diagnostic: {
        pairedRuns: pairs.length,
        distinctCases,
        diagnosticEligible,
        validModelTierIdentities,
        medianEffectGapPp: median(pairs.map(({ effectGapPp }) => effectGapPp)),
        medianRelayChargeUnitGap: pairs.every(({ relayChargeUnitGap }) => Number.isFinite(relayChargeUnitGap))
          ? median(pairs.map(({ relayChargeUnitGap }) => relayChargeUnitGap)) : null,
        bootstrap,
      },
    },
  };
});
const requiredEffectIds = ['weak-workflow-uplift', 'weak-model-substitution'];
const requiredEffects = requiredEffectIds.map((id) => comparisons.find((item) => item.id === id)).filter(Boolean);
const publishableEffectStory = requiredEffects.length === requiredEffectIds.length
  && requiredEffects.every((item) => item.decision.publishableEffect);
const summary = {
  schemaVersion: 4,
  source: path.resolve(rawPath),
  arms,
  comparisons,
  decision: {
    publishableEffectStory,
    publishableModelUplift: publishableEffectStory,
    effectRequirements: requiredEffectIds,
    resourceMetricsArePublicationGate: false,
    claimEligibleInput,
    minimumPairedObservations,
    minimumDistinctCases,
  },
};
fs.writeFileSync(path.resolve(outputPath), `${JSON.stringify(summary, null, 2)}\n`);
console.log(`summary=${path.resolve(outputPath)}`);
