import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { readLocalAdapter, resolveLocalAdapterPath } from './lib/local-adapter.mjs';

const repoRoot = process.cwd();

const requiredProjectFiles = [
  'AGENTS.md',
  'CLAUDE.md',
  'PROGRESS.md',
  '.claude/settings.json',
  'harness/config.yaml',
  'harness/specs/plugin-runtime.md',
  'harness/specs/session-lifecycle.md',
  'harness/specs/staged-workflow.md',
  'harness/templates/requirements.md',
];

const optionalProjectFiles = [
  '.mcp.json',
  'harness/ACTIVE_CHANGE',
];

const checks = [];

function exists(relPath) {
  return fs.existsSync(path.join(repoRoot, relPath));
}

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

for (const relPath of requiredProjectFiles) {
  checks.push({
    kind: 'required-file',
    path: relPath,
    ok: exists(relPath),
  });
}

for (const relPath of optionalProjectFiles) {
  checks.push({
    kind: 'optional-file',
    path: relPath,
    ok: exists(relPath),
    severity: 'warn',
  });
}

const nodeVersion = process.version;
checks.push({
  kind: 'runtime',
  name: 'node',
  ok: true,
  detail: nodeVersion,
});

const codegraph = run('codegraph', ['status']);
checks.push({
  kind: 'tool',
  name: 'codegraph',
  ok: codegraph.status === 0,
  detail: outputText(codegraph),
});

const ctx7 = run('npx', ['-y', 'ctx7', 'docs', '/react/react', 'useEffect examples']);
checks.push({
  kind: 'tool',
  name: 'context7-cli-runtime',
  ok: ctx7.status === 0,
  severity: ctx7.status === 0 ? 'info' : 'warn',
  detail: outputText(ctx7).split('\n').slice(0, 3).join('\n'),
});

const localAdapter = readLocalAdapter();
checks.push({
  kind: 'local-adapter',
  name: 'local-adapter',
  ok: localAdapter.exists && localAdapter.errors.length === 0,
  severity: localAdapter.exists ? (localAdapter.errors.length === 0 ? 'info' : 'warn') : 'warn',
  detail: localAdapter.exists
    ? `${localAdapter.path}${localAdapter.errors.length ? ` | ${localAdapter.errors.join('; ')}` : ''}`
    : `未找到本机 adapter，建议位置：${resolveLocalAdapterPath()}`,
});

const activeChangePath = path.join(repoRoot, 'harness', 'ACTIVE_CHANGE');
if (fs.existsSync(activeChangePath)) {
  const activeChange = fs.readFileSync(activeChangePath, 'utf-8').trim();
  checks.push({
    kind: 'state',
    name: 'active-change',
    ok: activeChange.length > 0,
    detail: activeChange,
  });
}

const hardFailed = checks.filter((item) => !item.ok && (item.severity ?? 'error') === 'error');
const warnings = checks.filter((item) => !item.ok && (item.severity ?? 'error') === 'warn');
const result = {
  repoRoot,
  ok: hardFailed.length === 0,
  failedCount: hardFailed.length,
  warningCount: warnings.length,
  checks,
};

if (process.argv.includes('--json')) {
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exit(result.ok ? 0 : 1);
}

console.log('Enterprise Harness Doctor');
console.log(`Repo: ${repoRoot}`);
for (const item of checks) {
  const severity = item.severity ?? 'error';
  const prefix = item.ok ? 'OK' : severity === 'warn' ? 'WARN' : 'FAIL';
  const label = item.path || item.name;
  console.log(`${prefix} ${item.kind}: ${label}`);
  if (item.detail) {
    console.log(`  ${item.detail}`);
  }
}

process.exit(result.ok ? 0 : 1);
