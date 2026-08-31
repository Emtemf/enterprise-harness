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

function validateEvalDefinition(value) {
  if (!value || !Array.isArray(value.cases) || value.cases.length === 0) {
    throw new Error('eval corpus must contain at least one case');
  }
  const ids = new Set();
  for (const entry of value.cases) {
    if (!entry || typeof entry.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(entry.id)
        || ids.has(entry.id)) {
      throw new Error('eval case IDs must be unique safe identifiers');
    }
    ids.add(entry.id);
    for (const field of ['assertions', 'forbidden']) {
      if (!Array.isArray(entry[field]) || entry[field].length === 0
          || entry[field].some((item) => typeof item !== 'string' || item.trim().length === 0)) {
        throw new Error(`${entry.id} must contain non-empty ${field} strings`);
      }
    }
  }
  const compound = value.cases.find(({ id }) => id === 'compound-design-proof-before-plan');
  if (compound) {
    if (!/test-design|测试设计/u.test(compound.prompt || '')
        || !compound.assertions.some((item) => /六阶段.*第七阶段/u.test(item))
        || !compound.assertions.some((item) => /architecture.*execute.*review.*seal.*test-design.*execute.*review.*DesignProof/iu.test(item))
        || !compound.assertions.some((item) => /test-cases\.md.*独立权威.*Plan.*test-cases\.md.*DesignProof/u.test(item))
        || !compound.forbidden.some((item) => /seal.*test-design.*Plan/u.test(item))
        || !compound.forbidden.some((item) => /architecture Design.*详细测试数据.*步骤.*E2E journey/u.test(item))
        || !compound.forbidden.some((item) => /chat.*单一 Design result.*DesignProof/u.test(item))) {
      throw new Error('compound-design-proof-before-plan has an incomplete closed assertion/forbidden contract');
    }
  }
}

validateEvalDefinition(definition);

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
    ...(toolProfile === 'read-only'
      ? ['--allowedTools', 'Read', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}']
      : []),
    '--permission-mode', toolProfile === 'read-only' ? 'dontAsk' : 'plan',
    '--no-session-persistence',
    '--output-format', 'stream-json',
    '--verbose',
    '--max-turns', '8',
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

function validateControllerSnapshot(snapshot) {
  const required = [
    'snapshotVersion', 'changeId', 'stage', 'lifecycle', 'currentTask', 'clarifyReadiness',
    'requiredLanes', 'factGateOpen', 'earliestInvalidGate', 'pendingDecision',
    'runtimeNextAction', 'artifactFreshness', 'clarifyTransitionReady',
  ];
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)
      || !required.every((field) => Object.hasOwn(snapshot, field))
      || !['research', 'decisions', 'completion', 'transition'].includes(snapshot.clarifyReadiness?.route)
      || !snapshot.requiredLanes || typeof snapshot.requiredLanes !== 'object' || Array.isArray(snapshot.requiredLanes)
      || !snapshot.artifactFreshness || typeof snapshot.artifactFreshness !== 'object' || Array.isArray(snapshot.artifactFreshness)) {
    throw new Error('controller-snapshot.json must contain the complete routing action envelope');
  }
}

function workspaceFilesFor(selected) {
  const files = selected.workspaceFiles || {};
  if (!files || typeof files !== 'object' || Array.isArray(files)) {
    throw new Error('eval workspaceFiles must be an object');
  }
  return Object.entries(files).map(([ref, value]) => {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(ref) || ref.includes('..')) {
      throw new Error(`eval workspace file ${ref} must be a safe root filename`);
    }
    if (ref === 'controller-snapshot.json') validateControllerSnapshot(value);
    const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf-8');
    return { ref, sha256: sha256(bytes) };
  }).sort((left, right) => left.ref.localeCompare(right.ref));
}

function runPlan(selected, model, selectedVariants, repetitions, timeoutMs) {
  return selectedVariants.flatMap((variant) => Array.from({ length: repetitions }, (_, index) => ({
    runId: `${variant}-${String(index + 1).padStart(2, '0')}`,
    variant,
    repetition: index + 1,
    command: 'claude',
    argv: argvFor(selected, model, variant),
    isolationArgv: isolationArgvFor(variant),
    workspaceFiles: workspaceFilesFor(selected),
    shell: false,
    timeoutMs,
  })));
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function parseClaudeStream(raw, { allowIncomplete = false } = {}) {
  const events = [];
  const lines = String(raw).split(/\r?\n/u);
  let finalContentIndex = lines.length - 1;
  while (finalContentIndex >= 0 && !lines[finalContentIndex].trim()) finalContentIndex -= 1;
  for (const [index, line] of lines.entries()) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      if (allowIncomplete && index === finalContentIndex) break;
      throw new Error(`Claude stream line ${index + 1} is not valid JSON`);
    }
  }
  const result = [...events].reverse().find((event) => event?.type === 'result');
  if (!result && !allowIncomplete) throw new Error('Claude stream has no final result event');
  const assistantText = events.flatMap((event) => event?.type === 'assistant'
    ? (event.message?.content || []).filter((block) => block?.type === 'text').map((block) => block.text || '')
    : []);
  const uses = events.flatMap((event) => event?.type === 'assistant'
    ? (event.message?.content || []).filter((block) => block?.type === 'tool_use').map((block) => ({
      id: block.id,
      name: block.name,
      input: block.input,
    }))
    : []);
  return {
    stdout: typeof result?.result === 'string' ? result.result : assistantText.join(''),
    uses,
    result: result ? {
      subtype: result.subtype ?? null,
      isError: result.is_error ?? null,
      totalCostUsd: result.total_cost_usd ?? null,
      numTurns: result.num_turns ?? null,
    } : null,
  };
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
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|([+-])(\d{2}):(\d{2}))$/u,
  );
  if (!match) return false;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText,
    zoneText, offsetSign, offsetHourText, offsetMinuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const calendarAndClockValid = month >= 1
    && month <= 12
    && day >= 1
    && day <= daysInMonth[month - 1]
    && Number(hourText) <= 23
    && Number(minuteText) <= 59
    && (offsetHourText === undefined || Number(offsetHourText) <= 23)
    && (offsetMinuteText === undefined || Number(offsetMinuteText) <= 59);
  if (!calendarAndClockValid) return false;
  const second = Number(secondText);
  if (second <= 59) return true;
  if (second !== 60) return false;
  const offsetMinutes = zoneText === 'Z' ? 0 : (offsetSign === '+' ? 1 : -1)
    * (Number(offsetHourText) * 60 + Number(offsetMinuteText));
  const utc = new Date(Date.UTC(year, month - 1, day, Number(hourText), Number(minuteText), 59)
    - offsetMinutes * 60_000);
  return utc.getUTCHours() === 23
    && utc.getUTCMinutes() === 59
    && ((utc.getUTCMonth() === 5 && utc.getUTCDate() === 30)
      || (utc.getUTCMonth() === 11 && utc.getUTCDate() === 31));
}

function validateWorkspaceRoot(workspaceRoot) {
  const canonicalTemp = fs.realpathSync(os.tmpdir());
  const resolved = typeof workspaceRoot === 'string' ? path.resolve(workspaceRoot) : '';
  const checkoutRelative = resolved ? path.relative(repoRoot, resolved) : '';
  const insideCheckout = checkoutRelative === ''
    || (!checkoutRelative.startsWith(`..${path.sep}`) && checkoutRelative !== '..' && !path.isAbsolute(checkoutRelative));
  if (workspaceRoot !== resolved
      || path.dirname(resolved) !== canonicalTemp
      || !/^eh-clarify-skill-eval-[A-Za-z0-9]{6}$/u.test(path.basename(resolved))
      || insideCheckout) {
    throw new Error('manifest workspace root must be a canonical owned tmp prefix outside checkout');
  }
  let stat;
  try {
    stat = fs.lstatSync(resolved);
  } catch {
    throw new Error('manifest workspace root must exist through manual review');
  }
  if (!stat.isDirectory() || stat.isSymbolicLink() || fs.realpathSync(resolved) !== resolved) {
    throw new Error('manifest workspace root must be an actual non-symlink directory through manual review');
  }
  return resolved;
}

function validateWorkspaceOwnership(workspace) {
  const workspaceRoot = validateWorkspaceRoot(workspace.root);
  if (workspace.markerRef !== '.eh-eval-workspace-owner.json'
      || !/^[a-f0-9]{64}$/u.test(workspace.markerSha256 || '')
      || !/^[a-f0-9]{64}$/u.test(workspace.markerNonce || '')) {
    throw new Error('manifest workspace ownership marker metadata is invalid');
  }
  const markerPath = path.join(workspaceRoot, workspace.markerRef);
  let stat;
  try {
    stat = fs.lstatSync(markerPath);
  } catch {
    throw new Error('manifest workspace ownership marker is missing');
  }
  if (!stat.isFile() || stat.isSymbolicLink() || fs.realpathSync(markerPath) !== markerPath) {
    throw new Error('manifest workspace ownership marker must be a regular non-symlink file');
  }
  const markerBytes = fs.readFileSync(markerPath);
  if (sha256(markerBytes) !== workspace.markerSha256) {
    throw new Error('manifest workspace ownership marker digest mismatch');
  }
  let marker;
  try {
    marker = JSON.parse(markerBytes.toString('utf-8'));
  } catch {
    throw new Error('manifest workspace ownership marker content is invalid');
  }
  if (marker.markerVersion !== 1
      || marker.type !== 'clarify-skill-eval-workspace-owner'
      || marker.nonce !== workspace.markerNonce
      || marker.workspaceRoot !== workspaceRoot
      || !validDate(marker.createdAt)) {
    throw new Error('manifest workspace ownership marker content is invalid');
  }
  return workspaceRoot;
}

function validateProcessOutcome(entry) {
  const completed = entry.processStatus === 'completed'
    && entry.exitCode === 0 && entry.signal === null && entry.timedOut === false;
  const nonzeroExit = entry.processStatus === 'exit-nonzero'
    && entry.timedOut === false
    && ((Number.isInteger(entry.exitCode) && entry.exitCode !== 0 && entry.signal === null)
      || (entry.exitCode === null && typeof entry.signal === 'string' && entry.signal.length > 0));
  const timeout = entry.processStatus === 'timeout'
    && ((entry.exitCode === null && typeof entry.signal === 'string' && entry.signal.length > 0)
      || (entry.exitCode === 143 && entry.signal === null))
    && entry.timedOut === true;
  if (!completed && !nonzeroExit && !timeout) {
    throw new Error(`${entry.runId} process outcome metadata is inconsistent`);
  }
}

function validateRunWorkspace(workspaceRoot, entry) {
  const expectedWorkspace = path.join(workspaceRoot, entry.runId);
  let workspaceStat;
  try {
    workspaceStat = fs.lstatSync(expectedWorkspace);
  } catch {
    throw new Error(`${entry.runId} run workspace is missing`);
  }
  if (!workspaceStat.isDirectory() || workspaceStat.isSymbolicLink()
      || fs.realpathSync(expectedWorkspace) !== expectedWorkspace) {
    throw new Error(`${entry.runId} run workspace must be an actual non-symlink directory`);
  }
  for (const fixture of entry.workspaceFiles || []) {
    const target = path.join(expectedWorkspace, fixture.ref);
    const stat = fs.lstatSync(target);
    if (!stat.isFile() || stat.isSymbolicLink() || fs.realpathSync(target) !== target
        || sha256(fs.readFileSync(target)) !== fixture.sha256) {
      throw new Error(`${entry.runId} workspace fixture ${fixture.ref} is invalid`);
    }
  }
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

function validateTraceEvidence(manifestPath, entry) {
  const collectionDir = path.dirname(manifestPath);
  const expectedRef = `outputs/${entry.runId}.trace.jsonl`;
  if (entry.traceRef !== expectedRef || !/^[a-f0-9]{64}$/u.test(entry.traceSha256 || '')) {
    throw new Error(`${entry.runId} trace metadata is invalid`);
  }
  const target = path.join(collectionDir, ...expectedRef.split('/'));
  const stat = fs.lstatSync(target);
  if (!stat.isFile() || stat.isSymbolicLink() || fs.realpathSync(target) !== target) {
    throw new Error(`${entry.runId} trace must be a regular non-symlink file in this collection`);
  }
  const bytes = fs.readFileSync(target);
  if (sha256(bytes) !== entry.traceSha256) throw new Error(`${entry.runId} trace digest mismatch`);
  const parsed = parseClaudeStream(bytes.toString('utf-8'), { allowIncomplete: entry.processStatus !== 'completed' });
  if (JSON.stringify(entry.toolEvidence) !== JSON.stringify({ uses: parsed.uses })
      || JSON.stringify(entry.claudeResult) !== JSON.stringify(parsed.result)) {
    throw new Error(`${entry.runId} trace projection mismatch`);
  }
  const stdoutPath = path.join(collectionDir, ...entry.stdoutRef.split('/'));
  if (fs.readFileSync(stdoutPath, 'utf-8') !== parsed.stdout) {
    throw new Error(`${entry.runId} stdout does not match the Claude stream result`);
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
      || manifest.workspace.cleanupStatus !== 'retained-for-review') {
    throw new Error('manifest workspace cleanup metadata is invalid');
  }
  const workspaceRoot = validateWorkspaceOwnership(manifest.workspace);
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
    validateProcessOutcome(entry);
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
        || JSON.stringify(entry.workspaceFiles) !== JSON.stringify(planned.workspaceFiles)
        || entry.shell !== planned.shell
        || entry.timeoutMs !== planned.timeoutMs
        || entry.cwdRef !== `temporary:${entry.runId}`
        || entry.cwd !== path.join(manifest.workspace.root, entry.runId)
        || JSON.stringify(entry.assertions) !== JSON.stringify(selectedCase.assertions)
        || JSON.stringify(entry.forbidden) !== JSON.stringify(selectedCase.forbidden)) {
      throw new Error(`${entry.runId} does not match the recomputed execution plan`);
    }
    validateRunWorkspace(workspaceRoot, entry);
    validateOutputEvidence(manifestPath, entry, 'stdout');
    validateOutputEvidence(manifestPath, entry, 'stderr');
    validateTraceEvidence(manifestPath, entry);
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
    && manifest.workspace.cleanupStatus === 'retained-for-review'
    && manifest.runs.every(({ mechanicalShape }) => mechanicalShape === null || mechanicalShape.pass);
  if (manifest.completedRunCount !== completedRunCount
      || manifest.collectionStatus !== (collectionComplete ? 'complete' : 'aborted')
      || manifest.evidenceEligible !== evidenceEligible) {
    throw new Error('manifest collection status/count/evidenceEligible projection is inconsistent');
  }
}

function replaceJsonAtomically(target, value) {
  const temporary = path.join(path.dirname(target), `.${path.basename(target)}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`);
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
    fs.renameSync(temporary, target);
  } finally {
    if (fs.existsSync(temporary)) fs.rmSync(temporary);
  }
}

function injectReviewFailure(point) {
  if (process.env.EH_EVAL_TEST_FAIL_AFTER === point) {
    throw new Error(`injected review cleanup failure ${point}`);
  }
}

function comparableReview(review) {
  return {
    reviewer: review.reviewer,
    reviewedAt: review.reviewedAt,
    overallVerdict: review.overallVerdict,
    runs: Array.isArray(review.runs)
      ? review.runs.map(({ runId, verdict, notes }) => ({ runId, verdict, notes: typeof notes === 'string' ? notes.trim() : notes }))
      : null,
  };
}

function preReviewProjection(manifest) {
  const projected = {
    ...manifest,
    workspace: { ...manifest.workspace, cleanupStatus: 'retained-for-review' },
  };
  delete projected.manualReview;
  delete projected.workspace.cleanupPending;
  return projected;
}

function finalizeReviewCleanup(manifestPath, manifest, reviewInput) {
  const collectionDir = path.dirname(manifestPath);
  const canonicalReviewPath = path.join(collectionDir, 'manual-review.json');
  const canonicalReviewFile = requireRegularFile(canonicalReviewPath, 'canonical review');
  if (fs.realpathSync(canonicalReviewFile) !== canonicalReviewFile) {
    throw new Error('canonical review and parents must not contain a symlink');
  }
  const reviewBytes = fs.readFileSync(canonicalReviewFile);
  if (sha256(reviewBytes) !== manifest.manualReview?.sha256) {
    throw new Error('canonical review digest mismatch during cleanup resume');
  }
  const canonicalReview = JSON.parse(reviewBytes.toString('utf-8'));
  if (JSON.stringify(comparableReview(reviewInput)) !== JSON.stringify(comparableReview(canonicalReview))) {
    throw new Error('cleanup resume requires the same canonical review');
  }
  const pending = manifest.workspace?.cleanupPending;
  if (manifest.workspace?.cleanupStatus !== 'pending-after-review'
      || pending?.reviewSha256 !== manifest.manualReview.sha256
      || pending?.markerSha256 !== manifest.workspace.markerSha256
      || pending?.workspaceRootSha256 !== sha256(Buffer.from(manifest.workspace.root, 'utf-8'))
      || canonicalReview.manifestSha256 !== sha256(Buffer.from(`${JSON.stringify(preReviewProjection(manifest), null, 2)}\n`, 'utf-8'))) {
    throw new Error('pending review cleanup metadata is inconsistent');
  }
  if (fs.existsSync(manifest.workspace.root)) {
    const workspaceRoot = validateWorkspaceOwnership(manifest.workspace);
    for (const entry of manifest.runs) validateRunWorkspace(workspaceRoot, entry);
    removeOwnedTemporaryWorkspace(workspaceRoot);
  }
  injectReviewFailure('after-workspace-remove');
  const workspace = {
    ...manifest.workspace,
    cleanupStatus: 'removed-after-review',
    cleanupReceipt: {
      reviewSha256: manifest.manualReview.sha256,
      markerSha256: manifest.workspace.markerSha256,
      workspaceRootSha256: sha256(Buffer.from(manifest.workspace.root, 'utf-8')),
      removedAt: new Date().toISOString(),
    },
  };
  delete workspace.cleanupPending;
  replaceJsonAtomically(manifestPath, { ...manifest, workspace });
  console.log(JSON.stringify({ manifestPath, manualReviewRef: 'manual-review.json' }, null, 2));
}

function recordReview(manifestArgument, reviewArgument) {
  const manifestPath = requireCanonicalManifest(manifestArgument);
  const reviewInputPath = requireRegularFile(reviewArgument, 'review file');
  const manifestBytes = fs.readFileSync(manifestPath);
  const manifest = JSON.parse(manifestBytes.toString('utf-8'));
  const review = JSON.parse(fs.readFileSync(reviewInputPath, 'utf-8'));
  if (manifest.workspace?.cleanupStatus === 'pending-after-review' && manifest.manualReview) {
    finalizeReviewCleanup(manifestPath, manifest, review);
    return;
  }
  validateManifestForReview(manifestPath, manifest);
  if (manifest.manualReview) throw new Error('manifest already references a manual review');
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
  const reviewSha256 = sha256(reviewBytes);
  const pendingManifest = {
    ...manifest,
    manualReview: {
      ref: 'manual-review.json',
      sha256: reviewSha256,
      reviewer: canonicalReview.reviewer,
      reviewedAt: canonicalReview.reviewedAt,
      overallVerdict: canonicalReview.overallVerdict,
    },
    workspace: {
      ...manifest.workspace,
      cleanupStatus: 'pending-after-review',
      cleanupPending: {
        reviewSha256,
        markerSha256: manifest.workspace.markerSha256,
        workspaceRootSha256: sha256(Buffer.from(manifest.workspace.root, 'utf-8')),
      },
    },
  };
  let reviewCreated = false;
  let pendingCommitted = false;
  try {
    fs.writeFileSync(canonicalReviewPath, reviewBytes, { flag: 'wx' });
    reviewCreated = true;
    replaceJsonAtomically(manifestPath, pendingManifest);
    pendingCommitted = true;
  } catch (error) {
    if (reviewCreated && !pendingCommitted && fs.existsSync(canonicalReviewPath)) fs.rmSync(canonicalReviewPath);
    throw error;
  }
  injectReviewFailure('after-review-commit');
  finalizeReviewCleanup(manifestPath, pendingManifest, review);
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
  const workspaceRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'eh-clarify-skill-eval-')));
  const markerRef = '.eh-eval-workspace-owner.json';
  const markerNonce = crypto.randomBytes(32).toString('hex');
  const markerBytes = Buffer.from(`${JSON.stringify({
    markerVersion: 1,
    type: 'clarify-skill-eval-workspace-owner',
    nonce: markerNonce,
    workspaceRoot,
    createdAt: new Date().toISOString(),
  })}\n`, 'utf-8');
  fs.writeFileSync(path.join(workspaceRoot, markerRef), markerBytes, { flag: 'wx', mode: 0o600 });
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
    workspace: {
      strategy: 'mkdtemp-outside-checkout',
      root: workspaceRoot,
      markerRef,
      markerNonce,
      markerSha256: sha256(markerBytes),
      cleanupStatus: 'pending',
    },
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

  try {
    for (const planned of runs) {
      const workspace = path.join(workspaceRoot, planned.runId);
      fs.mkdirSync(workspace);
      for (const fixture of planned.workspaceFiles) {
        const value = selected.workspaceFiles[fixture.ref];
        fs.writeFileSync(path.join(workspace, fixture.ref), `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
      }
      const stdoutRef = `outputs/${planned.runId}.stdout.txt`;
      const stderrRef = `outputs/${planned.runId}.stderr.txt`;
      const traceRef = `outputs/${planned.runId}.trace.jsonl`;
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
      const trace = child.stdout || '';
      const parsedTrace = parseClaudeStream(trace, { allowIncomplete: processStatus !== 'completed' });
      const stdout = parsedTrace.stdout;
      const stderr = `${child.stderr || ''}${child.error ? `\ncollectorError=${child.error.message}\n` : ''}`;
      fs.writeFileSync(path.join(runDirectory, stdoutRef), stdout, 'utf-8');
      fs.writeFileSync(path.join(runDirectory, stderrRef), stderr, 'utf-8');
      fs.writeFileSync(path.join(runDirectory, traceRef), trace, 'utf-8');
      manifest.runs.push({
        ...planned,
        cwd: workspace,
        cwdRef: `temporary:${planned.runId}`,
        startedAt: startedAt.toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt.getTime(),
        exitCode: child.status,
        signal: child.signal,
        timedOut,
        processStatus,
        mechanicalShape: mechanicalShapeFor(selected.mechanicalShape, stdout),
        stdoutRef,
        stdoutSha256: sha256(Buffer.from(stdout, 'utf-8')),
        stderrRef,
        stderrSha256: sha256(Buffer.from(stderr, 'utf-8')),
        traceRef,
        traceSha256: sha256(Buffer.from(trace, 'utf-8')),
        toolEvidence: { uses: parsedTrace.uses },
        claudeResult: parsedTrace.result,
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
    manifest.workspace.cleanupStatus = 'retained-for-review';
    manifest.recordedRunCount = manifest.runs.length;
    manifest.completedRunCount = manifest.runs.filter(({ processStatus }) => processStatus === 'completed').length;
    manifest.collectionStatus = manifest.recordedRunCount === manifest.plannedRunCount ? 'complete' : 'aborted';
    manifest.evidenceEligible = manifest.collectionStatus === 'complete'
      && manifest.completedRunCount === manifest.plannedRunCount
      && manifest.workspace.cleanupStatus === 'retained-for-review'
      && manifest.runs.every(({ mechanicalShape }) => mechanicalShape === null || mechanicalShape.pass);
    writeJson(manifestPath, manifest);
  }

  const collectionComplete = manifest.evidenceEligible;
  console.log(JSON.stringify({ collectionComplete, semanticScoring: 'manual-required', manifestPath }, null, 2));
  process.exit(collectionComplete ? 0 : 1);
} catch (error) {
  console.error(`Eval collector error: ${error.message}`);
  process.exit(2);
}
