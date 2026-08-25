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
if (process.argv.slice(2).includes('--version')) process.stdout.write('2.1.245 (Claude Code)\\n');
else if (mode === 'hang') setInterval(() => {}, 1000);
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
    process.stdout.write(mode === 'shape-bad' ? fence + '\\n' + shaped + '\\n' + fence : shaped);
  }
  else process.stdout.write(JSON.stringify({ argv: process.argv.slice(2), mode, cwd: process.cwd(), config }));
  if (mode === 'fail') { process.stderr.write('fixture failure\\n'); process.exitCode = 7; }
}
`);
fs.chmodSync(fakeClaude, 0o755);

function run(args, fakeMode = 'success') {
  return spawnSync(process.execPath, [runner, ...args], {
    cwd: repoRoot,
    encoding: 'utf-8',
    shell: false,
    env: {
      ...process.env,
      PATH: `${binDir}${path.delimiter}${process.env.PATH || ''}`,
      EH_FAKE_CLAUDE_MODE: fakeMode,
      CLAUDE_CONFIG_DIR: pollutedConfigDir,
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

function writeReviewInput(target, manifest, overallVerdict = 'pass', verdictFor = () => 'pass') {
  fs.writeFileSync(target, `${JSON.stringify({
    reviewer: 'root-controller',
    reviewedAt: '2026-08-26T00:00:00.000Z',
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
    argv.includes('--no-session-persistence') && shell === false && timeoutMs > 0
  )));
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
  assert.equal(manifest.evalSuiteVersion, '0.5.9');
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
  assert.equal(manifest.workspace.cleanupStatus, 'removed');
  assert.equal(fs.existsSync(manifest.workspace.root), false, 'collector must remove its external temporary workspace');
  assert.equal(new Set(manifest.runs.map(({ cwdRef }) => cwdRef)).size, 10, 'every repetition must use a fresh workspace/process');
  assert.ok(manifest.runs.every((entry) => (
    entry.processStatus === 'completed'
      && entry.semanticVerdict === null
      && entry.assertions.length > 0
      && entry.forbidden.length > 0
      && /^[a-f0-9]{64}$/u.test(entry.stdoutSha256)
      && /^[a-f0-9]{64}$/u.test(entry.stderrSha256)
      && fs.existsSync(path.join(path.dirname(manifest.manifestPath), entry.stdoutRef))
      && fs.existsSync(path.join(path.dirname(manifest.manifestPath), entry.stderrRef))
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
  writeReviewInput(reviewInput, shapeManifest);
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
  const canonicalReview = JSON.parse(fs.readFileSync(canonicalReviewPath, 'utf-8'));
  assert.equal(canonicalReview.manifestSha256, crypto.createHash('sha256').update(preReviewBytes).digest('hex'),
    'manual review must bind the pre-review manifest containing output digests');
  assert.equal(run(['--record-review', shapeManifest.manifestPath, '--review-file', reviewInput]).status, 2,
    'manual review recording must refuse overwrite');

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
  assert.equal(failedManifest.workspace.cleanupStatus, 'removed');
  assert.equal(fs.existsSync(failedManifest.workspace.root), false);
  assert.ok(failedManifest.runs.every(({ processStatus, semanticVerdict }) => (
    processStatus === 'exit-nonzero' && semanticVerdict === null
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

  const timedDir = path.join(sandbox, 'timed');
  const timed = run([
    '--case', 'question-must-be-pre-authorized', '--reps', '5', '--timeout-ms', '50', '--results-dir', timedDir,
  ], 'hang');
  assert.equal(timed.status, 1);
  const timedManifest = onlyManifest(timedDir);
  assert.equal(timedManifest.workspace.cleanupStatus, 'removed');
  assert.equal(fs.existsSync(timedManifest.workspace.root), false);
  assert.ok(timedManifest.runs.every(({ processStatus, semanticVerdict }) => (
    processStatus === 'timeout' && semanticVerdict === null
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
  fs.rmSync(sandbox, { recursive: true, force: true });
}
