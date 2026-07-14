import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const repoRoot = process.cwd();
const registryPath = path.join(repoRoot, 'harness', 'upstream', 'registry.json');
const registry = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));

function run(command, args) {
  return spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf-8',
    shell: process.platform === 'win32',
  });
}

const checks = [];

const codegraph = run('codegraph', ['--version']);
checks.push({
  name: 'CodeGraph',
  kind: 'runtime-upstream',
  ok: codegraph.status === 0,
  currentVersion: String(codegraph.stdout ?? codegraph.stderr ?? codegraph.error?.message ?? '').trim(),
  expectedVersion: registry.runtimeUpstreams.find((x) => x.name === 'CodeGraph')?.currentValidatedVersion ?? null,
});

const ctx7 = run('npx', ['-y', 'ctx7', '--version']);
checks.push({
  name: 'Context7',
  kind: 'runtime-upstream',
  ok: ctx7.status === 0,
  currentVersion: String(ctx7.stdout ?? ctx7.stderr ?? ctx7.error?.message ?? '').trim(),
  expectedVersion: registry.runtimeUpstreams.find((x) => x.name === 'Context7')?.currentValidatedVersion ?? null,
});

for (const item of registry.referenceUpstreams) {
  checks.push({
    name: item.name,
    kind: 'reference-upstream',
    ok: true,
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
    '运行型上游升级后请重新运行 doctor / sync / 最小 smoke tests。'
  ]
};

if (process.argv.includes('--json')) {
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exit(result.ok ? 0 : 1);
}

console.log('Enterprise Harness Upstream Check');
for (const item of checks) {
  const prefix = item.ok ? 'OK' : 'FAIL';
  console.log(`${prefix} ${item.kind}: ${item.name}`);
  console.log(`  current=${item.currentVersion ?? 'unknown'} expected=${item.expectedVersion ?? 'unknown'}`);
}
for (const line of result.guidance) {
  console.log(`- ${line}`);
}
process.exit(result.ok ? 0 : 1);
