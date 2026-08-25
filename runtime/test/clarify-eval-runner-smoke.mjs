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
  if (mode === 'shape') process.stdout.write([
    'Fact lanes: code=pending, docs=pending',
    'Next research action/blocker: tools disabled in Plan mode',
    'Topology: not built',
    'Scores: not computed',
    'User question: none',
  ].join('\\n'));
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
  const manifests = fs.readdirSync(directory, { recursive: true })
    .filter((entry) => String(entry).endsWith('scoring-manifest.json'));
  assert.equal(manifests.length, 1);
  return JSON.parse(fs.readFileSync(path.join(directory, manifests[0]), 'utf-8'));
}

function manifestPaths(directory) {
  return fs.readdirSync(directory, { recursive: true })
    .filter((entry) => String(entry).endsWith('scoring-manifest.json'))
    .map((entry) => path.join(directory, entry));
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
  assert.equal(manifest.hostContaminationFixture, undefined, 'host configuration is evidence input, not copied into results');
  assert.equal(manifest.workspace.cleanupStatus, 'removed');
  assert.equal(fs.existsSync(manifest.workspace.root), false, 'collector must remove its external temporary workspace');
  assert.equal(new Set(manifest.runs.map(({ cwdRef }) => cwdRef)).size, 10, 'every repetition must use a fresh workspace/process');
  assert.ok(manifest.runs.every((entry) => (
    entry.processStatus === 'completed'
      && entry.semanticVerdict === null
      && entry.assertions.length > 0
      && entry.forbidden.length > 0
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
  assert.ok(shapeManifest.runs.every(({ mechanicalShape }) => (
    mechanicalShape?.id === 'terminal-fact-gate-v1'
      && mechanicalShape.pass === true
      && mechanicalShape.problems.length === 0
      && mechanicalShape.semanticPass === false
      && mechanicalShape.manualReviewRequired === true
      && mechanicalShape !== null
  )));

  const reviewInput = path.join(sandbox, 'review-input.json');
  fs.writeFileSync(reviewInput, `${JSON.stringify({
    reviewer: 'root-controller',
    reviewedAt: '2026-08-26T00:00:00.000Z',
    overallVerdict: 'pass',
    runs: shapeManifest.runs.map(({ runId }) => ({ runId, verdict: 'pass', notes: 'Manually read; exact shape and semantics satisfy the rubric.' })),
  }, null, 2)}\n`);
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
  assert.match(timed.stderr, /status=timeout/u);

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
