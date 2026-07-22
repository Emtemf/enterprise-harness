import process from 'node:process';
import { spawnSync } from 'node:child_process';

// 这个 smoke 验证 Claude Code 插件安装/更新流程是否真的能工作。
// 它不是三态 smoke（red/green/verify），因为依赖外部 claude CLI 和网络。
// 用法：node harness/plugin/runtime/test/plugin-install-flow-smoke.mjs
//
// 前置条件：
// - claude CLI 可用
// - 网络可访问 github.com
// - 当前仓库已推送到 origin/main

const MARKETPLACE_URL = 'https://github.com/Emtemf/enterprise-harness';
const PLUGIN_REF = 'enterprise-harness@enterprise-harness';
const SCOPE = 'local';
const EXPECTED_VERSION = process.env.EXPECTED_PLUGIN_VERSION || null;

function run(cmd, args, timeoutMs = 120000) {
  return spawnSync(cmd, args, { encoding: 'utf-8', timeout: timeoutMs });
}

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function pass(message) {
  console.log(`PASS: ${message}`);
  process.exit(0);
}

console.log('Plugin Install Flow Smoke');
console.log(`Marketplace: ${MARKETPLACE_URL}`);
console.log(`Plugin: ${PLUGIN_REF} (scope: ${SCOPE})`);
if (EXPECTED_VERSION) console.log(`Expected version: ${EXPECTED_VERSION}`);
console.log('');

// 1. 确认 claude CLI 可用
const claudeCheck = run('claude', ['--version']);
if (claudeCheck.status !== 0) {
  fail(`claude CLI not available (exit ${claudeCheck.status})`);
}
console.log(`✓ claude CLI: ${(claudeCheck.stdout || '').trim()}`);

// 2. 添加 marketplace（如果已存在会报错，先尝试 remove）
run('claude', ['plugin', 'marketplace', 'remove', 'enterprise-harness']);
const addResult = run('claude', ['plugin', 'marketplace', 'add', MARKETPLACE_URL]);
if (addResult.status !== 0) {
  fail(`marketplace add failed:\n${(addResult.stderr || addResult.stdout || '').trim()}`);
}
console.log('✓ marketplace add succeeded');

// 3. 安装插件
const installResult = run('claude', ['plugin', 'install', PLUGIN_REF, '--scope', SCOPE]);
if (installResult.status !== 0) {
  fail(`plugin install failed:\n${(installResult.stderr || installResult.stdout || '').trim()}`);
}
console.log('✓ plugin install succeeded');

// 4. 列出已安装插件，确认存在
const listResult = run('claude', ['plugin', 'list']);
const listOutput = listResult.stdout || '';
if (!listOutput.includes('enterprise-harness')) {
  fail(`plugin not found in list output`);
}
console.log('✓ plugin appears in installed list');

// 5. 更新 marketplace
const updateMarketResult = run('claude', ['plugin', 'marketplace', 'update', 'enterprise-harness']);
if (updateMarketResult.status !== 0) {
  fail(`marketplace update failed:\n${(updateMarketResult.stderr || updateMarketResult.stdout || '').trim()}`);
}
console.log('✓ marketplace update succeeded');

// 6. 更新插件
const updateResult = run('claude', ['plugin', 'update', PLUGIN_REF, '--scope', SCOPE]);
if (updateResult.status !== 0) {
  fail(`plugin update failed:\n${(updateResult.stderr || updateResult.stdout || '').trim()}`);
}
console.log('✓ plugin update succeeded');

// 7. 确认版本（如果指定了 EXPECTED_PLUGIN_VERSION）
const finalList = run('claude', ['plugin', 'list']);
const finalOutput = finalList.stdout || '';
const versionMatch = finalOutput.match(/enterprise-harness@enterprise-harness\s*\n\s*Version:\s*(\S+)/);
const actualVersion = versionMatch ? versionMatch[1] : null;

if (actualVersion) {
  console.log(`✓ installed version: ${actualVersion}`);
  if (EXPECTED_VERSION && actualVersion !== EXPECTED_VERSION) {
    fail(`version mismatch: expected ${EXPECTED_VERSION}, got ${actualVersion}`);
  }
} else {
  console.log('⚠ could not parse installed version (non-fatal)');
}

// 8. 确认状态是 enabled
if (!finalOutput.includes('✔ enabled') && !finalOutput.includes('enabled')) {
  console.log('⚠ plugin status not clearly enabled (non-fatal)');
}

console.log('');
pass('plugin install/update flow verified end-to-end');
