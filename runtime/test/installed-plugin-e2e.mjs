import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const mode = process.argv[2];
if (!['verify', 'e2e'].includes(mode)) process.exit(2);

if (mode !== 'e2e' || process.env.EH_RUN_CLAUDE_E2E !== 'true') {
  console.log('SKIP installed-plugin Claude E2E (run with: EH_RUN_CLAUDE_E2E=true node runtime/test/installed-plugin-e2e.mjs e2e)');
  process.exit(0);
}

const pluginRoot = fileURLToPath(new URL('../../', import.meta.url));
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-installed-plugin-e2e-'));
const keepFixture = process.env.EH_KEEP_CLAUDE_E2E === 'true';
let commandOutput = '';

try {
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: fixture }).status, 0);
  const changeId = 'installed-plugin-e2e';
  const startChange = spawnSync(process.execPath, [
    path.join(pluginRoot, 'runtime', 'cli.mjs'),
    'start-change',
    changeId,
  ], {
    cwd: fixture,
    encoding: 'utf-8',
    shell: false,
  });
  assert.equal(
    startChange.status,
    0,
    `${startChange.stdout || ''}\n${startChange.stderr || ''}`.trim(),
  );
  const modelArgs = process.env.EH_CLAUDE_E2E_MODEL
    ? ['--model', process.env.EH_CLAUDE_E2E_MODEL]
    : [];
  const result = spawnSync('claude', [
    '--plugin-dir', pluginRoot,
    ...modelArgs,
    '--max-budget-usd', process.env.EH_CLAUDE_E2E_BUDGET || '1',
    '--permission-mode', 'acceptEdits',
    '--output-format', 'json',
    '--print',
    `/enterprise-harness:harness Resume the active ${changeId} change. Read its durable state, report the change ID and current lifecycle stage, then stop. Do not dispatch a subagent, create a new change, or modify files outside this temporary project.`,
  ], {
    cwd: fixture,
    encoding: 'utf-8',
    shell: false,
    timeout: 600_000,
  });
  commandOutput = `${result.stdout || ''}\n${result.stderr || ''}`.trim();
  assert.equal(result.status, 0, commandOutput);
  const changesDir = path.join(fixture, 'harness', 'changes');
  assert.ok(
    fs.existsSync(changesDir),
    `the installed Skill must create durable change state in the temporary project\nfixture=${fixture}\n${commandOutput}`,
  );
  const statePath = path.join(changesDir, changeId, 'state.json');
  assert.ok(fs.existsSync(statePath), 'the installed Skill must preserve the active change state');
  const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
  assert.equal(state.changeId, changeId);
  assert.equal(state.stage, 'clarify');
  assert.match(commandOutput, new RegExp(changeId, 'u'));
  assert.match(commandOutput, /clarify/u);
  console.log('PASS installed-plugin Claude E2E');
} finally {
  if (keepFixture) {
    console.error(`PRESERVE installed-plugin E2E fixture: ${fixture}`);
  } else {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
}
