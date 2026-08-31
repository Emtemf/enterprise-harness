import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const mode = process.argv[2];
if (!['verify', 'e2e'].includes(mode)) process.exit(2);

const pluginRoot = fileURLToPath(new URL('../../', import.meta.url));
function packPlugin(sourceRoot) {
  const packDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-installed-plugin-pack-'));
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  try {
    const packed = spawnSync(npmCommand, ['pack', '--ignore-scripts', '--pack-destination', packDir, '--json'], {
      cwd: sourceRoot,
      encoding: 'utf-8',
      shell: false,
    });
    assert.equal(packed.status, 0, `${packed.stdout || ''}\n${packed.stderr || ''}`.trim());
    const metadata = JSON.parse(packed.stdout);
    assert.equal(metadata.length, 1);
    const archive = path.join(packDir, metadata[0].filename);
    assert.ok(fs.existsSync(archive), `npm pack must produce ${archive}`);
    const installDir = path.join(packDir, 'installed');
    const extracted = spawnSync(npmCommand, [
      'install', '--ignore-scripts', '--no-save', '--package-lock=false', '--offline',
      '--prefix', installDir, archive,
    ], {
      cwd: sourceRoot,
      encoding: 'utf-8',
      shell: false,
    });
    assert.equal(extracted.status, 0, `${extracted.stdout || ''}\n${extracted.stderr || ''}`.trim());
    const packedRoot = path.join(installDir, 'node_modules', metadata[0].name);
    const manifest = JSON.parse(fs.readFileSync(path.join(packedRoot, '.claude-plugin', 'plugin.json'), 'utf-8'));
    assert.ok(manifest.skills.includes('./skills/test-design/'));
    assert.ok(manifest.agents.includes('./agents/test-design-worker.md'));
    for (const relative of [
      'skills/test-design/SKILL.md',
      'agents/test-design-worker.md',
      'skills/plan/assert/task-command-shape.mjs',
      'skills/plan/assets/task-commands.json.tmpl',
      'skills/plan/evals/evals.json',
    ]) {
      assert.ok(fs.existsSync(path.join(packedRoot, relative)), `packed plugin missing ${relative}`);
    }
    const packedSkill = fs.readFileSync(path.join(packedRoot, 'skills', 'test-design', 'SKILL.md'), 'utf-8');
    const packedWorker = fs.readFileSync(path.join(packedRoot, 'agents', 'test-design-worker.md'), 'utf-8');
    assert.match(packedSkill, /^name: test-design$/mu);
    assert.match(packedSkill, /^agent: enterprise-harness:test-design-worker$/mu);
    assert.match(packedWorker, /^name: test-design-worker$/mu);
    const planEvals = JSON.parse(fs.readFileSync(path.join(packedRoot, 'skills', 'plan', 'evals', 'evals.json'), 'utf-8'));
    assert.equal(planEvals.skill, 'plan');
    assert.equal(planEvals.version, manifest.version);
    const validation = spawnSync('claude', ['plugin', 'validate', packedRoot], {
      cwd: sourceRoot,
      encoding: 'utf-8',
      shell: process.platform === 'win32',
    });
    const validationOutput = `${validation.stdout || ''}\n${validation.stderr || ''}`;
    assert.equal(validation.status, 0, validationOutput);
    assert.doesNotMatch(validationOutput, /warning/iu, validationOutput);
    return { packDir, packedRoot };
  } catch (error) {
    fs.rmSync(packDir, { recursive: true, force: true });
    throw error;
  }
}

const packedPlugin = packPlugin(pluginRoot);
const packedRoot = packedPlugin.packedRoot;

if (mode !== 'e2e' || process.env.EH_RUN_CLAUDE_E2E !== 'true') {
  fs.rmSync(packedPlugin.packDir, { recursive: true, force: true });
  console.log('SKIP installed-plugin Claude E2E (packed plugin discovery verified; run with: EH_RUN_CLAUDE_E2E=true node runtime/test/installed-plugin-e2e.mjs e2e)');
  process.exit(0);
}

const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-installed-plugin-e2e-'));
const keepFixture = process.env.EH_KEEP_CLAUDE_E2E === 'true';
let commandOutput = '';

try {
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: fixture }).status, 0);
  const changeId = 'installed-plugin-e2e';
  const startChange = spawnSync(process.execPath, [
    path.join(packedRoot, 'runtime', 'cli.mjs'),
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
    '--plugin-dir', packedRoot,
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
  fs.rmSync(packedPlugin.packDir, { recursive: true, force: true });
  if (keepFixture) {
    console.error(`PRESERVE installed-plugin E2E fixture: ${fixture}`);
  } else {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
}
