import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const mode = process.argv[2];
const scripts = {
  install: path.join(repoRoot, 'runtime', 'install.mjs'),
  update: path.join(repoRoot, 'runtime', 'update.mjs'),
  upgrade: path.join(repoRoot, 'runtime', 'upgrade.mjs'),
  migrate: path.join(repoRoot, 'runtime', 'migrate.mjs'),
  releaseLocal: path.join(repoRoot, 'runtime', 'release-local.mjs'),
  cli: path.join(repoRoot, 'runtime', 'cli.mjs'),
};
const bootstrapMarker = path.join(repoRoot, 'runtime', '.bootstrap-ran');

function fail(message) {
  console.error(message);
  process.exit(1);
}

function pass(message) {
  console.log(message);
  process.exit(0);
}

function runNode(scriptPath, args, env = {}, cwd = repoRoot) {
  return spawnSync('node', [scriptPath, ...args], {
    cwd,
    encoding: 'utf-8',
    env: {
      ...process.env,
      ...env,
    },
  });
}

function fileState(filePath) {
  if (!fs.existsSync(filePath)) {
    return { exists: false, sha256: null, mtimeMs: null };
  }
  const content = fs.readFileSync(filePath);
  const stat = fs.statSync(filePath);
  return {
    exists: true,
    sha256: crypto.createHash('sha256').update(content).digest('hex'),
    mtimeMs: stat.mtimeMs,
  };
}

function tempReleaseDirCount() {
  return fs.readdirSync(os.tmpdir()).filter((name) => name.startsWith('enterprise-harness-release-local-')).length;
}

function firstLine(text) {
  return String(text || '').split('\n').find((line) => line.length > 0) || '';
}

function sameState(left, right) {
  return left.exists === right.exists && left.sha256 === right.sha256 && left.mtimeMs === right.mtimeMs;
}

if (!['red', 'green', 'verify'].includes(mode)) {
  console.error('Usage: node runtime/test/runtime-help-contract-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-help-contract-'));
const existingFixtureDir = path.join(tempRoot, 'help-fixture-existing');
const missingFixtureDir = path.join(tempRoot, 'help-fixture-missing');
const clarifyFixtureDir = path.join(tempRoot, 'help-fixture-clarify');
fs.mkdirSync(existingFixtureDir, { recursive: true });
fs.mkdirSync(missingFixtureDir, { recursive: true });
fs.mkdirSync(clarifyFixtureDir, { recursive: true });
const gitInit = spawnSync('git', ['init', '--quiet'], {
  cwd: clarifyFixtureDir,
  encoding: 'utf-8',
  shell: false,
});
assert.equal(gitInit.status, 0, gitInit.stderr);
const existingAdapterPath = path.join(existingFixtureDir, 'local-adapter.json');
const missingAdapterPath = path.join(missingFixtureDir, 'local-adapter.json');
fs.writeFileSync(existingAdapterPath, JSON.stringify({ fixture: true }, null, 2) + '\n', 'utf-8');

const markerBefore = fileState(bootstrapMarker);
const releaseTempCountBefore = tempReleaseDirCount();
const existingAdapterBefore = fileState(existingAdapterPath);
const missingAdapterBefore = fileState(missingAdapterPath);
const clarifyStatePath = path.join(clarifyFixtureDir, '.git', 'enterprise-harness');
const clarifyStateBefore = fileState(clarifyStatePath);

try {
  const checks = [
    {
      name: 'install --help',
      result: runNode(scripts.install, ['--help']),
      assert() {
        return this.result.status === 0
          && firstLine(this.result.stdout).includes('Enterprise Harness Install')
          && sameState(markerBefore, fileState(bootstrapMarker));
      },
    },
    {
      name: 'install -h',
      result: runNode(scripts.install, ['-h']),
      assert() {
        return this.result.status === 0
          && firstLine(this.result.stdout).includes('Enterprise Harness Install')
          && sameState(markerBefore, fileState(bootstrapMarker));
      },
    },
    {
      name: 'update --help existing fixture',
      result: runNode(scripts.update, ['--help'], { HARNESS_LOCAL_ADAPTER: existingAdapterPath }),
      assert() {
        return this.result.status === 0
          && firstLine(this.result.stdout).includes('Enterprise Harness Update')
          && sameState(existingAdapterBefore, fileState(existingAdapterPath));
      },
    },
    {
      name: 'update -h existing fixture',
      result: runNode(scripts.update, ['-h'], { HARNESS_LOCAL_ADAPTER: existingAdapterPath }),
      assert() {
        return this.result.status === 0
          && firstLine(this.result.stdout).includes('Enterprise Harness Update')
          && sameState(existingAdapterBefore, fileState(existingAdapterPath));
      },
    },
    {
      name: 'update --help missing fixture',
      result: runNode(scripts.update, ['--help'], { HARNESS_LOCAL_ADAPTER: missingAdapterPath }),
      assert() {
        return this.result.status === 0
          && firstLine(this.result.stdout).includes('Enterprise Harness Update')
          && sameState(missingAdapterBefore, fileState(missingAdapterPath));
      },
    },
    {
      name: 'update -h missing fixture',
      result: runNode(scripts.update, ['-h'], { HARNESS_LOCAL_ADAPTER: missingAdapterPath }),
      assert() {
        return this.result.status === 0
          && firstLine(this.result.stdout).includes('Enterprise Harness Update')
          && sameState(missingAdapterBefore, fileState(missingAdapterPath));
      },
    },
    {
      name: 'upgrade --help',
      result: runNode(scripts.upgrade, ['--help']),
      assert() {
        return this.result.status === 0
          && firstLine(this.result.stdout).includes('Enterprise Harness Upgrade');
      },
    },
    {
      name: 'upgrade -h',
      result: runNode(scripts.upgrade, ['-h']),
      assert() {
        return this.result.status === 0
          && firstLine(this.result.stdout).includes('Enterprise Harness Upgrade');
      },
    },
    {
      name: 'migrate --help existing fixture',
      result: runNode(scripts.migrate, ['--help'], { HARNESS_LOCAL_ADAPTER: existingAdapterPath }),
      assert() {
        return this.result.status === 0
          && firstLine(this.result.stdout).includes('Enterprise Harness Migrate')
          && sameState(existingAdapterBefore, fileState(existingAdapterPath));
      },
    },
    {
      name: 'migrate -h existing fixture',
      result: runNode(scripts.migrate, ['-h'], { HARNESS_LOCAL_ADAPTER: existingAdapterPath }),
      assert() {
        return this.result.status === 0
          && firstLine(this.result.stdout).includes('Enterprise Harness Migrate')
          && sameState(existingAdapterBefore, fileState(existingAdapterPath));
      },
    },
    {
      name: 'migrate --help missing fixture',
      result: runNode(scripts.migrate, ['--help'], { HARNESS_LOCAL_ADAPTER: missingAdapterPath }),
      assert() {
        return this.result.status === 0
          && firstLine(this.result.stdout).includes('Enterprise Harness Migrate')
          && sameState(missingAdapterBefore, fileState(missingAdapterPath));
      },
    },
    {
      name: 'migrate -h missing fixture',
      result: runNode(scripts.migrate, ['-h'], { HARNESS_LOCAL_ADAPTER: missingAdapterPath }),
      assert() {
        return this.result.status === 0
          && firstLine(this.result.stdout).includes('Enterprise Harness Migrate')
          && sameState(missingAdapterBefore, fileState(missingAdapterPath));
      },
    },
    {
      name: 'release-local --help',
      result: runNode(scripts.releaseLocal, ['--help']),
      assert() {
        return this.result.status === 0
          && firstLine(this.result.stdout).includes('Enterprise Harness Local Release Smoke')
          && tempReleaseDirCount() === releaseTempCountBefore;
      },
    },
    {
      name: 'release-local -h',
      result: runNode(scripts.releaseLocal, ['-h']),
      assert() {
        return this.result.status === 0
          && firstLine(this.result.stdout).includes('Enterprise Harness Local Release Smoke')
          && tempReleaseDirCount() === releaseTempCountBefore;
      },
    },
    {
      name: 'cli --help',
      result: runNode(scripts.cli, ['--help']),
      assert() {
        return this.result.status === 0
          && firstLine(this.result.stdout).includes('Enterprise Harness Runtime CLI');
      },
    },
    {
      name: 'cli -h',
      result: runNode(scripts.cli, ['-h']),
      assert() {
        return this.result.status === 0
          && firstLine(this.result.stdout).includes('Enterprise Harness Runtime CLI');
      },
    },
    {
      name: 'cli no args',
      result: runNode(scripts.cli, []),
      assert() {
        return this.result.status === 0
          && firstLine(this.result.stdout).includes('Enterprise Harness Runtime CLI');
      },
    },
    {
      name: 'cli unknown command',
      result: runNode(scripts.cli, ['no-such-command']),
      assert() {
        return this.result.status === 1
          && String(this.result.stderr || '').includes('Unknown command: no-such-command');
      },
    },
    {
      name: 'clarify --help',
      result: runNode(scripts.cli, ['clarify', '--help'], {}, clarifyFixtureDir),
      assert() {
        return this.result.status === 0
          && firstLine(this.result.stdout).includes('Enterprise Harness Clarify')
          && this.result.stdout.includes('clarify record-decision <change-id> <event-ref>')
          && this.result.stdout.includes('clarify seal-decisions <change-id> <event-id> [event-id...]')
          && this.result.stdout.includes('clarify classify <change-id> <input-ref>')
          && sameState(clarifyStateBefore, fileState(clarifyStatePath));
      },
    },
    {
      name: 'clarify -h',
      result: runNode(scripts.cli, ['clarify', '-h'], {}, clarifyFixtureDir),
      assert() {
        return this.result.status === 0
          && firstLine(this.result.stdout).includes('Enterprise Harness Clarify')
          && this.result.stdout.includes('clarify record-decision <change-id> <event-ref>')
          && this.result.stdout.includes('clarify seal-decisions <change-id> <event-id> [event-id...]')
          && this.result.stdout.includes('clarify classify <change-id> <input-ref>')
          && sameState(clarifyStateBefore, fileState(clarifyStatePath));
      },
    },
  ];

  const failures = checks.filter((check) => !check.assert()).map((check) => {
    const stdout = String(check.result.stdout || '').trim();
    const stderr = String(check.result.stderr || '').trim();
    return `${check.name} failed (exit=${check.result.status}) stdout=${JSON.stringify(stdout)} stderr=${JSON.stringify(stderr)}`;
  });

  const ok = failures.length === 0;

  if (mode === 'red') {
    if (!ok) {
      fail(`Expected current help contract to fail before implementation:\n${failures.join('\n')}`);
    }
    pass('Red precondition no longer holds.');
  }

  if (!ok) {
    fail(`Expected help contract smoke to pass:\n${failures.join('\n')}`);
  }

  pass(mode === 'green' ? 'Green runtime help contract smoke passed.' : 'Runtime help contract verify smoke passed.');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
