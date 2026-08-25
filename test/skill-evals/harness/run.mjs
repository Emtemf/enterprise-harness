#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { evaluateTerminalFactGateShape } from './terminal-shape.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..', '..');
const defaultResultsDir = path.join(here, 'results');
const definition = JSON.parse(fs.readFileSync(path.join(here, 'evals.json'), 'utf-8'));
const packageDefinition = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf-8'));
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
  console.log('  --variant <name>        control, with-skill, or both (default: both)');
  console.log('  --dry-run               Print exact argv plan without invoking Claude or writing results');
  console.log('  --record-review <manifest> --review-file <path>');
  console.log('                          Validate and attach an immutable manual-review.json');
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
    ...isolationArgvFor(variant),
    '--tools', '',
    '--permission-mode', 'plan',
    '--no-session-persistence',
    '--model', model,
    '--max-budget-usd', '0.50',
    prompt,
  ];
}

function isolationArgvFor(variant) {
  return variant === 'control'
    ? ['--safe-mode', '--disable-slash-commands', '--setting-sources', '']
    : ['--setting-sources', '', '--plugin-dir', repoRoot];
}

function runPlan(selected, model, selectedVariants, repetitions, timeoutMs) {
  return selectedVariants.flatMap((variant) => Array.from({ length: repetitions }, (_, index) => ({
    runId: `${variant}-${String(index + 1).padStart(2, '0')}`,
    variant,
    repetition: index + 1,
    command: 'claude',
    argv: argvFor(selected, model, variant),
    isolationArgv: isolationArgvFor(variant),
    shell: false,
    timeoutMs,
  })));
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function commandOutput(command, argv, label) {
  const result = spawnSync(command, argv, {
    cwd: repoRoot,
    encoding: 'utf-8',
    shell: false,
    env: { ...process.env },
  });
  if (result.status !== 0 || result.error) {
    throw new Error(`${label} failed: ${result.error?.message || result.stderr || `exit ${result.status}`}`);
  }
  const value = result.stdout.trim();
  if (!value) throw new Error(`${label} returned empty output`);
  return value;
}

function requireRegularFile(target, label) {
  const resolved = path.resolve(target);
  const stat = fs.lstatSync(resolved);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${label} must be a regular non-symlink file`);
  return resolved;
}

function recordReview(manifestArgument, reviewArgument) {
  const manifestPath = requireRegularFile(manifestArgument, 'manifest');
  if (path.basename(manifestPath) !== 'scoring-manifest.json') {
    throw new Error('manifest must be named scoring-manifest.json');
  }
  const reviewInputPath = requireRegularFile(reviewArgument, 'review file');
  const manifestBytes = fs.readFileSync(manifestPath);
  const manifest = JSON.parse(manifestBytes.toString('utf-8'));
  if (manifest.type !== 'clarify-skill-eval-scoring-manifest' || !Array.isArray(manifest.runs)) {
    throw new Error('manifest is not a clarify skill eval scoring manifest');
  }
  if (manifest.manualReview) throw new Error('manifest already references a manual review');
  const review = JSON.parse(fs.readFileSync(reviewInputPath, 'utf-8'));
  if (typeof review.reviewer !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u.test(review.reviewer)) {
    throw new Error('reviewer must be a safe identifier');
  }
  if (typeof review.reviewedAt !== 'string' || Number.isNaN(Date.parse(review.reviewedAt))) {
    throw new Error('reviewedAt must be an RFC3339 timestamp');
  }
  if (!['pass', 'fail'].includes(review.overallVerdict) || !Array.isArray(review.runs)) {
    throw new Error('manual review must include overallVerdict and runs');
  }
  const manifestRunIds = manifest.runs.map(({ runId }) => runId);
  const reviewedRunIds = review.runs.map(({ runId }) => runId);
  if (new Set(reviewedRunIds).size !== reviewedRunIds.length
      || JSON.stringify([...reviewedRunIds].sort()) !== JSON.stringify([...manifestRunIds].sort())) {
    throw new Error('manual review must cover every manifest run exactly once');
  }
  for (const entry of review.runs) {
    if (!['pass', 'fail', 'incomplete'].includes(entry.verdict)
        || typeof entry.notes !== 'string' || entry.notes.trim().length === 0 || entry.notes.length > 2000) {
      throw new Error(`manual review entry ${entry.runId} has invalid verdict or notes`);
    }
  }
  const everyRunPasses = review.runs.every(({ verdict }) => verdict === 'pass');
  if ((review.overallVerdict === 'pass') !== everyRunPasses) {
    throw new Error('overallVerdict pass requires every run verdict to pass');
  }
  const canonicalReview = {
    reviewVersion: 1,
    type: 'clarify-skill-eval-manual-review',
    manifestRef: 'scoring-manifest.json',
    manifestSha256: sha256(manifestBytes),
    reviewer: review.reviewer,
    reviewedAt: review.reviewedAt,
    overallVerdict: review.overallVerdict,
    runs: review.runs.map(({ runId, verdict, notes }) => ({ runId, verdict, notes: notes.trim() })),
  };
  const reviewBytes = Buffer.from(`${JSON.stringify(canonicalReview, null, 2)}\n`, 'utf-8');
  const collectionDir = path.dirname(manifestPath);
  const canonicalReviewPath = path.join(collectionDir, 'manual-review.json');
  if (fs.existsSync(canonicalReviewPath)) throw new Error('manual-review.json already exists');
  const updatedManifest = {
    ...manifest,
    manualReview: {
      ref: 'manual-review.json',
      sha256: sha256(reviewBytes),
      reviewer: canonicalReview.reviewer,
      reviewedAt: canonicalReview.reviewedAt,
      overallVerdict: canonicalReview.overallVerdict,
    },
  };
  const temporaryManifest = path.join(collectionDir, `.scoring-manifest.${process.pid}.tmp`);
  let reviewCreated = false;
  let manifestCommitted = false;
  try {
    fs.writeFileSync(canonicalReviewPath, reviewBytes, { flag: 'wx' });
    reviewCreated = true;
    fs.writeFileSync(temporaryManifest, `${JSON.stringify(updatedManifest, null, 2)}\n`, { flag: 'wx' });
    fs.renameSync(temporaryManifest, manifestPath);
    manifestCommitted = true;
  } catch (error) {
    if (fs.existsSync(temporaryManifest)) fs.rmSync(temporaryManifest);
    if (reviewCreated && !manifestCommitted && fs.existsSync(canonicalReviewPath)) fs.rmSync(canonicalReviewPath);
    throw error;
  }
  console.log(JSON.stringify({ manifestPath, manualReviewRef: 'manual-review.json' }, null, 2));
}

function mechanicalShapeFor(id, stdout) {
  if (!id) return null;
  if (id !== 'terminal-fact-gate-v1') throw new Error(`unknown mechanical shape ${id}`);
  const result = evaluateTerminalFactGateShape(stdout);
  return {
    id,
    ...result,
    semanticPass: false,
    manualReviewRequired: true,
  };
}

function writeJson(target, value) {
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, 'utf-8');
}

function removeOwnedTemporaryWorkspace(workspaceRoot) {
  const resolvedTemp = fs.realpathSync(os.tmpdir());
  const resolvedWorkspace = fs.realpathSync(workspaceRoot);
  if (path.dirname(resolvedWorkspace) !== resolvedTemp
      || !path.basename(resolvedWorkspace).startsWith('eh-clarify-skill-eval-')) {
    throw new Error(`refusing to clean unowned eval workspace ${workspaceRoot}`);
  }
  fs.rmSync(resolvedWorkspace, { recursive: true, force: true });
}

if (rawArgs.includes('--help') || rawArgs.includes('-h')) {
  help();
  process.exit(0);
}

try {
  if (rawArgs.includes('--record-review')) {
    recordReview(option('--record-review'), option('--review-file'));
    process.exit(0);
  }
  if (definition.version !== packageDefinition.version) {
    throw new Error(`eval suite version ${definition.version} must match plugin version ${packageDefinition.version}`);
  }
  const caseId = safeToken(option('--case'), 'case id');
  const selected = definition.cases.find(({ id }) => id === caseId);
  if (!selected) throw new Error(`unknown case ${caseId}; available: ${definition.cases.map(({ id }) => id).join(', ')}`);
  const model = safeToken(option('--model', 'sonnet'), 'model');
  const repetitions = positiveInteger(option('--reps', '5'), '--reps', 5);
  const timeoutMs = positiveInteger(option('--timeout-ms', '120000'), '--timeout-ms');
  const variantOption = safeToken(option('--variant', 'both'), 'variant');
  if (!['both', ...variants].includes(variantOption)) throw new Error('variant must be control, with-skill, or both');
  const selectedVariants = variantOption === 'both' ? [...variants] : [variantOption];
  const resultsRoot = path.resolve(option('--results-dir', defaultResultsDir));
  const runs = runPlan(selected, model, selectedVariants, repetitions, timeoutMs);

  if (rawArgs.includes('--dry-run')) {
    console.log(JSON.stringify({
      caseId,
      model,
      variants: selectedVariants,
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
  fs.mkdirSync(resultsRoot, { recursive: true });
  fs.mkdirSync(runDirectory, { recursive: false });
  fs.mkdirSync(outputsDirectory);
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-clarify-skill-eval-'));
  const manifestPath = path.join(runDirectory, 'scoring-manifest.json');
  const manifest = {
    manifestVersion: 1,
    type: 'clarify-skill-eval-scoring-manifest',
    manifestPath,
    caseId,
    model,
    evalSuiteVersion: definition.version,
    variants: selectedVariants,
    repetitionsPerVariant: repetitions,
    timeoutMs,
    isolation: Object.fromEntries(selectedVariants.map((variant) => [variant, isolationArgvFor(variant)])),
    provenance: {
      repositoryHead: commandOutput('git', ['rev-parse', 'HEAD'], 'git rev-parse HEAD'),
      skillSha256: sha256(fs.readFileSync(path.join(repoRoot, 'skills', 'harness', 'SKILL.md'))),
      claudeVersion: commandOutput('claude', ['--version'], 'claude --version'),
    },
    workspace: { strategy: 'mkdtemp-outside-checkout', root: workspaceRoot, cleanupStatus: 'pending' },
    semanticScoring: 'manual-required',
    scoringInstructions: 'Read every stdout/stderr artifact. Record a human verdict against the copied assertions and forbidden behaviors; process completion alone is not a semantic pass.',
    assertions: [...selected.assertions],
    forbidden: [...selected.forbidden],
    createdAt: new Date().toISOString(),
    runs: [],
  };
  writeJson(manifestPath, manifest);

  let cleanupError = null;
  try {
    for (const planned of runs) {
      const workspace = path.join(workspaceRoot, planned.runId);
      fs.mkdirSync(workspace);
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
        cwd: workspace,
        cwdRef: `temporary:${planned.runId}`,
        startedAt: startedAt.toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt.getTime(),
        exitCode: child.status,
        signal: child.signal,
        processStatus,
        mechanicalShape: mechanicalShapeFor(selected.mechanicalShape, child.stdout || ''),
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
  } finally {
    try {
      removeOwnedTemporaryWorkspace(workspaceRoot);
      manifest.workspace.cleanupStatus = 'removed';
    } catch (error) {
      cleanupError = error;
      manifest.workspace.cleanupStatus = 'cleanup-failed';
      manifest.workspace.cleanupError = error.message;
    }
    writeJson(manifestPath, manifest);
  }

  if (cleanupError) throw cleanupError;

  const collectionComplete = manifest.runs.every(({ processStatus, mechanicalShape }) => (
    processStatus === 'completed' && (mechanicalShape === null || mechanicalShape.pass)
  ));
  console.log(JSON.stringify({ collectionComplete, semanticScoring: 'manual-required', manifestPath }, null, 2));
  process.exit(collectionComplete ? 0 : 1);
} catch (error) {
  console.error(`Eval collector error: ${error.message}`);
  process.exit(2);
}
