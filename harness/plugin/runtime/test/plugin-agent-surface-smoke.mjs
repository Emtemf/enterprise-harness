import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const mode = process.argv[2];

function fail(message) {
  console.error(message);
  process.exit(1);
}

function pass(message) {
  console.log(message);
  process.exit(0);
}

function run(command, args, env) {
  return spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf-8',
    env,
  });
}

if (!['red', 'green', 'verify'].includes(mode)) {
  console.error('Usage: node harness/plugin/runtime/test/plugin-agent-surface-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const pluginJson = JSON.parse(fs.readFileSync(path.join(repoRoot, '.claude-plugin', 'plugin.json'), 'utf-8'));
const declaredAgents = pluginJson.agents || [];
const requiredAgents = [
  './agents/code-explore.md',
  './agents/doc-research.md',
  './agents/impact-explore.md',
];

const isolatedHome = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-agent-surface-home-'));
const env = { ...process.env, HOME: isolatedHome };

try {
  const marketplaceAdd = run('claude', ['plugin', 'marketplace', 'add', repoRoot], env);
  const install = run('claude', ['plugin', 'install', 'enterprise-harness@enterprise-harness', '--scope', 'local'], env);
  const pluginList = run('claude', ['plugin', 'list', '--json'], env);
  const pluginListJson = JSON.parse(pluginList.stdout || '[]');
  const installed = pluginListJson.find((p) => p.id === 'enterprise-harness@enterprise-harness');
  const installPath = installed?.installPath;
  const installedAgents = installPath && fs.existsSync(path.join(installPath, 'agents'))
    ? fs.readdirSync(path.join(installPath, 'agents')).sort()
    : [];

  const failures = [];
  if (!(marketplaceAdd.status === 0)) failures.push('marketplace add failed');
  if (!(install.status === 0)) failures.push('plugin install failed');
  for (const agent of requiredAgents) {
    if (!declaredAgents.includes(agent)) failures.push(`plugin manifest missing ${agent}`);
  }
  for (const agentFile of ['code-explore.md', 'doc-research.md', 'impact-explore.md']) {
    if (!installedAgents.includes(agentFile)) failures.push(`installed plugin missing ${agentFile}`);
  }

  const ok = failures.length === 0;

  if (mode === 'red') {
    if (!ok) {
      fail(`Expected plugin agent surface to fail before implementation:\n${failures.join('\n')}`);
    }
    pass('Red precondition no longer holds.');
  }

  if (!ok) {
    fail(`Expected plugin agent surface to pass:\n${failures.join('\n')}`);
  }

  pass(mode === 'green' ? 'Green plugin-agent-surface smoke passed.' : 'Plugin-agent-surface verify smoke passed.');
} finally {
  fs.rmSync(isolatedHome, { recursive: true, force: true });
}
