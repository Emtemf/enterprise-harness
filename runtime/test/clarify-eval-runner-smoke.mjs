import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const mode = process.argv[2] || 'verify';
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);
const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const checkoutRoot = path.resolve(repoRoot);
const runner = path.join(repoRoot, 'test', 'skill-evals', 'harness', 'run.mjs');
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-clarify-eval-runner-'));
const binDir = path.join(sandbox, 'bin');
const resultsDir = path.join(sandbox, 'results');
const pollutedConfigDir = path.join(sandbox, 'polluted-claude-config');
fs.mkdirSync(binDir);
fs.mkdirSync(pollutedConfigDir);
fs.writeFileSync(path.join(pollutedConfigDir, 'settings.json'), `${JSON.stringify({
  enabledPlugins: { 'enterprise-harness@enterprise-harness': true },
  plugins: { dirs: ['/installed/enterprise-harness'] },
}, null, 2)}\n`);
const fakeClaude = path.join(binDir, process.platform === 'win32' ? 'claude.cmd' : 'claude');
fs.writeFileSync(fakeClaude, `#!/usr/bin/env node
const mode = process.env.EH_FAKE_CLAUDE_MODE || 'success';
const stream = process.argv.slice(2).includes('--output-format')
  && process.argv[process.argv.indexOf('--output-format') + 1] === 'stream-json';
function emit(result, toolUses = []) {
  if (!stream) { process.stdout.write(result); return; }
  for (const tool of toolUses) process.stdout.write(JSON.stringify({
    type: 'assistant', message: { content: [{ type: 'tool_use', ...tool }] },
  }) + '\\n');
  process.stdout.write(JSON.stringify({ type: 'result', subtype: 'success', result }) + '\\n');
}
if (process.argv.slice(2).includes('--version')) process.stdout.write('2.1.245 (Claude Code)\\n');
else if (mode === 'hang') setInterval(() => {}, 1000);
else if (mode === 'hang-exit143') {
  process.on('SIGTERM', () => process.exit(143));
  setInterval(() => {}, 1000);
}
else if (mode === 'partial-exit') {
  process.stdout.write(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'partial evidence' }] } }) + '\\n');
  process.stdout.write('{"type":"result"');
  process.exitCode = 7;
}
else {
  const fs = require('node:fs');
  const path = require('node:path');
  const config = JSON.parse(fs.readFileSync(path.join(process.env.CLAUDE_CONFIG_DIR, 'settings.json'), 'utf-8'));
  if (mode === 'shape' || mode === 'shape-bad') {
    const shaped = [
      'Fact lanes: code=pending, docs=pending',
      'Next research action/blocker: tools disabled in Plan mode',
      'Topology: not built',
      'Scores: not computed',
      'User question: none',
    ].join('\\n');
    const fence = String.fromCharCode(96).repeat(3);
    emit(mode === 'shape-bad' ? fence + '\\n' + shaped + '\\n' + fence : shaped);
  }
  else emit(JSON.stringify({ argv: process.argv.slice(2), mode, cwd: process.cwd(), config }), mode === 'trace-read'
    ? [{ id: 'tool-1', name: 'Read', input: { file_path: 'controller-snapshot.json' } }]
    : []);
  if (mode === 'fail') { process.stderr.write('fixture failure\\n'); process.exitCode = 7; }
}
`);
fs.chmodSync(fakeClaude, 0o755);

function run(args, fakeMode = 'success', extraEnv = {}) {
  return spawnSync(process.execPath, [runner, ...args], {
    cwd: repoRoot,
    encoding: 'utf-8',
    shell: false,
    env: {
      ...process.env,
      PATH: `${binDir}${path.delimiter}${process.env.PATH || ''}`,
      EH_FAKE_CLAUDE_MODE: fakeMode,
      CLAUDE_CONFIG_DIR: pollutedConfigDir,
      ...extraEnv,
    },
  });
}

function onlyManifest(directory) {
  return JSON.parse(fs.readFileSync(onlyManifestPath(directory), 'utf-8'));
}

function onlyManifestPath(directory) {
  const manifests = fs.readdirSync(directory, { recursive: true })
    .filter((entry) => String(entry).endsWith('scoring-manifest.json'));
  assert.equal(manifests.length, 1);
  return path.join(directory, manifests[0]);
}

function manifestPaths(directory) {
  return fs.readdirSync(directory, { recursive: true })
    .filter((entry) => String(entry).endsWith('scoring-manifest.json'))
    .map((entry) => path.join(directory, entry));
}

function writeReviewInput(
  target,
  manifest,
  overallVerdict = 'pass',
  verdictFor = () => 'pass',
  reviewedAt = '2026-08-26T00:00:00.000Z',
) {
  fs.writeFileSync(target, `${JSON.stringify({
    reviewer: 'root-controller',
    reviewedAt,
    overallVerdict,
    runs: manifest.runs.map((entry) => ({
      runId: entry.runId,
      verdict: verdictFor(entry),
      notes: `Manual fixture verdict for ${entry.runId}.`,
    })),
  }, null, 2)}\n`);
}

function cloneCollection(sourceManifestPath, name, mutate = () => {}) {
  const targetDir = path.join(sandbox, 'collection-fixtures', name);
  fs.mkdirSync(path.dirname(targetDir), { recursive: true });
  fs.cpSync(path.dirname(sourceManifestPath), targetDir, { recursive: true });
  const targetManifestPath = path.join(targetDir, 'scoring-manifest.json');
  const targetManifest = JSON.parse(fs.readFileSync(targetManifestPath, 'utf-8'));
  targetManifest.manifestPath = targetManifestPath;
  delete targetManifest.manualReview;
  mutate(targetManifest, targetDir);
  fs.writeFileSync(targetManifestPath, `${JSON.stringify(targetManifest, null, 2)}\n`);
  return { manifest: targetManifest, manifestPath: targetManifestPath, directory: targetDir };
}

try {
  const help = run(['--help']);
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /--reps <n>/u);
  assert.match(help.stdout, /--timeout-ms <ms>/u);
  assert.match(help.stdout, /--results-dir <path>/u);
  assert.match(help.stdout, /--variant <name>/u);
  assert.match(help.stdout, /--record-review <manifest>/u);
  assert.match(help.stdout, /control.*with-skill/isu);

  const dry = run(['--case', 'question-must-be-pre-authorized', '--model', 'sonnet', '--dry-run']);
  assert.equal(dry.status, 0, dry.stderr);
  const plan = JSON.parse(dry.stdout);
  assert.equal(plan.repetitionsPerVariant, 5);
  assert.equal(plan.runs.length, 10);
  assert.deepEqual([...new Set(plan.runs.map(({ variant }) => variant))], ['control', 'with-skill']);
  assert.ok(plan.runs.every(({ argv, shell, timeoutMs }) => (
    argv.includes('--no-session-persistence')
      && argv.includes('--output-format') && argv[argv.indexOf('--output-format') + 1] === 'stream-json'
      && argv.includes('--max-turns') && argv[argv.indexOf('--max-turns') + 1] === '8'
      && argv.includes('--verbose') && shell === false && timeoutMs > 0
  )));
  assert.ok(plan.runs.every(({ argv }) => (
    argv.includes('--permission-mode') && argv[argv.indexOf('--permission-mode') + 1] === 'plan'
  )), 'no-tools interview evals must retain Plan mode');
  const controls = plan.runs.filter(({ variant }) => variant === 'control');
  const guided = plan.runs.filter(({ variant }) => variant === 'with-skill');
  assert.ok(controls.every(({ argv, isolationArgv }) => (
    JSON.stringify(isolationArgv) === JSON.stringify(['--safe-mode', '--disable-slash-commands', '--setting-sources', ''])
      && argv.includes('--safe-mode')
      && argv.includes('--disable-slash-commands')
      && !argv.includes('--plugin-dir')
      && !argv.at(-1).includes('/enterprise-harness:harness')
  )));
  assert.ok(guided.every(({ argv, isolationArgv }) => (
    JSON.stringify(isolationArgv) === JSON.stringify(['--setting-sources', '', '--plugin-dir', checkoutRoot])
      && !argv.includes('--safe-mode')
      && !argv.includes('--disable-slash-commands')
      && argv.filter((item) => item === '--plugin-dir').length === 1
      && argv[argv.indexOf('--plugin-dir') + 1] === checkoutRoot
      && argv.at(-1).startsWith('/enterprise-harness:harness\n\n')
  )));
  assert.equal(fs.existsSync(resultsDir), false, 'dry-run must not persist results');

  const guidedDry = run([
    '--case', 'fact-lanes-before-interview', '--model', 'sonnet',
    '--variant', 'with-skill', '--reps', '5', '--dry-run',
  ]);
  assert.equal(guidedDry.status, 0, guidedDry.stderr);
  const guidedPlan = JSON.parse(guidedDry.stdout);
  assert.deepEqual(guidedPlan.variants, ['with-skill']);
  assert.equal(guidedPlan.runs.length, 5);
  assert.ok(guidedPlan.runs.every(({ variant }) => variant === 'with-skill'));

  const routingDry = run([
    '--case', 'reference-routing-research', '--model', 'sonnet',
    '--variant', 'with-skill', '--reps', '5', '--dry-run',
  ]);
  assert.equal(routingDry.status, 0, routingDry.stderr);
  const routingPlan = JSON.parse(routingDry.stdout);
  assert.ok(routingPlan.runs.every(({ argv }) => (
    argv.includes('--tools') && argv[argv.indexOf('--tools') + 1] === 'Read'
      && argv.includes('--allowedTools') && argv[argv.indexOf('--allowedTools') + 1] === 'Read'
      && argv.includes('--permission-mode') && argv[argv.indexOf('--permission-mode') + 1] === 'dontAsk'
      && argv.includes('--strict-mcp-config')
      && argv.includes('--mcp-config') && argv[argv.indexOf('--mcp-config') + 1] === '{"mcpServers":{}}'
  )), 'tool-enabled reference routing must use the declared read-only tool profile');
  assert.ok(routingPlan.runs.every(({ workspaceFiles }) => (
    workspaceFiles.length === 1
      && workspaceFiles[0].ref === 'controller-snapshot.json'
      && /^[a-f0-9]{64}$/u.test(workspaceFiles[0].sha256)
  )), 'routing evals must bind a durable controller snapshot fixture');

  const routingTraceDir = path.join(sandbox, 'routing-trace');
  const routingTrace = run([
    '--case', 'reference-routing-research', '--model', 'sonnet',
    '--variant', 'with-skill', '--reps', '5', '--timeout-ms', '2000', '--results-dir', routingTraceDir,
  ], 'trace-read');
  assert.equal(routingTrace.status, 0, routingTrace.stderr);
  const routingTraceManifest = onlyManifest(routingTraceDir);
  assert.ok(routingTraceManifest.runs.every((entry) => (
    entry.toolEvidence.uses.length === 1
      && entry.toolEvidence.uses[0].name === 'Read'
      && entry.toolEvidence.uses[0].input.file_path === 'controller-snapshot.json'
      && fs.existsSync(path.join(entry.cwd, 'controller-snapshot.json'))
  )), 'structured trace must prove the fixture Read tool call');

  const completed = run([
    '--case', 'question-must-be-pre-authorized', '--model', 'sonnet',
    '--reps', '5', '--timeout-ms', '2000', '--results-dir', resultsDir,
  ]);
  assert.equal(completed.status, 0, completed.stderr);
  assert.match(completed.stderr, /START variant=control rep=1\/5/u);
  assert.match(completed.stderr, /DONE variant=with-skill rep=5\/5 status=completed/u);
  const manifest = onlyManifest(resultsDir);
  assert.equal(manifest.runs.length, 10);
  assert.equal(manifest.semanticScoring, 'manual-required');
  assert.equal(manifest.evalSuiteVersion, '0.5.11');
  assert.match(manifest.provenance.repositoryHead, /^[a-f0-9]{40}$/u);
  assert.equal(
    manifest.provenance.skillSha256,
    crypto.createHash('sha256').update(fs.readFileSync(path.join(repoRoot, 'skills/harness/SKILL.md'))).digest('hex'),
  );
  assert.equal(manifest.provenance.claudeVersion, '2.1.245 (Claude Code)');
  assert.equal(manifest.collectionStatus, 'complete');
  assert.equal(manifest.plannedRunCount, 10);
  assert.equal(manifest.recordedRunCount, 10);
  assert.equal(manifest.completedRunCount, 10);
  assert.equal(manifest.evidenceEligible, true);
  assert.equal(manifest.shapeContract, null);
  assert.equal(manifest.hostContaminationFixture, undefined, 'host configuration is evidence input, not copied into results');
  assert.equal(manifest.workspace.cleanupStatus, 'retained-for-review');
  assert.equal(fs.realpathSync(manifest.workspace.root), manifest.workspace.root,
    'collector must retain its actual external temporary workspace through review');
  assert.equal(path.dirname(manifest.workspace.root), fs.realpathSync(os.tmpdir()));
  assert.match(path.basename(manifest.workspace.root), /^eh-clarify-skill-eval-[A-Za-z0-9]{6}$/u);
  assert.equal(manifest.workspace.markerRef, '.eh-eval-workspace-owner.json');
  assert.match(manifest.workspace.markerNonce, /^[a-f0-9]{64}$/u);
  const ownershipMarkerPath = path.join(manifest.workspace.root, manifest.workspace.markerRef);
  assert.equal(fs.lstatSync(ownershipMarkerPath).isFile(), true);
  assert.equal(
    manifest.workspace.markerSha256,
    crypto.createHash('sha256').update(fs.readFileSync(ownershipMarkerPath)).digest('hex'),
  );
  assert.equal(JSON.parse(fs.readFileSync(ownershipMarkerPath, 'utf-8')).nonce, manifest.workspace.markerNonce);
  assert.equal(new Set(manifest.runs.map(({ cwdRef }) => cwdRef)).size, 10, 'every repetition must use a fresh workspace/process');
  assert.ok(manifest.runs.every((entry) => (
    entry.processStatus === 'completed'
      && entry.exitCode === 0
      && entry.signal === null
      && entry.timedOut === false
      && entry.semanticVerdict === null
      && entry.assertions.length > 0
      && entry.forbidden.length > 0
      && /^[a-f0-9]{64}$/u.test(entry.stdoutSha256)
      && /^[a-f0-9]{64}$/u.test(entry.stderrSha256)
      && entry.traceRef === `outputs/${entry.runId}.trace.jsonl`
      && /^[a-f0-9]{64}$/u.test(entry.traceSha256)
      && Array.isArray(entry.toolEvidence?.uses)
      && fs.existsSync(path.join(path.dirname(manifest.manifestPath), entry.stdoutRef))
      && fs.existsSync(path.join(path.dirname(manifest.manifestPath), entry.stderrRef))
      && fs.existsSync(path.join(path.dirname(manifest.manifestPath), entry.traceRef))
  )));
  for (const entry of manifest.runs) {
    const observed = JSON.parse(fs.readFileSync(path.join(path.dirname(manifest.manifestPath), entry.stdoutRef), 'utf-8'));
    assert.deepEqual(observed.argv, entry.argv, 'spawned Claude argv must exactly match the scoring manifest');
    assert.equal(observed.config.enabledPlugins['enterprise-harness@enterprise-harness'], true, 'fixture must simulate an enabled installed plugin');
    assert.equal(path.relative(checkoutRoot, observed.cwd).startsWith('..'), true, 'Claude cwd must remain outside the checkout');
    assert.equal(observed.cwd, entry.cwd, 'manifest must record the isolated cwd used for each output');
    assert.deepEqual(entry.isolationArgv, entry.variant === 'control'
      ? ['--safe-mode', '--disable-slash-commands', '--setting-sources', '']
      : ['--setting-sources', '', '--plugin-dir', checkoutRoot]);
  }

  const shapeDir = path.join(sandbox, 'shape');
  const shaped = run([
    '--case', 'fact-lanes-before-interview', '--model', 'sonnet',
    '--variant', 'with-skill', '--reps', '5', '--timeout-ms', '2000', '--results-dir', shapeDir,
  ], 'shape');
  assert.equal(shaped.status, 0, shaped.stderr);
  const shapeManifest = onlyManifest(shapeDir);
  assert.deepEqual(shapeManifest.variants, ['with-skill']);
  assert.equal(shapeManifest.runs.length, 5);
  assert.equal(shapeManifest.collectionStatus, 'complete');
  assert.equal(shapeManifest.plannedRunCount, 5);
  assert.equal(shapeManifest.recordedRunCount, 5);
  assert.equal(shapeManifest.completedRunCount, 5);
  assert.equal(shapeManifest.evidenceEligible, true);
  assert.deepEqual(shapeManifest.shapeContract, { id: 'terminal-fact-gate-v1' });
  assert.ok(shapeManifest.runs.every(({ mechanicalShape }) => (
    mechanicalShape?.id === 'terminal-fact-gate-v1'
      && mechanicalShape.pass === true
      && mechanicalShape.problems.length === 0
      && mechanicalShape.semanticPass === false
      && mechanicalShape.manualReviewRequired === true
      && mechanicalShape !== null
  )));

  const reviewInput = path.join(sandbox, 'review-input.json');
  writeReviewInput(reviewInput, shapeManifest, 'pass', () => 'pass', '2016-12-31T23:59:60Z');
  const preReviewBytes = fs.readFileSync(shapeManifest.manifestPath);
  const recorded = run([
    '--record-review', shapeManifest.manifestPath,
    '--review-file', reviewInput,
  ]);
  assert.equal(recorded.status, 0, recorded.stderr);
  const reviewedManifest = JSON.parse(fs.readFileSync(shapeManifest.manifestPath, 'utf-8'));
  assert.equal(reviewedManifest.manualReview.ref, 'manual-review.json');
  const canonicalReviewPath = path.join(path.dirname(shapeManifest.manifestPath), reviewedManifest.manualReview.ref);
  assert.equal(fs.lstatSync(canonicalReviewPath).isFile(), true);
  assert.equal(
    reviewedManifest.manualReview.sha256,
    crypto.createHash('sha256').update(fs.readFileSync(canonicalReviewPath)).digest('hex'),
  );
  assert.equal(reviewedManifest.workspace.cleanupStatus, 'removed-after-review');
  assert.equal(fs.existsSync(reviewedManifest.workspace.root), false);
  assert.equal(reviewedManifest.workspace.cleanupReceipt.reviewSha256, reviewedManifest.manualReview.sha256);
  assert.equal(reviewedManifest.workspace.cleanupReceipt.markerSha256, shapeManifest.workspace.markerSha256);
  assert.match(reviewedManifest.workspace.cleanupReceipt.removedAt, /^\d{4}-\d{2}-\d{2}T/u);
  const canonicalReview = JSON.parse(fs.readFileSync(canonicalReviewPath, 'utf-8'));
  assert.equal(canonicalReview.manifestSha256, crypto.createHash('sha256').update(preReviewBytes).digest('hex'),
    'manual review must bind the pre-review manifest containing output digests');
  assert.equal(run(['--record-review', shapeManifest.manifestPath, '--review-file', reviewInput]).status, 2,
    'manual review recording must refuse overwrite');

  for (const failurePoint of ['after-review-commit', 'after-workspace-remove']) {
    const phaseDir = path.join(sandbox, `cleanup-${failurePoint}`);
    assert.equal(run([
      '--case', 'fact-lanes-before-interview', '--variant', 'with-skill', '--reps', '5',
      '--timeout-ms', '2000', '--results-dir', phaseDir,
    ], 'shape').status, 0);
    const phaseManifest = onlyManifest(phaseDir);
    const phaseReviewInput = path.join(sandbox, `${failurePoint}-review.json`);
    writeReviewInput(phaseReviewInput, phaseManifest);
    const interrupted = run([
      '--record-review', phaseManifest.manifestPath, '--review-file', phaseReviewInput,
    ], 'success', { EH_EVAL_TEST_FAIL_AFTER: failurePoint });
    assert.equal(interrupted.status, 2, `${failurePoint} must expose an interrupted cleanup`);
    assert.match(interrupted.stderr, new RegExp(failurePoint, 'u'));
    const pendingManifest = JSON.parse(fs.readFileSync(phaseManifest.manifestPath, 'utf-8'));
    assert.equal(pendingManifest.workspace.cleanupStatus, 'pending-after-review');
    assert.equal(pendingManifest.workspace.cleanupPending.reviewSha256, pendingManifest.manualReview.sha256);
    assert.equal(fs.existsSync(path.join(path.dirname(phaseManifest.manifestPath), 'manual-review.json')), true,
      'phase A must retain the canonical review after interruption');
    assert.equal(
      fs.existsSync(pendingManifest.workspace.root),
      failurePoint === 'after-review-commit',
      'phase A keeps the workspace; phase B may remove it only after the pending manifest is durable',
    );
    const resumed = run(['--record-review', phaseManifest.manifestPath, '--review-file', phaseReviewInput]);
    assert.equal(resumed.status, 0, resumed.stderr);
    const finalizedManifest = JSON.parse(fs.readFileSync(phaseManifest.manifestPath, 'utf-8'));
    assert.equal(finalizedManifest.workspace.cleanupStatus, 'removed-after-review');
    assert.equal(finalizedManifest.workspace.cleanupReceipt.reviewSha256, finalizedManifest.manualReview.sha256);
    assert.equal(fs.existsSync(finalizedManifest.workspace.root), false);
  }

  const incompleteReview = path.join(sandbox, 'incomplete-review.json');
  fs.writeFileSync(incompleteReview, `${JSON.stringify({
    reviewer: 'root-controller',
    reviewedAt: '2026-08-26T00:00:00.000Z',
    overallVerdict: 'fail',
    runs: shapeManifest.runs.slice(1).map(({ runId }) => ({ runId, verdict: 'fail', notes: 'fixture' })),
  })}\n`);
  const unreviewedDir = path.join(sandbox, 'unreviewed');
  assert.equal(run([
    '--case', 'fact-lanes-before-interview', '--variant', 'with-skill', '--reps', '5',
    '--timeout-ms', '2000', '--results-dir', unreviewedDir,
  ], 'shape').status, 0);
  const unreviewedManifest = onlyManifest(unreviewedDir);
  assert.equal(run([
    '--record-review', unreviewedManifest.manifestPath, '--review-file', incompleteReview,
  ]).status, 2, 'manual review must cover every manifest run exactly once');

  const unreviewedManifestPath = onlyManifestPath(unreviewedDir);
  const passReviewFor = (fixture, label) => {
    const input = path.join(sandbox, `${label}-pass-review.json`);
    writeReviewInput(input, fixture.manifest);
    return run(['--record-review', fixture.manifestPath, '--review-file', input]);
  };

  const tampered = cloneCollection(unreviewedManifestPath, 'tampered-output');
  fs.appendFileSync(path.join(tampered.directory, tampered.manifest.runs[0].stdoutRef), '\ntampered');
  const tamperedReview = passReviewFor(tampered, 'tampered-output');
  assert.equal(tamperedReview.status, 2);
  assert.match(tamperedReview.stderr, /stdout digest mismatch/u);

  const stderrTampered = cloneCollection(unreviewedManifestPath, 'tampered-stderr');
  fs.appendFileSync(path.join(stderrTampered.directory, stderrTampered.manifest.runs[0].stderrRef), 'tampered');
  const stderrTamperedReview = passReviewFor(stderrTampered, 'tampered-stderr');
  assert.equal(stderrTamperedReview.status, 2);
  assert.match(stderrTamperedReview.stderr, /stderr digest mismatch/u);

  const traceTampered = cloneCollection(unreviewedManifestPath, 'tampered-trace');
  fs.appendFileSync(path.join(traceTampered.directory, traceTampered.manifest.runs[0].traceRef), '{}\n');
  const traceTamperedReview = passReviewFor(traceTampered, 'tampered-trace');
  assert.equal(traceTamperedReview.status, 2);
  assert.match(traceTamperedReview.stderr, /trace digest mismatch/u);

  const toolProjectionTampered = cloneCollection(unreviewedManifestPath, 'tampered-tool-projection', (candidate) => {
    candidate.runs[0].toolEvidence.uses.push({ id: 'forged', name: 'Read', input: { file_path: 'forged' } });
  });
  const toolProjectionTamperedReview = passReviewFor(toolProjectionTampered, 'tampered-tool-projection');
  assert.equal(toolProjectionTamperedReview.status, 2);
  assert.match(toolProjectionTamperedReview.stderr, /trace projection mismatch/u);

  const traversal = cloneCollection(unreviewedManifestPath, 'traversal-ref', (candidate) => {
    candidate.runs[0].stdoutRef = '../escape.txt';
  });
  const traversalReview = passReviewFor(traversal, 'traversal-ref');
  assert.equal(traversalReview.status, 2);
  assert.match(traversalReview.stderr, /canonical output ref/u);

  const mismatch = cloneCollection(unreviewedManifestPath, 'mismatched-manifest-path', (candidate) => {
    candidate.manifestPath = path.join(sandbox, 'wrong', 'scoring-manifest.json');
  });
  const mismatchReview = passReviewFor(mismatch, 'mismatched-manifest-path');
  assert.equal(mismatchReview.status, 2);
  assert.match(mismatchReview.stderr, /manifestPath.*canonical path/u);

  const malformedProvenance = cloneCollection(unreviewedManifestPath, 'malformed-provenance', (candidate) => {
    candidate.provenance.repositoryHead = 'not-a-head';
  });
  const malformedProvenanceReview = passReviewFor(malformedProvenance, 'malformed-provenance');
  assert.equal(malformedProvenanceReview.status, 2);
  assert.match(malformedProvenanceReview.stderr, /provenance/u);

  const malformedShape = cloneCollection(unreviewedManifestPath, 'malformed-shape', (candidate) => {
    candidate.shapeContract = { id: 'unknown-shape' };
  });
  const malformedShapeReview = passReviewFor(malformedShape, 'malformed-shape');
  assert.equal(malformedShapeReview.status, 2);
  assert.match(malformedShapeReview.stderr, /shape metadata/u);

  const malformedEval = cloneCollection(unreviewedManifestPath, 'malformed-eval', (candidate) => {
    candidate.evalSuiteVersion = '0.0.0';
  });
  const malformedEvalReview = passReviewFor(malformedEval, 'malformed-eval');
  assert.equal(malformedEvalReview.status, 2);
  assert.match(malformedEvalReview.stderr, /eval metadata/u);

  const planTamperMutations = [
    ['variant', (entry) => { entry.variant = 'control'; }],
    ['repetition', (entry) => { entry.repetition = 5; }],
    ['command', (entry) => { entry.command = 'claude-wrapper'; }],
    ['argv', (entry) => { entry.argv = [...entry.argv, '--tampered']; }],
    ['isolation-argv', (entry) => { entry.isolationArgv = ['--setting-sources', 'user']; }],
    ['shell', (entry) => { entry.shell = true; }],
    ['timeout', (entry) => { entry.timeoutMs += 1; }],
    ['cwd-ref', (entry) => { entry.cwdRef = 'temporary:with-skill-99'; }],
  ];
  for (const [label, mutate] of planTamperMutations) {
    const fixture = cloneCollection(unreviewedManifestPath, `tampered-plan-${label}`, (candidate) => {
      mutate(candidate.runs[0]);
    });
    const review = passReviewFor(fixture, `tampered-plan-${label}`);
    assert.equal(review.status, 2, `${label} tamper must invalidate manual evidence`);
    assert.match(review.stderr, /recomputed execution plan/u);
  }

  const tamperedIsolationProjection = cloneCollection(unreviewedManifestPath, 'tampered-isolation-projection', (candidate) => {
    candidate.isolation['with-skill'] = ['--safe-mode'];
  });
  const tamperedIsolationProjectionReview = passReviewFor(tamperedIsolationProjection, 'tampered-isolation-projection');
  assert.equal(tamperedIsolationProjectionReview.status, 2);
  assert.match(tamperedIsolationProjectionReview.stderr, /recomputed execution plan/u);

  const processOutcomeTamperMutations = [
    ['exit-code', (entry) => { entry.exitCode = 7; }],
    ['signal', (entry) => { entry.signal = 'SIGTERM'; }],
    ['timeout', (entry) => { entry.timedOut = true; }],
  ];
  for (const [label, mutate] of processOutcomeTamperMutations) {
    const fixture = cloneCollection(unreviewedManifestPath, `tampered-process-${label}`, (candidate) => {
      mutate(candidate.runs[0]);
    });
    const review = passReviewFor(fixture, `tampered-process-${label}`);
    assert.equal(review.status, 2, `${label} must agree with processStatus`);
    assert.match(review.stderr, /process outcome metadata/u);
  }

  const markerDigestTamper = cloneCollection(unreviewedManifestPath, 'tampered-marker-digest', (candidate) => {
    candidate.workspace.markerSha256 = '0'.repeat(64);
  });
  const markerDigestReview = passReviewFor(markerDigestTamper, 'tampered-marker-digest');
  assert.equal(markerDigestReview.status, 2);
  assert.match(markerDigestReview.stderr, /workspace ownership marker digest/u);

  const markerNonceTamper = cloneCollection(unreviewedManifestPath, 'tampered-marker-nonce', (candidate) => {
    candidate.workspace.markerNonce = 'f'.repeat(64);
  });
  const markerNonceReview = passReviewFor(markerNonceTamper, 'tampered-marker-nonce');
  assert.equal(markerNonceReview.status, 2);
  assert.match(markerNonceReview.stderr, /workspace ownership marker content/u);

  const markerPath = path.join(unreviewedManifest.workspace.root, unreviewedManifest.workspace.markerRef);
  const markerBackup = `${markerPath}.test-backup`;
  fs.renameSync(markerPath, markerBackup);
  try {
    const missingMarker = cloneCollection(unreviewedManifestPath, 'missing-marker');
    const missingMarkerReview = passReviewFor(missingMarker, 'missing-marker');
    assert.equal(missingMarkerReview.status, 2);
    assert.match(missingMarkerReview.stderr, /workspace ownership marker/u);
  } finally {
    fs.renameSync(markerBackup, markerPath);
  }

  fs.renameSync(markerPath, markerBackup);
  fs.symlinkSync(markerBackup, markerPath);
  try {
    const symlinkMarker = cloneCollection(unreviewedManifestPath, 'symlink-marker');
    const symlinkMarkerReview = passReviewFor(symlinkMarker, 'symlink-marker');
    assert.equal(symlinkMarkerReview.status, 2);
    assert.match(symlinkMarkerReview.stderr, /workspace ownership marker.*non-symlink/u);
  } finally {
    fs.rmSync(markerPath);
    fs.renameSync(markerBackup, markerPath);
  }

  const firstRunWorkspace = unreviewedManifest.runs[0].cwd;
  const firstRunBackup = `${firstRunWorkspace}.test-backup`;
  fs.renameSync(firstRunWorkspace, firstRunBackup);
  fs.symlinkSync(firstRunBackup, firstRunWorkspace, process.platform === 'win32' ? 'junction' : 'dir');
  try {
    const symlinkRun = cloneCollection(unreviewedManifestPath, 'symlink-run-workspace');
    const symlinkRunReview = passReviewFor(symlinkRun, 'symlink-run-workspace');
    assert.equal(symlinkRunReview.status, 2);
    assert.match(symlinkRunReview.stderr, /run workspace.*non-symlink/u);
  } finally {
    fs.rmSync(firstRunWorkspace);
    fs.renameSync(firstRunBackup, firstRunWorkspace);
  }

  for (const [label, root] of [
    ['inside-checkout', path.join(checkoutRoot, '.coordinated-eval-workspace')],
    ['forged-owned-prefix', path.join(fs.realpathSync(os.tmpdir()), 'eh-clarify-skill-eval-Ab12Cd')],
    ['wrong-prefix', path.join(fs.realpathSync(os.tmpdir()), 'not-owned-eval-workspace')],
    ['non-canonical', `${fs.realpathSync(os.tmpdir())}${path.sep}child${path.sep}..${path.sep}eh-clarify-skill-eval-tampered`],
  ]) {
    const fixture = cloneCollection(unreviewedManifestPath, `tampered-workspace-${label}`, (candidate) => {
      candidate.workspace.root = root;
      for (const entry of candidate.runs) entry.cwd = path.join(root, entry.runId);
    });
    const review = passReviewFor(fixture, `tampered-workspace-${label}`);
    assert.equal(review.status, 2, `${label} coordinated workspace tamper must be rejected`);
    assert.match(review.stderr, /workspace root/u);
  }

  for (const [field, value] of [
    ['createdAt', '2026-02-30T00:00:00.000Z'],
    ['createdAt', '2026-08-26'],
    ['createdAt', '2026-08-26t00:00:00.000z'],
    ['createdAt', '2026-08-26T00:00:60Z'],
  ]) {
    const label = value.includes('T') ? 'calendar-invalid-created-at' : 'date-only-created-at';
    const fixture = cloneCollection(unreviewedManifestPath, label, (candidate) => { candidate[field] = value; });
    const review = passReviewFor(fixture, label);
    assert.equal(review.status, 2, `${value} must not satisfy strict RFC3339`);
    assert.match(review.stderr, /RFC3339/u);
  }
  const invalidRunDate = cloneCollection(unreviewedManifestPath, 'calendar-invalid-run-date', (candidate) => {
    candidate.runs[0].startedAt = '2026-02-30T00:00:00.000Z';
  });
  const invalidRunDateReview = passReviewFor(invalidRunDate, 'calendar-invalid-run-date');
  assert.equal(invalidRunDateReview.status, 2);
  assert.match(invalidRunDateReview.stderr, /RFC3339/u);

  const invalidReviewDate = cloneCollection(unreviewedManifestPath, 'calendar-invalid-review-date');
  const invalidReviewDateInput = path.join(sandbox, 'calendar-invalid-review-date.json');
  writeReviewInput(invalidReviewDateInput, invalidReviewDate.manifest, 'pass', () => 'pass', '2026-02-30T00:00:00.000Z');
  const invalidReviewDateResult = run([
    '--record-review', invalidReviewDate.manifestPath, '--review-file', invalidReviewDateInput,
  ]);
  assert.equal(invalidReviewDateResult.status, 2);
  assert.match(invalidReviewDateResult.stderr, /reviewedAt must be a strict RFC3339/u);

  const symlinkReal = cloneCollection(unreviewedManifestPath, 'symlink-real');
  const symlinkCollection = path.join(sandbox, 'symlink-collection');
  fs.symlinkSync(symlinkReal.directory, symlinkCollection, process.platform === 'win32' ? 'junction' : 'dir');
  symlinkReal.manifest.manifestPath = path.join(symlinkCollection, 'scoring-manifest.json');
  fs.writeFileSync(symlinkReal.manifestPath, `${JSON.stringify(symlinkReal.manifest, null, 2)}\n`);
  const symlinkReviewInput = path.join(sandbox, 'symlink-pass-review.json');
  writeReviewInput(symlinkReviewInput, symlinkReal.manifest);
  const symlinkReview = run([
    '--record-review', path.join(symlinkCollection, 'scoring-manifest.json'), '--review-file', symlinkReviewInput,
  ]);
  assert.equal(symlinkReview.status, 2);
  assert.match(symlinkReview.stderr, /symlink/u);

  const failedDir = path.join(sandbox, 'failed');
  const failed = run([
    '--case', 'question-must-be-pre-authorized', '--reps', '5', '--timeout-ms', '2000', '--results-dir', failedDir,
  ], 'fail');
  assert.equal(failed.status, 1);
  const failedManifest = onlyManifest(failedDir);
  assert.equal(failedManifest.workspace.cleanupStatus, 'retained-for-review');
  assert.equal(fs.existsSync(failedManifest.workspace.root), true);
  assert.ok(failedManifest.runs.every(({ processStatus, semanticVerdict }) => (
    processStatus === 'exit-nonzero' && semanticVerdict === null
  )));
  assert.ok(failedManifest.runs.every(({ exitCode, signal, timedOut }) => (
    exitCode === 7 && signal === null && timedOut === false
  )));
  assert.equal(failedManifest.collectionStatus, 'complete');
  assert.equal(failedManifest.completedRunCount, 0);
  assert.equal(failedManifest.evidenceEligible, false);
  const failedPassReview = path.join(sandbox, 'failed-pass-review.json');
  writeReviewInput(failedPassReview, failedManifest);
  assert.equal(run([
    '--record-review', failedManifest.manifestPath, '--review-file', failedPassReview,
  ]).status, 2, 'nonzero runs cannot receive pass verdicts');
  const failedReview = path.join(sandbox, 'failed-review.json');
  writeReviewInput(failedReview, failedManifest, 'fail', () => 'fail');
  assert.equal(run([
    '--record-review', failedManifest.manifestPath, '--review-file', failedReview,
  ]).status, 0, 'nonzero runs remain reviewable as fail');
  const reviewedFailedManifest = JSON.parse(fs.readFileSync(failedManifest.manifestPath, 'utf-8'));
  assert.equal(reviewedFailedManifest.workspace.cleanupStatus, 'removed-after-review');
  assert.equal(fs.existsSync(reviewedFailedManifest.workspace.root), false);

  const partialDir = path.join(sandbox, 'partial-stream');
  const partialRun = run([
    '--case', 'question-must-be-pre-authorized', '--variant', 'with-skill',
    '--reps', '5', '--timeout-ms', '2000', '--results-dir', partialDir,
  ], 'partial-exit');
  assert.equal(partialRun.status, 1, partialRun.stderr);
  const partialManifest = onlyManifest(partialDir);
  assert.equal(partialManifest.collectionStatus, 'complete');
  assert.equal(partialManifest.recordedRunCount, 5);
  assert.ok(partialManifest.runs.every((entry) => (
    entry.processStatus === 'exit-nonzero'
      && entry.exitCode === 7
      && fs.readFileSync(path.join(path.dirname(partialManifest.manifestPath), entry.stdoutRef), 'utf-8') === 'partial evidence'
      && fs.readFileSync(path.join(path.dirname(partialManifest.manifestPath), entry.traceRef), 'utf-8').endsWith('{"type":"result"')
  )), 'a non-completed run must preserve evidence before one final truncated stream fragment');

  const timedDir = path.join(sandbox, 'timed');
  const timed = run([
    '--case', 'question-must-be-pre-authorized', '--reps', '5', '--timeout-ms', '50', '--results-dir', timedDir,
  ], 'hang');
  assert.equal(timed.status, 1);
  const timedManifest = onlyManifest(timedDir);
  assert.equal(timedManifest.workspace.cleanupStatus, 'retained-for-review');
  assert.equal(fs.existsSync(timedManifest.workspace.root), true);
  assert.ok(timedManifest.runs.every(({ processStatus, semanticVerdict }) => (
    processStatus === 'timeout' && semanticVerdict === null
  )));
  assert.ok(timedManifest.runs.every(({ exitCode, signal, timedOut }) => (
    exitCode === null && typeof signal === 'string' && signal.length > 0 && timedOut === true
  )));
  assert.equal(timedManifest.collectionStatus, 'complete');
  assert.equal(timedManifest.completedRunCount, 0);
  assert.equal(timedManifest.evidenceEligible, false);
  const timedPassReview = path.join(sandbox, 'timed-pass-review.json');
  writeReviewInput(timedPassReview, timedManifest);
  assert.equal(run([
    '--record-review', timedManifest.manifestPath, '--review-file', timedPassReview,
  ]).status, 2, 'timeout runs cannot receive pass verdicts');
  assert.match(timed.stderr, /status=timeout/u);

  const timedExit143Dir = path.join(sandbox, 'timed-exit143');
  const timedExit143 = run([
    '--case', 'question-must-be-pre-authorized', '--variant', 'with-skill',
    '--reps', '5', '--timeout-ms', '50', '--results-dir', timedExit143Dir,
  ], 'hang-exit143');
  assert.equal(timedExit143.status, 1);
  const timedExit143Manifest = onlyManifest(timedExit143Dir);
  assert.ok(timedExit143Manifest.runs.every(({ processStatus, exitCode, signal, timedOut }) => (
    processStatus === 'timeout' && exitCode === 143 && signal === null && timedOut === true
  )), 'collector must preserve a timeout process that handles SIGTERM by exiting 143');
  const timedExit143PassReview = path.join(sandbox, 'timed-exit143-pass-review.json');
  writeReviewInput(timedExit143PassReview, timedExit143Manifest);
  assert.equal(run([
    '--record-review', timedExit143Manifest.manifestPath, '--review-file', timedExit143PassReview,
  ]).status, 2, 'an exit-143 timeout must never receive a pass verdict');
  const timedExit143Review = path.join(sandbox, 'timed-exit143-review.json');
  writeReviewInput(timedExit143Review, timedExit143Manifest, 'fail', () => 'fail');
  const recordedTimedExit143 = run([
    '--record-review', timedExit143Manifest.manifestPath, '--review-file', timedExit143Review,
  ]);
  assert.equal(recordedTimedExit143.status, 0,
    `collector-produced exit-143 timeout must remain reviewable as fail: ${recordedTimedExit143.stderr}`);
  assert.equal(
    JSON.parse(fs.readFileSync(timedExit143Manifest.manifestPath, 'utf-8')).workspace.cleanupStatus,
    'removed-after-review',
  );

  const shapeFailedDir = path.join(sandbox, 'shape-failed');
  assert.equal(run([
    '--case', 'fact-lanes-before-interview', '--variant', 'with-skill', '--reps', '5',
    '--timeout-ms', '2000', '--results-dir', shapeFailedDir,
  ], 'shape-bad').status, 1);
  const shapeFailedManifest = onlyManifest(shapeFailedDir);
  assert.equal(shapeFailedManifest.evidenceEligible, false);
  const shapeFailedPassReview = path.join(sandbox, 'shape-failed-pass-review.json');
  writeReviewInput(shapeFailedPassReview, shapeFailedManifest);
  assert.equal(run([
    '--record-review', shapeFailedManifest.manifestPath, '--review-file', shapeFailedPassReview,
  ]).status, 2, 'mechanical shape failures cannot receive pass verdicts');

  const partial = cloneCollection(unreviewedManifestPath, 'partial-aborted', (candidate) => {
    candidate.runs = candidate.runs.slice(0, 3);
    candidate.collectionStatus = 'aborted';
    candidate.recordedRunCount = 3;
    candidate.completedRunCount = 3;
    candidate.evidenceEligible = false;
  });
  const partialPassReview = passReviewFor(partial, 'partial-aborted');
  assert.equal(partialPassReview.status, 2, 'partial aborted collections cannot receive overall pass');

  const reuseDir = path.join(sandbox, 'reuse');
  assert.equal(run(['--case', 'question-must-be-pre-authorized', '--reps', '5', '--timeout-ms', '2000', '--results-dir', reuseDir]).status, 0);
  assert.equal(run(['--case', 'question-must-be-pre-authorized', '--reps', '5', '--timeout-ms', '2000', '--results-dir', reuseDir]).status, 0);
  const reused = manifestPaths(reuseDir);
  assert.equal(reused.length, 2, 'reusing a results root must create a new immutable collection directory');
  assert.equal(new Set(reused.map((manifestPath) => path.dirname(manifestPath))).size, 2);

  console.log(`PASS clarify-eval-runner ${mode}`);
} finally {
  for (const manifestPath of manifestPaths(sandbox)) {
    try {
      const candidate = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      const workspaceRoot = candidate.workspace?.root;
      if (typeof workspaceRoot === 'string'
          && path.dirname(workspaceRoot) === fs.realpathSync(os.tmpdir())
          && /^eh-clarify-skill-eval-[A-Za-z0-9]{6}$/u.test(path.basename(workspaceRoot))
          && fs.existsSync(workspaceRoot)) {
        fs.rmSync(workspaceRoot, { recursive: true, force: true });
      }
    } catch {
      // Best-effort cleanup for test-owned external workspaces.
    }
  }
  fs.rmSync(sandbox, { recursive: true, force: true });
}
