import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const mode = process.argv[2] || 'verify';
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);
const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const runner = path.join(repoRoot, 'test', 'skill-evals', 'harness', 'run.mjs');
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-clarify-eval-runner-'));
const binDir = path.join(sandbox, 'bin');
const resultsDir = path.join(sandbox, 'results');
fs.mkdirSync(binDir);
const fakeClaude = path.join(binDir, process.platform === 'win32' ? 'claude.cmd' : 'claude');
fs.writeFileSync(fakeClaude, `#!/usr/bin/env node
const mode = process.env.EH_FAKE_CLAUDE_MODE || 'success';
if (mode === 'hang') setInterval(() => {}, 1000);
else {
  process.stdout.write(JSON.stringify({ argv: process.argv.slice(2), mode }));
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
    },
  });
}

function onlyManifest(directory) {
  const manifests = fs.readdirSync(directory, { recursive: true })
    .filter((entry) => String(entry).endsWith('scoring-manifest.json'));
  assert.equal(manifests.length, 1);
  return JSON.parse(fs.readFileSync(path.join(directory, manifests[0]), 'utf-8'));
}

try {
  const help = run(['--help']);
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /--reps <n>/u);
  assert.match(help.stdout, /--timeout-ms <ms>/u);
  assert.match(help.stdout, /--results-dir <path>/u);
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
  assert.ok(controls.every(({ argv }) => !argv.includes('--plugin-dir') && !argv.at(-1).includes('/enterprise-harness:harness')));
  assert.ok(guided.every(({ argv }) => argv.includes('--plugin-dir') && argv.at(-1).startsWith('/enterprise-harness:harness\n\n')));
  assert.equal(fs.existsSync(resultsDir), false, 'dry-run must not persist results');

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
  }

  const failedDir = path.join(sandbox, 'failed');
  const failed = run([
    '--case', 'question-must-be-pre-authorized', '--reps', '5', '--timeout-ms', '2000', '--results-dir', failedDir,
  ], 'fail');
  assert.equal(failed.status, 1);
  assert.ok(onlyManifest(failedDir).runs.every(({ processStatus, semanticVerdict }) => (
    processStatus === 'exit-nonzero' && semanticVerdict === null
  )));

  const timedDir = path.join(sandbox, 'timed');
  const timed = run([
    '--case', 'question-must-be-pre-authorized', '--reps', '5', '--timeout-ms', '50', '--results-dir', timedDir,
  ], 'hang');
  assert.equal(timed.status, 1);
  assert.ok(onlyManifest(timedDir).runs.every(({ processStatus, semanticVerdict }) => (
    processStatus === 'timeout' && semanticVerdict === null
  )));
  assert.match(timed.stderr, /status=timeout/u);

  console.log(`PASS clarify-eval-runner ${mode}`);
} finally {
  fs.rmSync(sandbox, { recursive: true, force: true });
}
