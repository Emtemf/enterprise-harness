import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const mode = process.argv[2];
const verifyPath = path.join(repoRoot, 'harness', 'plugin', 'runtime', 'verify.mjs');
const upstreamCheckPath = path.join(repoRoot, 'harness', 'plugin', 'runtime', 'upstream-check.mjs');
const readmePath = path.join(repoRoot, 'README.md');
const runtimeReadmePath = path.join(repoRoot, 'harness', 'plugin', 'runtime', 'README.md');

function fail(message) {
  console.error(message);
  process.exit(1);
}

function pass(message) {
  console.log(message);
  process.exit(0);
}

function runNode(scriptPath, args, env = {}) {
  return spawnSync('node', [scriptPath, ...args], {
    cwd: repoRoot,
    encoding: 'utf-8',
    env: {
      ...process.env,
      ...env,
    },
  });
}

function read(filePath) {
  return fs.readFileSync(filePath, 'utf-8');
}

if (!['red', 'green', 'verify'].includes(mode)) {
  console.error('Usage: node harness/plugin/runtime/test/runtime-readiness-contract-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-readiness-contract-'));
const stubsDir = path.join(tempRoot, 'stubs');
const registryPath = path.join(tempRoot, 'registry.json');
fs.mkdirSync(stubsDir, { recursive: true });

const codegraphStub = path.join(stubsDir, 'codegraph');
fs.writeFileSync(codegraphStub, '#!/usr/bin/env bash\necho "0.9.9"\n', { mode: 0o755 });
const npxStub = path.join(stubsDir, 'npx');
fs.writeFileSync(npxStub, '#!/usr/bin/env bash\necho "0.5.3"\n', { mode: 0o755 });

fs.writeFileSync(
  registryPath,
  JSON.stringify(
    {
      referenceUpstreams: [
        {
          name: 'Superpowers',
          source: 'https://github.com/obra/superpowers',
          status: 'reference-only',
          observedVersions: ['6.1.1'],
        },
      ],
      runtimeUpstreams: [
        {
          name: 'CodeGraph',
          source: 'https://github.com/colbymchenry/codegraph',
          status: 'runtime',
          currentValidatedVersion: '0.9.9',
        },
        {
          name: 'Context7',
          source: 'https://github.com/upstash/context7',
          status: 'runtime',
          currentValidatedVersion: '0.5.5',
        },
      ],
    },
    null,
    2
  ) + '\n',
  'utf-8'
);

const env = {
  PATH: `${stubsDir}:${process.env.PATH}`,
  HARNESS_UPSTREAM_REGISTRY: registryPath,
};

try {
  const verifyJson = runNode(verifyPath, ['--json'], env);
  const verifyHuman = runNode(verifyPath, [], env);
  const upstreamJson = runNode(upstreamCheckPath, ['--json'], env);
  const upstreamHuman = runNode(upstreamCheckPath, [], env);

  const verifyJsonData = JSON.parse(verifyJson.stdout || '{}');
  const upstreamJsonData = JSON.parse(upstreamJson.stdout || '{}');
  const readmeText = read(readmePath);
  const runtimeReadmeText = read(runtimeReadmePath);

  const context7Check = Array.isArray(upstreamJsonData.checks)
    ? upstreamJsonData.checks.find((item) => item.name === 'Context7')
    : null;
  const referenceCheck = Array.isArray(upstreamJsonData.checks)
    ? upstreamJsonData.checks.find((item) => item.kind === 'reference-upstream')
    : null;

  const failures = [];
  if (!('contractChecks' in verifyJsonData && 'runtimeReadinessChecks' in verifyJsonData)) {
    failures.push('verify --json missing contractChecks/runtimeReadinessChecks');
  }
  if (!(verifyJsonData.runtimeReadinessChecks?.status === 'not-run')) {
    failures.push(`verify runtimeReadinessChecks.status mismatch: ${JSON.stringify(verifyJsonData.runtimeReadinessChecks)}`);
  }
  const guidance = verifyJsonData.runtimeReadinessChecks?.guidance || [];
  if (!(guidance.includes('doctor --json') || guidance.some((item) => String(item).includes('doctor --json')))) {
    failures.push(`verify guidance missing doctor --json: ${JSON.stringify(guidance)}`);
  }
  if (!(guidance.includes('sync --json') || guidance.some((item) => String(item).includes('sync --json')))) {
    failures.push(`verify guidance missing sync --json: ${JSON.stringify(guidance)}`);
  }
  if (!(guidance.includes('upstream-check --json') || guidance.some((item) => String(item).includes('upstream-check --json')))) {
    failures.push(`verify guidance missing upstream-check --json: ${JSON.stringify(guidance)}`);
  }
  if (String(verifyHuman.stdout || '').includes('OK contract and runtime checks passed.')) {
    failures.push('verify human output still overstates runtime checks');
  }
  if (!String(verifyHuman.stdout || '').includes('OK contract checks passed.')) {
    failures.push(`verify human output missing contract-only success: ${JSON.stringify(String(verifyHuman.stdout || '').trim())}`);
  }
  if (!String(verifyHuman.stdout || '').includes('runtime readiness')) {
    failures.push(`verify human output missing runtime readiness guidance: ${JSON.stringify(String(verifyHuman.stdout || '').trim())}`);
  }
  if (!(upstreamJson.status === 1)) {
    failures.push(`upstream-check --json exit mismatch: ${upstreamJson.status}`);
  }
  if (!(upstreamJsonData.ok === false)) {
    failures.push(`upstream-check --json ok mismatch: ${JSON.stringify(upstreamJsonData)}`);
  }
  if (!(context7Check && context7Check.status === 'validated-version-mismatch' && context7Check.ok === false)) {
    failures.push(`Context7 mismatch check invalid: ${JSON.stringify(context7Check)}`);
  }
  if (!(referenceCheck && referenceCheck.expectedVersion === 'manual-review' && referenceCheck.ok === true)) {
    failures.push(`reference upstream semantics invalid: ${JSON.stringify(referenceCheck)}`);
  }
  if (!String(upstreamHuman.stdout || '').includes('status=validated-version-mismatch')) {
    failures.push(`upstream human output missing mismatch status: ${JSON.stringify(String(upstreamHuman.stdout || '').trim())}`);
  }
  if (!String(upstreamHuman.stdout || '').includes('current=0.5.3 expected=0.5.5')) {
    failures.push(`upstream human output missing current/expected detail: ${JSON.stringify(String(upstreamHuman.stdout || '').trim())}`);
  }
  if (!readmeText.includes('verify` 只声明 contract checks；runtime readiness 需另行运行 doctor / sync / upstream-check。')) {
    failures.push('README.md missing exact verify/readiness string');
  }
  if (!runtimeReadmeText.includes('runtime readiness 不由 verify 单独背书。')) {
    failures.push('runtime README missing exact readiness string');
  }

  const ok = failures.length === 0;

  if (mode === 'red') {
    if (!ok) {
      fail(`Expected current readiness contract to fail before implementation:\n${failures.join('\n')}`);
    }
    pass('Red precondition no longer holds.');
  }

  if (!ok) {
    fail(`Expected readiness contract smoke to pass:\n${failures.join('\n')}`);
  }

  pass(mode === 'green' ? 'Green runtime readiness contract smoke passed.' : 'Runtime readiness contract verify smoke passed.');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
