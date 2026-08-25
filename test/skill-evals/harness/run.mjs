#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..', '..');
const defaultResultsDir = path.join(here, 'results');
const definition = JSON.parse(fs.readFileSync(path.join(here, 'evals.json'), 'utf-8'));
const variants = Object.freeze(['control', 'with-skill']);
const rawArgs = process.argv.slice(2);

function help() {
  console.log('Harness skill behavioral eval collector');
  console.log('Usage: node test/skill-evals/harness/run.mjs --case <id> [options]');
  console.log('Options:');
  console.log('  --model <model>         Claude model (default: sonnet)');
  console.log('  --reps <n>              Repetitions per control/with-skill variant, minimum 5 (default: 5)');
  console.log('  --timeout-ms <ms>       Per-process timeout (default: 120000)');
  console.log('  --results-dir <path>    Output root (default: test/skill-evals/harness/results)');
  console.log('  --dry-run               Print exact argv plan without invoking Claude or writing results');
  console.log('Collection success is not semantic pass; score every persisted output manually.');
}

function option(flag, fallback = null) {
  const index = rawArgs.indexOf(flag);
  if (index < 0) return fallback;
  const value = rawArgs[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
  return value;
}

function positiveInteger(value, flag, minimum = 1) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum) throw new Error(`${flag} must be an integer >= ${minimum}`);
  return parsed;
}

function safeToken(value, label) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(value)) {
    throw new Error(`${label} must be a safe identifier`);
  }
  return value;
}

function argvFor(selected, model, variant) {
  const prompt = variant === 'with-skill'
    ? `/enterprise-harness:harness\n\n${selected.prompt}`
    : selected.prompt;
  return [
    '-p',
    ...(variant === 'with-skill' ? ['--plugin-dir', repoRoot] : []),
    '--tools', '',
    '--permission-mode', 'plan',
    '--no-session-persistence',
    '--model', model,
    '--max-budget-usd', '0.50',
    prompt,
  ];
}

function runPlan(selected, model, repetitions, timeoutMs) {
  return variants.flatMap((variant) => Array.from({ length: repetitions }, (_, index) => ({
    runId: `${variant}-${String(index + 1).padStart(2, '0')}`,
    variant,
    repetition: index + 1,
    command: 'claude',
    argv: argvFor(selected, model, variant),
    shell: false,
    timeoutMs,
  })));
}

function writeJson(target, value) {
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, 'utf-8');
}

if (rawArgs.includes('--help') || rawArgs.includes('-h')) {
  help();
  process.exit(0);
}

try {
  const caseId = safeToken(option('--case'), 'case id');
  const selected = definition.cases.find(({ id }) => id === caseId);
  if (!selected) throw new Error(`unknown case ${caseId}; available: ${definition.cases.map(({ id }) => id).join(', ')}`);
  const model = safeToken(option('--model', 'sonnet'), 'model');
  const repetitions = positiveInteger(option('--reps', '5'), '--reps', 5);
  const timeoutMs = positiveInteger(option('--timeout-ms', '120000'), '--timeout-ms');
  const resultsRoot = path.resolve(option('--results-dir', defaultResultsDir));
  const runs = runPlan(selected, model, repetitions, timeoutMs);

  if (rawArgs.includes('--dry-run')) {
    console.log(JSON.stringify({
      caseId,
      model,
      variants,
      repetitionsPerVariant: repetitions,
      timeoutMs,
      resultsRoot,
      runs,
    }, null, 2));
    process.exit(0);
  }

  const stamp = new Date().toISOString().replace(/[:.]/gu, '-');
  const runDirectory = path.join(resultsRoot, `${stamp}-${caseId}-${model}-${process.pid}`);
  const outputsDirectory = path.join(runDirectory, 'outputs');
  const workspacesDirectory = path.join(runDirectory, 'workspaces');
  fs.mkdirSync(outputsDirectory, { recursive: true });
  fs.mkdirSync(workspacesDirectory, { recursive: true });
  const manifestPath = path.join(runDirectory, 'scoring-manifest.json');
  const manifest = {
    manifestVersion: 1,
    type: 'clarify-skill-eval-scoring-manifest',
    manifestPath,
    caseId,
    model,
    variants,
    repetitionsPerVariant: repetitions,
    timeoutMs,
    semanticScoring: 'manual-required',
    scoringInstructions: 'Read every stdout/stderr artifact. Record a human verdict against the copied assertions and forbidden behaviors; process completion alone is not a semantic pass.',
    assertions: [...selected.assertions],
    forbidden: [...selected.forbidden],
    createdAt: new Date().toISOString(),
    runs: [],
  };
  writeJson(manifestPath, manifest);

  for (const planned of runs) {
    const workspace = path.join(workspacesDirectory, planned.runId);
    fs.mkdirSync(workspace, { recursive: true });
    const stdoutRef = `outputs/${planned.runId}.stdout.txt`;
    const stderrRef = `outputs/${planned.runId}.stderr.txt`;
    process.stderr.write(`START variant=${planned.variant} rep=${planned.repetition}/${repetitions} timeoutMs=${timeoutMs}\n`);
    const startedAt = new Date();
    const child = spawnSync(planned.command, planned.argv, {
      cwd: workspace,
      encoding: 'utf-8',
      shell: false,
      timeout: timeoutMs,
      killSignal: 'SIGTERM',
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env },
    });
    const timedOut = child.error?.code === 'ETIMEDOUT';
    const processStatus = timedOut ? 'timeout' : child.status === 0 ? 'completed' : 'exit-nonzero';
    fs.writeFileSync(path.join(runDirectory, stdoutRef), child.stdout || '', 'utf-8');
    fs.writeFileSync(path.join(runDirectory, stderrRef), `${child.stderr || ''}${child.error ? `\ncollectorError=${child.error.message}\n` : ''}`, 'utf-8');
    manifest.runs.push({
      ...planned,
      cwdRef: `workspaces/${planned.runId}`,
      startedAt: startedAt.toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt.getTime(),
      exitCode: child.status,
      signal: child.signal,
      processStatus,
      stdoutRef,
      stderrRef,
      assertions: [...selected.assertions],
      forbidden: [...selected.forbidden],
      semanticVerdict: null,
      reviewerNotes: null,
    });
    writeJson(manifestPath, manifest);
    process.stderr.write(`DONE variant=${planned.variant} rep=${planned.repetition}/${repetitions} status=${processStatus} stdout=${stdoutRef} stderr=${stderrRef}\n`);
  }

  const collectionComplete = manifest.runs.every(({ processStatus }) => processStatus === 'completed');
  console.log(JSON.stringify({ collectionComplete, semanticScoring: 'manual-required', manifestPath }, null, 2));
  process.exit(collectionComplete ? 0 : 1);
} catch (error) {
  console.error(`Eval collector error: ${error.message}`);
  process.exit(2);
}
