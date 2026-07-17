import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const cliPath = path.join(repoRoot, 'harness', 'plugin', 'runtime', 'cli.mjs');
const packagePath = path.join(repoRoot, 'package.json');
const manifestPath = path.join(repoRoot, 'harness', 'plugin', 'manifest.json');
const mode = process.argv[2];
const jsonKeys = ['summaryVersion', 'currentPhase', 'progressSnapshot', 'activeChange', 'nextStage', 'recommendedEntry', 'recommendedLane', 'truthSources', 'nextRead', 'nextCommands', 'maintainerCommands'];
const headings = ['普通用户下一步：直接从 /harness 开始', '当前阶段', '静态快照', '动态真相', '当前 workflow stage', '当前缺口', '推荐恢复入口', '普通用户先看这些', '普通用户下一步命令', '维护命令（如需排障）'];

function runCliStatus() {
  return spawnSync('node', [cliPath, 'status'], {
    cwd: repoRoot,
    encoding: 'utf-8',
  });
}

function runCliStatusJson() {
  return spawnSync('node', [cliPath, 'status', '--json'], {
    cwd: repoRoot,
    encoding: 'utf-8',
  });
}

function runPackageStatus() {
  return spawnSync('npm', ['run', 'status'], {
    cwd: repoRoot,
    encoding: 'utf-8',
  });
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

function statusWiring() {
  const packageJson = readJson(packagePath);
  const manifestJson = readJson(manifestPath);
  return {
    packageCommand: packageJson.scripts?.status ?? null,
    manifestCommand: manifestJson.commands?.status ?? null,
  };
}

function runManifestStatus(command) {
  if (!command) {
    return { status: 1, stdout: '', stderr: 'missing manifest command' };
  }
  return spawnSync(command, {
    cwd: repoRoot,
    encoding: 'utf-8',
    shell: true,
  });
}

function statusCommandMissing(result) {
  return result.status !== 0 && `${result.stdout || ''}${result.stderr || ''}`.includes('Unknown command: status');
}

function parseStatusJson(result) {
  if (result.status !== 0) {
    return { ok: false, reason: `status --json exit=${result.status}` };
  }
  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    return { ok: false, reason: 'status --json invalid-json' };
  }
  for (const key of jsonKeys) {
    if (!(key in parsed)) {
      return { ok: false, reason: `status --json missing ${key}` };
    }
  }
  return { ok: true, parsed };
}

function hasHeadings(result) {
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  return headings.every((heading) => output.includes(heading));
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function pass(message) {
  console.log(message);
  process.exit(0);
}

if (!['red', 'green', 'verify'].includes(mode)) {
  console.error('Usage: node harness/plugin/runtime/test/session-status-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const statusResult = runCliStatus();
const statusJsonResult = runCliStatusJson();
const packageResult = runPackageStatus();
const wiring = statusWiring();
const manifestResult = runManifestStatus(wiring.manifestCommand);
const jsonContract = parseStatusJson(statusJsonResult);

if (mode === 'red') {
  if (
    statusCommandMissing(statusResult) ||
    !jsonContract.ok ||
    !wiring.packageCommand ||
    !wiring.manifestCommand ||
    packageResult.status !== 0 ||
    manifestResult.status !== 0
  ) {
    fail('Expected status command, status --json contract, or package/manifest wiring to be missing before implementation');
  }
  pass('Red precondition no longer holds.');
}

if (mode === 'green' || mode === 'verify') {
  if (statusResult.status !== 0) {
    fail(`Expected status command to succeed, got exit=${statusResult.status}`);
  }
  if (!hasHeadings(statusResult)) {
    fail('Expected human-readable status output to include all fixed headings');
  }
  if (!jsonContract.ok) {
    fail(`Expected status --json contract to pass, got ${jsonContract.reason}`);
  }
  if (!wiring.packageCommand || packageResult.status !== 0) {
    fail('Expected package.json status script to be wired and runnable');
  }
  if (!wiring.manifestCommand || manifestResult.status !== 0) {
    fail('Expected manifest.json status command to be wired and runnable');
  }
  pass(mode === 'green' ? 'Green status smoke passed.' : 'Status verify smoke passed.');
}
