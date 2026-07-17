import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const setupPath = path.join(repoRoot, 'harness', 'plugin', 'runtime', 'setup-local-adapter.mjs');
const doctorPath = path.join(repoRoot, 'harness', 'plugin', 'runtime', 'doctor.mjs');
const syncPath = path.join(repoRoot, 'harness', 'plugin', 'runtime', 'sync.mjs');
const installPath = path.join(repoRoot, 'harness', 'plugin', 'runtime', 'install.mjs');
const fixturesRoot = path.join(repoRoot, 'harness', 'plugin', 'runtime', 'test', 'fixtures');
const mode = process.argv[2];

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === '.codegraph' || entry.name === 'node_modules') continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function run(command, args, cwd, env = {}) {
  return spawnSync(command, args, {
    cwd,
    encoding: 'utf-8',
    env: {
      ...process.env,
      ...env,
    },
  });
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function pass(message) {
  console.log(message);
  process.exit(0);
}

function parseJson(result) {
  try {
    return JSON.parse(result.stdout);
  } catch {
    return null;
  }
}

if (!['red', 'green', 'verify'].includes(mode)) {
  console.error('Usage: node harness/plugin/runtime/test/local-adapter-diagnostics-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-adapter-diagnostics-'));
const repoCopy = path.join(tempRoot, 'repo');
copyDir(repoRoot, repoCopy);

const stubsDir = path.join(tempRoot, 'stubs');
fs.mkdirSync(stubsDir, { recursive: true });
fs.writeFileSync(path.join(stubsDir, 'codegraph'), '#!/usr/bin/env bash\necho "stub codegraph ok"\n', { mode: 0o755 });
fs.writeFileSync(path.join(stubsDir, 'npx'), '#!/usr/bin/env bash\necho "stub ctx7 ok"\n', { mode: 0o755 });

const adapterPath = path.join(tempRoot, 'local-adapter.json');
fs.copyFileSync(path.join(fixturesRoot, 'local-adapter-missing-fields.json'), adapterPath);

const bootstrapMarker = path.join(repoCopy, 'harness', 'plugin', 'runtime', '.bootstrap-ran');
fs.writeFileSync(bootstrapMarker, 'fixture-bootstrap\n', 'utf-8');

const env = {
  HARNESS_LOCAL_ADAPTER: adapterPath,
  PATH: `${stubsDir}:${process.env.PATH}`,
};

try {
  const setupDryRun = run('node', [setupPath], repoCopy, env);
  const doctor = run('node', [doctorPath, '--json'], repoCopy, env);
  const sync = run('node', [syncPath, '--json'], repoCopy, env);
  const setupWrite = run('node', [setupPath, '--write'], repoCopy, env);
  const install = run('node', [installPath, '--write-local-adapter'], repoCopy, env);

  const doctorJson = parseJson(doctor);
  const syncJson = parseJson(sync);
  const setupDryRunText = `${setupDryRun.stdout || ''}${setupDryRun.stderr || ''}`;
  const setupWriteText = `${setupWrite.stdout || ''}${setupWrite.stderr || ''}`;
  const installText = `${install.stdout || ''}${install.stderr || ''}`;
  const mergedAdapter = JSON.parse(fs.readFileSync(adapterPath, 'utf-8'));

  const doctorHasStructuredLocalAdapter = doctorJson?.checks?.some((check) =>
    check.kind === 'local-adapter' && Array.isArray(check.problems) && check.problems.length > 0
  );
  const syncHasStructuredLocalAdapter = syncJson?.steps?.some((step) =>
    step.id === 'local-adapter' && Array.isArray(step.problems) && step.problems.length > 0
  );
  const setupMentionsManualConfirm = setupDryRunText.includes('仍需人工确认') || setupWriteText.includes('仍需人工确认');
  const setupWriteMergedExpectedFields =
    mergedAdapter.runtimeVersion === '0.1.0'
    && mergedAdapter.nodeCommand === 'node'
    && mergedAdapter.codegraphCommand === 'codegraph'
    && mergedAdapter.context7?.apiKeyEnvVar === 'CONTEXT7_API_KEY';
  const installForwardsSetupDiagnostics =
    installText.includes('Enterprise Harness Bootstrap')
    && installText.includes('Local adapter ready at:')
    && installText.includes('仍需人工确认')
    && installText.includes('Next: run node harness/plugin/runtime/doctor.mjs')
    && !installText.includes('"checks"');

  const ok =
    setupDryRun.status === 0
    && setupWrite.status === 0
    && doctor.status === 0
    && sync.status === 0
    && install.status === 0
    && doctorHasStructuredLocalAdapter
    && syncHasStructuredLocalAdapter
    && setupMentionsManualConfirm
    && setupWriteMergedExpectedFields
    && installForwardsSetupDiagnostics;

  if (mode === 'red') {
    if (!ok) {
      fail('Expected setup/doctor/sync/install diagnostics to remain non-structured before implementation');
    }
    pass('Red precondition no longer holds.');
  }

  if (!ok) {
    fail('Expected setup/doctor/sync/install diagnostics to be field-level and deterministic');
  }

  pass(mode === 'green' ? 'Green local-adapter diagnostics smoke passed.' : 'Local-adapter diagnostics verify smoke passed.');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
