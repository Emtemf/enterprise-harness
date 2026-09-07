#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const [keyPath, reviewsPath, outputPath] = process.argv.slice(2);
if (!keyPath || !reviewsPath || !outputPath) {
  console.error('Usage: node summarize.mjs <review-key.json> <reviews.json> <summary.json>');
  process.exit(2);
}
const rubric = JSON.parse(fs.readFileSync(path.join(here, 'rubric.json'), 'utf-8'));
const key = JSON.parse(fs.readFileSync(path.resolve(keyPath), 'utf-8')).key;
const reviews = JSON.parse(fs.readFileSync(path.resolve(reviewsPath), 'utf-8')).reviews;
const reviewById = new Map(reviews.map((review) => [review.sampleId, review]));
const dimensions = new Map(rubric.dimensions.map((dimension) => [dimension.id, dimension]));
const maximum = [...dimensions.values()].reduce((sum, dimension) => sum + dimension.weight * rubric.scoreRange[1], 0);

function quantile(values, fraction) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

const scored = key.map((item) => {
  const review = reviewById.get(item.sampleId);
  if (!review) throw new Error(`missing review for ${item.sampleId}`);
  const ids = Object.keys(review.scores || {});
  if (ids.length !== dimensions.size || ids.some((id) => !dimensions.has(id))) throw new Error(`invalid dimensions for ${item.sampleId}`);
  let weighted = 0;
  for (const [id, dimension] of dimensions) {
    const score = review.scores[id];
    if (!Number.isInteger(score) || score < rubric.scoreRange[0] || score > rubric.scoreRange[1]) {
      throw new Error(`invalid ${id} score for ${item.sampleId}`);
    }
    weighted += score * dimension.weight;
  }
  const hardFail = rubric.aggregate.hardFailDimensions.some((id) => review.scores[id] === 0);
  const percent = (weighted / maximum) * 100;
  return { ...item, scores: review.scores, percent, hardFail, accepted: !hardFail && percent >= rubric.aggregate.acceptedThresholdPercent };
});

const systems = [...new Set(scored.map((item) => item.system))];
const summary = systems.map((system) => {
  const rows = scored.filter((item) => item.system === system);
  const accepted = rows.filter((item) => item.accepted);
  const totals = (field) => rows.map((item) => Number(item.totals[field] || 0));
  const acceptedTokens = accepted.reduce((sum, item) => sum + Number(item.totals.inputTokens || 0) + Number(item.totals.outputTokens || 0), 0);
  return {
    system,
    runs: rows.length,
    acceptedRuns: accepted.length,
    hardFails: rows.filter((item) => item.hardFail).length,
    successRate: accepted.length / rows.length,
    scoreMedian: quantile(rows.map((item) => item.percent), 0.5),
    scoreIqr: [quantile(rows.map((item) => item.percent), 0.25), quantile(rows.map((item) => item.percent), 0.75)],
    inputTokensMedian: quantile(totals('inputTokens'), 0.5),
    outputTokensMedian: quantile(totals('outputTokens'), 0.5),
    cacheReadTokensMedian: quantile(totals('cacheReadInputTokens'), 0.5),
    costUsdMedian: quantile(totals('costUsd'), 0.5),
    durationMsMedian: quantile(totals('durationMs'), 0.5),
    tokensPerAcceptedRun: accepted.length === 0 ? null : acceptedTokens / accepted.length,
  };
});

fs.writeFileSync(path.resolve(outputPath), `${JSON.stringify({ rubricVersion: rubric.schemaVersion, scored, summary }, null, 2)}\n`);
console.log(`summary=${path.resolve(outputPath)}`);
