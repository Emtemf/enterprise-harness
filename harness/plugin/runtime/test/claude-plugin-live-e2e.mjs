import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const mode = process.argv[2] || 'verify';
if (process.env.HARNESS_LIVE_E2E !== '1') {
  console.log('SKIP claude-plugin-live-e2e (set HARNESS_LIVE_E2E=1 to require authenticated proof)');
  process.exit(0);
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const target = fs.mkdtempSync(path.join(os.tmpdir(), 'enterprise-harness-live-'));
function command(cmd, args, options = {}) {
  return spawnSync(cmd, args, { cwd: target, encoding: 'utf-8', shell: false, ...options });
}
try {
  assert.equal(command('git', ['init', '-q']).status, 0);
  command('git', ['config', 'user.email', 'live@example.invalid']);
  command('git', ['config', 'user.name', 'live']);
  fs.mkdirSync(path.join(target, 'src/main/java/demo'), { recursive: true });
  fs.writeFileSync(path.join(target, 'src/main/java/demo/App.java'), 'package demo; final class App {}\n');
  command('git', ['add', '.']);
  command('git', ['commit', '-qm', 'clean live target']);
  const start = command(process.execPath, [path.join(root, 'harness/plugin/runtime/cli.mjs'), 'start-change', 'live-probe', 'codex', 'L1', 'plugin live probe']);
  assert.equal(start.status, 0, start.stderr || start.stdout);
  const fakeBin = path.join(target, '.live-bin');
  fs.mkdirSync(fakeBin);
  const codegraph = path.join(fakeBin, process.platform === 'win32' ? 'codegraph.cmd' : 'codegraph');
  fs.writeFileSync(codegraph, process.platform === 'win32' ? '@exit /b 7\r\n' : '#!/bin/sh\nexit 7\n');
  if (process.platform !== 'win32') fs.chmodSync(codegraph, 0o755);
  const prompt = 'Invoke /enterprise-harness:harness for the active request. First use Bash to run exactly `command -v enterprise-harness && enterprise-harness --help`. Then dispatch enterprise-harness:code-explore once; it must attempt codegraph before fallback and return an Exploration Packet. Do not edit files.';
  const live = command('claude', ['--plugin-dir', root, '--setting-sources', 'user', '--dangerously-skip-permissions', '-p', prompt, '--output-format', 'stream-json', '--verbose', '--forward-subagent-text'], {
    env: { ...process.env, PATH: `${fakeBin}${path.delimiter}${process.env.PATH || ''}` },
    timeout: 600000,
    maxBuffer: 20 * 1024 * 1024,
  });
  assert.equal(live.status, 0, live.stderr || live.stdout);
  const stream = String(live.stdout || '');
  assert.match(stream, /enterprise-harness:harness/u);
  assert.match(stream, /enterprise-harness:code-explore/u);
  assert.match(stream, /enterprise-harness(?:\.mjs)?/u);
  const ledgerPath = path.join(target, '.git/enterprise-harness/receipts/live-probe/agent-events.jsonl');
  assert.equal(fs.existsSync(ledgerPath), true, 'live target must contain agent ledger');
  const events = fs.readFileSync(ledgerPath, 'utf-8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
  const startEvent = events.find((event) => event.kind === 'start' && event.observedAgentType === 'enterprise-harness:code-explore');
  assert.ok(startEvent?.agentId, 'scoped Start event is required');
  assert.ok(events.some((event) => event.kind === 'dispatch-binding' && event.agentId === startEvent.agentId), 'dispatch binding is required');
  assert.ok(events.some((event) => event.kind === 'stop' && event.agentId === startEvent.agentId), 'Stop event is required');
  const evidence = { schemaVersion: 1, mode, passed: true, claudeVersion: command('claude', ['--version']).stdout.trim(), assertions: ['canonical-skill', 'portable-launcher', 'scoped-agent', 'dispatch-start-stop-binding'], recordedAt: new Date().toISOString() };
  const evidencePath = path.join(root, 'harness/changes/plugin-runtime-agent-dispatch-hardening/evidence/live-e2e.json');
  fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
  fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log('PASS claude-plugin-live-e2e verify');
} finally {
  fs.rmSync(target, { recursive: true, force: true });
}
