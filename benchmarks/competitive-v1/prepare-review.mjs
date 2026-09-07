#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const [rawPath, outputDir, seed = crypto.randomUUID()] = process.argv.slice(2);
if (!rawPath || !outputDir) {
  console.error('Usage: node prepare-review.mjs <raw-results.json> <output-dir> [seed]');
  process.exit(2);
}

const raw = JSON.parse(fs.readFileSync(path.resolve(rawPath), 'utf-8'));
if (!Array.isArray(raw.records)) throw new Error('raw results must contain records[]');
fs.mkdirSync(path.resolve(outputDir), { recursive: true });

function sampleId(index) {
  return `sample-${crypto.createHash('sha256').update(`${seed}:${index}`).digest('hex').slice(0, 12)}`;
}

function redactSystem(value) {
  return String(value || '').replaceAll(/enterprise[- ]harness/giu, '[SYSTEM]')
    .replaceAll(/superpowers/giu, '[SYSTEM]')
    .replaceAll(/openspec/giu, '[SYSTEM]')
    .replaceAll(/\/opsx:[a-z-]+/giu, '/[COMMAND]')
    .replaceAll(/\/enterprise-harness:harness/giu, '/[COMMAND]');
}

const packets = raw.records.map((record, index) => ({
  sampleId: sampleId(index),
  caseId: record.caseId,
  finalText: redactSystem(record.turns?.at(-1)?.text),
  turnTexts: (record.turns || []).map((turn) => redactSystem(turn.text)),
  artifacts: (record.artifacts || []).map((artifact, artifactIndex) => ({
    artifactId: `artifact-${artifactIndex + 1}`,
    size: artifact.size,
    sha256: artifact.sha256,
    content: redactSystem(artifact.content),
  })),
  productCodeChanged: record.productCodeChanged,
  changedPathCount: record.gitStatus?.length || 0,
}));
const key = raw.records.map((record, index) => ({
  sampleId: sampleId(index),
  system: record.system,
  repetition: record.repetition,
  totals: record.totals,
}));

fs.writeFileSync(path.join(path.resolve(outputDir), 'review-packets.json'), `${JSON.stringify({ caseId: raw.caseId, packets }, null, 2)}\n`);
fs.writeFileSync(path.join(path.resolve(outputDir), 'review-key.json'), `${JSON.stringify({ key }, null, 2)}\n`);
console.log(`reviewPackets=${path.join(path.resolve(outputDir), 'review-packets.json')}`);
console.log(`reviewKey=${path.join(path.resolve(outputDir), 'review-key.json')}`);
