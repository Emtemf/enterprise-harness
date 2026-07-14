import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { readLocalAdapter, resolveLocalAdapterPath } from './lib/local-adapter.mjs';

const repoRoot = process.cwd();
const manifestPath = path.join(repoRoot, 'harness', 'plugin', 'manifest.json');
const localAdapterExamplePath = path.join(repoRoot, 'harness', 'plugin', 'runtime', 'local-adapter.example.json');
const bootstrapMarker = path.join(repoRoot, 'harness', 'plugin', 'runtime', '.bootstrap-ran');

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
const localAdapter = readLocalAdapter();
const steps = [];

steps.push({
  id: 'repo-contract',
  ok: true,
  message: `已读取 manifest：${manifest.name}@${manifest.version}`,
});

steps.push({
  id: 'bootstrap-marker',
  ok: fs.existsSync(bootstrapMarker),
  message: fs.existsSync(bootstrapMarker)
    ? '当前机器已运行过 bootstrap。'
    : '当前机器尚未运行 bootstrap，建议先执行 node harness/plugin/runtime/bootstrap.mjs',
});

steps.push({
  id: 'local-adapter-example',
  ok: fs.existsSync(localAdapterExamplePath),
  message: fs.existsSync(localAdapterExamplePath)
    ? '已提供 local runtime adapter 示例文件。'
    : '缺少 local runtime adapter 示例文件。',
});

steps.push({
  id: 'local-adapter',
  ok: localAdapter.exists,
  severity: localAdapter.exists ? 'info' : 'warn',
  message: localAdapter.exists
    ? `已检测到本机 adapter：${localAdapter.path}`
    : `未检测到本机 adapter；建议运行 node harness/plugin/runtime/setup-local-adapter.mjs --write，默认路径：${resolveLocalAdapterPath()}`,
});

steps.push({
  id: 'context7-env',
  ok: Boolean(process.env.CONTEXT7_API_KEY),
  severity: 'warn',
  message: process.env.CONTEXT7_API_KEY
    ? '检测到 CONTEXT7_API_KEY。'
    : '未检测到 CONTEXT7_API_KEY；Context7 仍可尝试 CLI 查询，但受限于当前机器网络与匿名访问能力。',
});

const result = {
  repoRoot,
  ok: steps.every((step) => step.ok || step.severity === 'warn'),
  steps,
  nextActions: [
    '运行 node harness/plugin/runtime/doctor.mjs 检查当前机器状态',
    '按需复制并调整 harness/plugin/runtime/local-adapter.example.json 到机器本地位置',
    '为本机设置必要环境变量，但不要把真实 secrets 提交进仓库',
  ],
};

if (process.argv.includes('--json')) {
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exit(result.ok ? 0 : 1);
}

console.log('Enterprise Harness Sync');
console.log(`Repo: ${repoRoot}`);
for (const step of steps) {
  const prefix = step.ok ? 'OK' : step.severity === 'warn' ? 'WARN' : 'FAIL';
  console.log(`${prefix} ${step.id}: ${step.message}`);
}
console.log('Next Actions:');
for (const action of result.nextActions) {
  console.log(`- ${action}`);
}

process.exit(result.ok ? 0 : 1);
