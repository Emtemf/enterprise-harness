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
  const toolProfile = selected.toolProfile || 'none';
  if (!['none', 'read-only'].includes(toolProfile)) {
    throw new Error(`unsupported eval toolProfile ${toolProfile}`);
  }
  return [
    '-p',
    ...isolationArgvFor(variant),
    '--tools', toolProfile === 'read-only' ? 'Read' : '',
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

function requireCanonicalManifest(target) {
  const resolved = requireRegularFile(target, 'manifest');
  if (path.basename(resolved) !== 'scoring-manifest.json') {
    throw new Error('manifest must be named scoring-manifest.json');
  }
  if (fs.realpathSync(resolved) !== resolved) {
    throw new Error('manifest collection and parents must not contain a symlink');
  }
  return resolved;
}

function validDate(value) {
  if (typeof value !== 'string') return false;
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:[Zz]|[+-](\d{2}):(\d{2}))$/u,
  );
  if (!match) return false;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText,
    offsetHourText, offsetMinuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1
    && month <= 12
    && day >= 1
    && day <= daysInMonth[month - 1]
    && Number(hourText) <= 23
    && Number(minuteText) <= 59
    && Number(secondText) <= 60
    && (offsetHourText === undefined || Number(offsetHourText) <= 23)
    && (offsetMinuteText === undefined || Number(offsetMinuteText) <= 59);
}

function validateOutputEvidence(manifestPath, entry, stream) {
  const collectionDir = path.dirname(manifestPath);
  const refField = `${stream}Ref`;
  const digestField = `${stream}Sha256`;
  const expectedRef = `outputs/${entry.runId}.${stream}.txt`;
  if (entry[refField] !== expectedRef) {
    throw new Error(`${entry.runId} ${refField} must be a canonical output ref in this collection`);
  }
  const target = path.join(collectionDir, ...expectedRef.split('/'));
  let stat;
  try {
    stat = fs.lstatSync(target);
  } catch {
    throw new Error(`${entry.runId} ${stream} output is missing`);
  }
  if (!stat.isFile() || stat.isSymbolicLink() || fs.realpathSync(target) !== target) {
    throw new Error(`${entry.runId} ${stream} output must be a regular non-symlink file in this collection`);
  }
  if (!/^[a-f0-9]{64}$/u.test(entry[digestField] || '')) {
    throw new Error(`${entry.runId} ${digestField} is invalid`);
  }
  if (sha256(fs.readFileSync(target)) !== entry[digestField]) {
    throw new Error(`${entry.runId} ${stream} digest mismatch`);
  }
}

function validateManifestForReview(manifestPath, manifest) {
  if (manifest.type !== 'clarify-skill-eval-scoring-manifest' || manifest.manifestVersion !== 1
      || !Array.isArray(manifest.runs)) {
    throw new Error('manifest is not a clarify skill eval scoring manifest');
  }
  if (manifest.manifestPath !== manifestPath) {
    throw new Error('manifestPath must equal the actual canonical path');
  }
  const selectedCase = definition.cases.find(({ id }) => id === manifest.caseId);
  if (!validDate(manifest.createdAt)) {
    throw new Error('manifest createdAt must be a strict RFC3339 timestamp');
  }
  if (manifest.evalSuiteVersion !== definition.version
      || typeof manifest.caseId !== 'string'
      || !selectedCase
      || typeof manifest.model !== 'string'
      || !Array.isArray(manifest.variants) || manifest.variants.length < 1
      || new Set(manifest.variants).size !== manifest.variants.length
      || !manifest.variants.every((variant) => variants.includes(variant))
      || !Number.isSafeInteger(manifest.repetitionsPerVariant) || manifest.repetitionsPerVariant < 5
      || !Number.isSafeInteger(manifest.timeoutMs) || manifest.timeoutMs < 1
      || manifest.semanticScoring !== 'manual-required'
      || typeof manifest.scoringInstructions !== 'string' || manifest.scoringInstructions.length < 1
      || JSON.stringify(manifest.assertions) !== JSON.stringify(selectedCase.assertions)
      || JSON.stringify(manifest.forbidden) !== JSON.stringify(selectedCase.forbidden)) {
    throw new Error('manifest eval metadata is invalid');
  }
  if (!manifest.provenance
      || !/^[a-f0-9]{40}$/u.test(manifest.provenance.repositoryHead || '')
      || !/^[a-f0-9]{64}$/u.test(manifest.provenance.skillSha256 || '')
      || typeof manifest.provenance.claudeVersion !== 'string'
      || manifest.provenance.claudeVersion.trim().length === 0) {
    throw new Error('manifest provenance is invalid');
  }
  const expectedShapeId = selectedCase.mechanicalShape || null;
  if ((expectedShapeId === null && manifest.shapeContract !== null)
      || (expectedShapeId !== null && manifest.shapeContract?.id !== expectedShapeId)) {
    throw new Error('manifest shape metadata is invalid');
  }
  if (!manifest.workspace || manifest.workspace.strategy !== 'mkdtemp-outside-checkout'
      || !['removed', 'cleanup-failed'].includes(manifest.workspace.cleanupStatus)) {
    throw new Error('manifest workspace cleanup metadata is invalid');
  }
  if (!['complete', 'aborted'].includes(manifest.collectionStatus)
      || !Number.isSafeInteger(manifest.plannedRunCount) || manifest.plannedRunCount < 1
      || !Number.isSafeInteger(manifest.recordedRunCount)
      || !Number.isSafeInteger(manifest.completedRunCount)
      || typeof manifest.evidenceEligible !== 'boolean') {
    throw new Error('manifest collection metadata is invalid');
  }
  const runIds = manifest.runs.map(({ runId }) => runId);
  const expectedPlan = runPlan(
    selectedCase,
    manifest.model,
    manifest.variants,
    manifest.repetitionsPerVariant,
    manifest.timeoutMs,
  );
  const expectedRunIds = expectedPlan.map(({ runId }) => runId);
  const expectedPlanByRunId = new Map(expectedPlan.map((entry) => [entry.runId, entry]));
  const expectedIsolation = Object.fromEntries(
    manifest.variants.map((variant) => [variant, isolationArgvFor(variant)]),
  );
  if (new Set(runIds).size !== runIds.length || manifest.recordedRunCount !== manifest.runs.length
      || manifest.recordedRunCount > manifest.plannedRunCount
      || manifest.plannedRunCount !== expectedRunIds.length
      || !runIds.every((runId) => expectedRunIds.includes(runId))) {
    throw new Error('manifest planned/recorded run counts are inconsistent');
  }
  if (JSON.stringify(manifest.isolation) !== JSON.stringify(expectedIsolation)) {
    throw new Error('manifest isolation does not match the recomputed execution plan');
  }
  for (const entry of manifest.runs) {
    if (typeof entry.runId !== 'string' || !/^(?:control|with-skill)-\d{2,}$/u.test(entry.runId)
        || !['completed', 'exit-nonzero', 'timeout'].includes(entry.processStatus)) {
      throw new Error('manifest run metadata is invalid');
    }
    if (!validDate(entry.startedAt) || !validDate(entry.completedAt)) {
      throw new Error(`${entry.runId} timestamps must be strict RFC3339`);
    }
    if (expectedShapeId === null) {
      if (entry.mechanicalShape !== null) throw new Error('manifest shape metadata is invalid');
    } else if (entry.mechanicalShape?.id !== expectedShapeId
        || typeof entry.mechanicalShape.pass !== 'boolean'
        || !Array.isArray(entry.mechanicalShape.problems)
        || entry.mechanicalShape.semanticPass !== false
        || entry.mechanicalShape.manualReviewRequired !== true) {
      throw new Error('manifest shape metadata is invalid');
    }
    const planned = expectedPlanByRunId.get(entry.runId);
    if (!planned
        || entry.variant !== planned.variant
        || entry.repetition !== planned.repetition
        || entry.command !== planned.command
        || JSON.stringify(entry.argv) !== JSON.stringify(planned.argv)
        || JSON.stringify(entry.isolationArgv) !== JSON.stringify(planned.isolationArgv)
        || entry.shell !== planned.shell
        || entry.timeoutMs !== planned.timeoutMs
        || entry.cwdRef !== `temporary:${entry.runId}`
        || entry.cwd !== path.join(manifest.workspace.root, entry.runId)
        || JSON.stringify(entry.assertions) !== JSON.stringify(selectedCase.assertions)
        || JSON.stringify(entry.forbidden) !== JSON.stringify(selectedCase.forbidden)) {
      throw new Error(`${entry.runId} does not match the recomputed execution plan`);
    }
    validateOutputEvidence(manifestPath, entry, 'stdout');
    validateOutputEvidence(manifestPath, entry, 'stderr');
  }
  const completedRunCount = manifest.runs.filter(({ processStatus }) => processStatus === 'completed').length;
  const collectionComplete = manifest.recordedRunCount === manifest.plannedRunCount;
  if (collectionComplete
      && JSON.stringify([...runIds].sort()) !== JSON.stringify([...expectedRunIds].sort())) {
    throw new Error('manifest planned run set is incomplete');
  }
  const evidenceEligible = manifest.collectionStatus === 'complete'
    && collectionComplete
    && completedRunCount === manifest.plannedRunCount
    && manifest.workspace.cleanupStatus === 'removed'
    && manifest.runs.every(({ mechanicalShape }) => mechanicalShape === null || mechanicalShape.pass);
  if (manifest.completedRunCount !== completedRunCount
      || manifest.collectionStatus !== (collectionComplete ? 'complete' : 'aborted')
      || manifest.evidenceEligible !== evidenceEligible) {
    throw new Error('manifest collection status/count/evidenceEligible projection is inconsistent');
  }
}

function recordReview(manifestArgument, reviewArgument) {
  const manifestPath = requireCanonicalManifest(manifestArgument);
  const reviewInputPath = requireRegularFile(reviewArgument, 'review file');
  const manifestBytes = fs.readFileSync(manifestPath);
  const manifest = JSON.parse(manifestBytes.toString('utf-8'));
  validateManifestForReview(manifestPath, manifest);
  if (manifest.manualReview) throw new Error('manifest already references a manual review');
  const review = JSON.parse(fs.readFileSync(reviewInputPath, 'utf-8'));
  if (typeof review.reviewer !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u.test(review.reviewer)) {
    throw new Error('reviewer must be a safe identifier');
  }
  if (!validDate(review.reviewedAt)) {
    throw new Error('reviewedAt must be a strict RFC3339 timestamp');
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
  const runById = new Map(manifest.runs.map((entry) => [entry.runId, entry]));
  for (const entry of review.runs) {
    if (!['pass', 'fail', 'incomplete'].includes(entry.verdict)
        || typeof entry.notes !== 'string' || entry.notes.trim().length === 0 || entry.notes.length > 2000) {
      throw new Error(`manual review entry ${entry.runId} has invalid verdict or notes`);
    }
    const run = runById.get(entry.runId);
    if (entry.verdict === 'pass' && run.processStatus !== 'completed') {
      throw new Error(`${entry.runId} ${run.processStatus} can only be reviewed fail or incomplete`);
    }
    if (entry.verdict === 'pass' && run.mechanicalShape !== null && !run.mechanicalShape.pass) {
      throw new Error(`${entry.runId} mechanical shape failure can only be reviewed fail or incomplete`);
    }
  }
  const everyRunPasses = review.runs.every(({ verdict }) => verdict === 'pass');
  if ((review.overallVerdict === 'pass') !== everyRunPasses) {
    throw new Error('overallVerdict pass requires every run verdict to pass');
  }
  if (review.overallVerdict === 'pass' && !manifest.evidenceEligible) {
    throw new Error('overall pass requires a complete non-aborted evidenceEligible collection');
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
  if (fs.realpathSync(resultsRoot) !== resultsRoot) {
    throw new Error('results collection and parents must not contain a symlink');
  }
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
    shapeContract: selected.mechanicalShape ? { id: selected.mechanicalShape } : null,
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
    collectionStatus: 'in-progress',
    plannedRunCount: runs.length,
    recordedRunCount: 0,
    completedRunCount: 0,
    evidenceEligible: false,
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
      const stdout = child.stdout || '';
      const stderr = `${child.stderr || ''}${child.error ? `\ncollectorError=${child.error.message}\n` : ''}`;
      fs.writeFileSync(path.join(runDirectory, stdoutRef), stdout, 'utf-8');
      fs.writeFileSync(path.join(runDirectory, stderrRef), stderr, 'utf-8');
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
        mechanicalShape: mechanicalShapeFor(selected.mechanicalShape, stdout),
        stdoutRef,
        stdoutSha256: sha256(Buffer.from(stdout, 'utf-8')),
        stderrRef,
        stderrSha256: sha256(Buffer.from(stderr, 'utf-8')),
        assertions: [...selected.assertions],
        forbidden: [...selected.forbidden],
        semanticVerdict: null,
        reviewerNotes: null,
      });
      manifest.recordedRunCount = manifest.runs.length;
      manifest.completedRunCount = manifest.runs.filter((entry) => entry.processStatus === 'completed').length;
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
    manifest.recordedRunCount = manifest.runs.length;
    manifest.completedRunCount = manifest.runs.filter(({ processStatus }) => processStatus === 'completed').length;
    manifest.collectionStatus = manifest.recordedRunCount === manifest.plannedRunCount ? 'complete' : 'aborted';
    manifest.evidenceEligible = manifest.collectionStatus === 'complete'
      && manifest.completedRunCount === manifest.plannedRunCount
      && manifest.workspace.cleanupStatus === 'removed'
      && manifest.runs.every(({ mechanicalShape }) => mechanicalShape === null || mechanicalShape.pass);
    writeJson(manifestPath, manifest);
  }

  if (cleanupError) throw cleanupError;

  const collectionComplete = manifest.evidenceEligible;
  console.log(JSON.stringify({ collectionComplete, semanticScoring: 'manual-required', manifestPath }, null, 2));
  process.exit(collectionComplete ? 0 : 1);
} catch (error) {
  console.error(`Eval collector error: ${error.message}`);
  process.exit(2);
}
