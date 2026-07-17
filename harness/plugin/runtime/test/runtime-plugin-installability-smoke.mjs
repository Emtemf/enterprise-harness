import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const mode = process.argv[2];

function run(command, args, env) {
  return spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf-8',
    env,
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

if (!['red', 'green', 'verify'].includes(mode)) {
  console.error('Usage: node harness/plugin/runtime/test/runtime-plugin-installability-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const isolatedHome = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-installability-home-'));
const env = {
  ...process.env,
  HOME: isolatedHome,
};

try {
  const validatePlugin = run('claude', ['plugin', 'validate', path.join(repoRoot, '.claude-plugin', 'plugin.json')], env);
  const validateMarketplace = run('claude', ['plugin', 'validate', path.join(repoRoot, '.claude-plugin', 'marketplace.json')], env);
  const marketplaceAdd = run('claude', ['plugin', 'marketplace', 'add', repoRoot], env);
  const installPlugin = run('claude', ['plugin', 'install', 'enterprise-harness@enterprise-harness', '--scope', 'local'], env);
  const marketplaceList = run('claude', ['plugin', 'marketplace', 'list'], env);
  const pluginList = run('claude', ['plugin', 'list'], env);
  const marketplaceUpdate = run('claude', ['plugin', 'marketplace', 'update', 'enterprise-harness'], env);
  const pluginUpdate = run('claude', ['plugin', 'update', 'enterprise-harness@enterprise-harness', '--scope', 'local'], env);

  const failures = [];
  if (!(validatePlugin.status === 0)) {
    failures.push(`plugin validate failed: ${JSON.stringify((validatePlugin.stdout || '') + (validatePlugin.stderr || ''))}`);
  }
  if (!(validateMarketplace.status === 0)) {
    failures.push(`marketplace validate failed: ${JSON.stringify((validateMarketplace.stdout || '') + (validateMarketplace.stderr || ''))}`);
  }
  if (!(marketplaceAdd.status === 0 && String(marketplaceAdd.stdout || '').includes('Successfully added marketplace'))) {
    failures.push(`marketplace add failed: ${JSON.stringify((marketplaceAdd.stdout || '') + (marketplaceAdd.stderr || ''))}`);
  }
  if (!(installPlugin.status === 0 && String(installPlugin.stdout || '').includes('Successfully installed plugin'))) {
    failures.push(`plugin install failed: ${JSON.stringify((installPlugin.stdout || '') + (installPlugin.stderr || ''))}`);
  }
  if (!String(marketplaceList.stdout || '').includes('enterprise-harness')) {
    failures.push(`marketplace list missing enterprise-harness: ${JSON.stringify(String(marketplaceList.stdout || '').trim())}`);
  }
  if (!String(pluginList.stdout || '').includes('enterprise-harness@enterprise-harness')) {
    failures.push(`plugin list missing enterprise-harness install: ${JSON.stringify(String(pluginList.stdout || '').trim())}`);
  }
  if (!String(pluginList.stdout || '').includes('Status: ✔ enabled')) {
    failures.push(`plugin list missing enabled status: ${JSON.stringify(String(pluginList.stdout || '').trim())}`);
  }
  if (!(marketplaceUpdate.status === 0 && String(marketplaceUpdate.stdout || '').includes('Successfully updated marketplace'))) {
    failures.push(`marketplace update failed: ${JSON.stringify((marketplaceUpdate.stdout || '') + (marketplaceUpdate.stderr || ''))}`);
  }
  if (!(pluginUpdate.status === 0 && String(pluginUpdate.stdout || '').includes('latest version'))) {
    failures.push(`plugin update did not confirm latest version: ${JSON.stringify((pluginUpdate.stdout || '') + (pluginUpdate.stderr || ''))}`);
  }

  const ok = failures.length === 0;

  if (mode === 'red') {
    if (!ok) {
      fail(`Expected current plugin installability contract to fail before implementation:\n${failures.join('\n')}`);
    }
    pass('Red precondition no longer holds.');
  }

  if (!ok) {
    fail(`Expected plugin installability contract smoke to pass:\n${failures.join('\n')}`);
  }

  pass(mode === 'green' ? 'Green plugin installability smoke passed.' : 'Plugin installability verify smoke passed.');
} finally {
  fs.rmSync(isolatedHome, { recursive: true, force: true });
}
