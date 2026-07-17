import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const repoRoot = process.cwd();
const registryPath = process.env.HARNESS_UPSTREAM_REGISTRY || path.join(repoRoot, 'harness', 'upstream', 'registry.json');
const registry = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));

function run(command, args) {
  return spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf-8',
    shell: process.platform === 'win32',
  });
}

function outputText(result) {
  return String(result.stdout ?? result.stderr ?? result.error?.message ?? '').trim();
}

function runtimeCheck(name, command, args) {
  const result = run(command, args);
  const currentVersion = outputText(result);
  const expectedVersion = registry.runtimeUpstreams.find((x) => x.name === name)?.currentValidatedVersion ?? null;
  if (result.status !== 0) {
    return {
      name,
      kind: 'runtime-upstream',
      ok: false,
      status: 'command-failed',
      currentVersion,
      expectedVersion,
    };
  }
  if (currentVersion !== expectedVersion) {
    return {
      name,
      kind: 'runtime-upstream',
      ok: false,
      status: 'validated-version-mismatch',
      currentVersion,
      expectedVersion,
    };
  }
  return {
    name,
    kind: 'runtime-upstream',
    ok: true,
    status: 'validated-version-match',
    currentVersion,
    expectedVersion,
  };
}

const checks = [];
checks.push(runtimeCheck('CodeGraph', 'codegraph', ['--version']));
checks.push(runtimeCheck('Context7', 'npx', ['-y', 'ctx7', '--version']));

for (const item of registry.referenceUpstreams) {
  checks.push({
    name: item.name,
    kind: 'reference-upstream',
    ok: true,
    status: 'manual-review',
    currentVersion: item.observedVersions?.[0] ?? null,
    expectedVersion: 'manual-review',
  });
}

const result = {
  repoRoot,
  ok: checks.every((c) => c.ok),
  checks,
  guidance: [
    '参考型上游只做人工比对，不自动同步。',
    '运行型上游升级后请重新运行 doctor / sync / 最小 smoke tests。',
  ],
};

if (process.argv.includes('--json')) {
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exit(result.ok ? 0 : 1);
}

console.log('Enterprise Harness Upstream Check');
for (const item of checks) {
  const prefix = item.ok ? 'OK' : 'FAIL';
  console.log(`${prefix} ${item.kind}: ${item.name}`);
  console.log(`  status=${item.status}`);
  console.log(`  current=${item.currentVersion ?? 'unknown'} expected=${item.expectedVersion ?? 'unknown'}`);
}
for (const line of result.guidance) {
  console.log(`- ${line}`);
}
process.exit(result.ok ? 0 : 1);
