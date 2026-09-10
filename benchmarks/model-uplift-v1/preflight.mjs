#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { routeIdentityValid } from './lib/model-identity.mjs';
import { environmentFingerprint } from './lib/environment-fingerprint.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const matrix = JSON.parse(fs.readFileSync(path.join(here, 'matrix.json'), 'utf-8'));
const args = process.argv.slice(2);
const option = (name, fallback = null) => {
  const index = args.indexOf(name);
  return index < 0 ? fallback : args[index + 1];
};
if (args.includes('--help')) {
  console.log('Usage: node benchmarks/model-uplift-v1/preflight.mjs [--model <alias>] [--budget-usd-per-model <n>] [--output <path>]');
  process.exit(0);
}
const budgetUsdPerModel = Number(option('--budget-usd-per-model', '0.10'));
if (!Number.isFinite(budgetUsdPerModel) || budgetUsdPerModel <= 0) throw new Error('--budget-usd-per-model must be > 0');
const outputPath = path.resolve(option('--output', path.join(here, 'results', `preflight-${new Date().toISOString().replaceAll(/[:.]/gu, '-')}.json`)));
const claudeVersionResult = spawnSync('claude', ['--version'], { encoding: 'utf-8', shell: false });
if (claudeVersionResult.status !== 0) throw new Error(`claude --version failed: ${claudeVersionResult.stderr || claudeVersionResult.stdout}`);
const claudeCodeVersion = claudeVersionResult.stdout.trim();
const selectedModel = option('--model');
const benchmarkRoutes = [...new Set(matrix.arms.flatMap((arm) => [arm.controllerRoute, ...(arm.workerRoutes || [])]))];
const requestedModels = selectedModel ? [selectedModel] : benchmarkRoutes;
if (requestedModels.some((model) => !matrix.modelRoutes[model])) throw new Error('--model is not present in matrix.modelRoutes');

function parse(raw) {
  const events = String(raw).split(/\r?\n/u).filter(Boolean).flatMap((line) => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
  const result = [...events].reverse().find((event) => event.type === 'result');
  return {
    result,
    messageModels: [...new Set(events.filter((event) => event.type === 'assistant' && event.message?.model).map((event) => event.message.model))],
    billingModels: Object.keys(result?.modelUsage || {}),
  };
}

const probes = requestedModels.map((requestedModel) => {
  const child = spawnSync('claude', [
    '-p', 'Reply with exactly MODEL_PREFLIGHT_OK and do not use tools.',
    '--output-format', 'stream-json', '--verbose', '--max-turns', '1',
    '--max-budget-usd', budgetUsdPerModel.toFixed(6), '--model', requestedModel,
    '--permission-mode', 'bypassPermissions', '--setting-sources', '',
  ], { cwd: here, encoding: 'utf-8', shell: false, timeout: 180_000 });
  const parsed = parse(child.stdout || '');
  const identityValid = routeIdentityValid(matrix.modelRoutes[requestedModel], parsed.messageModels, parsed.billingModels);
  const billingEntries = Object.values(parsed.result?.modelUsage || {});
  const costUsd = billingEntries.reduce((sum, usage) => sum + Number(usage.costUSD || 0), 0);
  return {
    requestedModel,
    exitCode: child.status,
    terminationReason: parsed.result?.subtype || null,
    messageModels: parsed.messageModels,
    billingModels: parsed.billingModels,
    costUsd: billingEntries.length > 0 ? costUsd : null,
    identityValid,
    complete: billingEntries.length > 0,
    resultIsError: parsed.result?.is_error ?? null,
    resultText: typeof parsed.result?.result === 'string' ? parsed.result.result.slice(0, 2_000) : null,
    error: String(child.stderr || '').trim() || null,
  };
});
const passed = probes.every(({ exitCode, identityValid, complete }) => exitCode === 0 && identityValid && complete);
const receipt = {
  schemaVersion: 1,
  status: passed ? 'pass' : 'fail',
  generatedAt: new Date().toISOString(),
  expiresAfterHours: 24,
  claudeCodeVersion,
  environmentFingerprint: environmentFingerprint(process.env, claudeCodeVersion),
  routingProfile: matrix.routingProfile,
  budgetUsdPerModel,
  probes,
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(`preflight=${outputPath}`);
console.log(`status=${receipt.status}`);
if (!passed) process.exitCode = 1;
