import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { packInstalledPlugin } from './installed-plugin-fixture.mjs';

const mode = process.argv[2];
if (!['verify', 'e2e'].includes(mode)) process.exit(2);

const pluginRoot = fileURLToPath(new URL('../../', import.meta.url));
function verifyPackedPlugin(sourceRoot) {
  const installed = packInstalledPlugin(sourceRoot);
  const { packDir, packedRoot } = installed;
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(packedRoot, '.claude-plugin', 'plugin.json'), 'utf-8'));
    assert.ok(manifest.skills.includes('./skills/test-design/'));
    assert.ok(manifest.agents.includes('./agents/test-design-worker.md'));
    for (const relative of [
      'skills/test-design/SKILL.md',
      'agents/test-design-worker.md',
      'skills/plan/assert/task-command-shape.mjs',
      'skills/plan/assets/task-commands.json.tmpl',
      'skills/plan/evals/evals.json',
      'skills/harness/assets/project-contract-proposal.json.tmpl',
      'harness/schemas/project-contract-proposal.schema.json',
      'harness/schemas/project-contract-application.schema.json',
      'hooks/scripts/instructions-loaded.mjs',
      'runtime/lib/instruction-load-observations.mjs',
    ]) {
      assert.ok(fs.existsSync(path.join(packedRoot, relative)), `packed plugin missing ${relative}`);
    }
    const packedSkill = fs.readFileSync(path.join(packedRoot, 'skills', 'test-design', 'SKILL.md'), 'utf-8');
    const packedWorker = fs.readFileSync(path.join(packedRoot, 'agents', 'test-design-worker.md'), 'utf-8');
    assert.match(packedSkill, /^name: test-design$/mu);
    assert.match(packedSkill, /^agent: enterprise-harness:test-design-worker$/mu);
    assert.match(packedWorker, /^name: test-design-worker$/mu);
    for (const skill of ['archive', 'design', 'implement', 'plan', 'review', 'test-design', 'verify']) {
      const evals = JSON.parse(fs.readFileSync(path.join(packedRoot, 'skills', skill, 'evals', 'evals.json'), 'utf-8'));
      assert.equal(evals.skill, skill);
      assert.equal(evals.version, manifest.version, `${skill} eval version must match the installed plugin`);
    }
    const validation = spawnSync('claude', ['plugin', 'validate', packedRoot], {
      cwd: sourceRoot,
      encoding: 'utf-8',
      shell: process.platform === 'win32',
    });
    const validationOutput = `${validation.stdout || ''}\n${validation.stderr || ''}`;
    assert.equal(validation.status, 0, validationOutput);
    assert.doesNotMatch(validationOutput, /warning/iu, validationOutput);
    return installed;
  } catch (error) {
    fs.rmSync(packDir, { recursive: true, force: true });
    throw error;
  }
}

const packedPlugin = verifyPackedPlugin(pluginRoot);
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
  fs.writeFileSync(path.join(fixture, 'AGENTS.md'), '# Fixture contract\n\n- Keep this fixture isolated.\n', 'utf-8');
  fs.writeFileSync(path.join(fixture, 'CLAUDE.md'), '# Claude fixture instructions\n\n@AGENTS.md\n', 'utf-8');
  const changeId = 'installed-plugin-e2e';
  const modelArgs = process.env.EH_CLAUDE_E2E_MODEL
    ? ['--model', process.env.EH_CLAUDE_E2E_MODEL]
    : [];
  const result = spawnSync('claude', [
    '--plugin-dir', packedRoot,
    ...modelArgs,
    '--max-budget-usd', process.env.EH_CLAUDE_E2E_BUDGET || '1',
    // The fixture is an isolated temporary repository. The E2E must exercise the
    // installed runtime command instead of allowing a headless approval denial to
    // turn into a plausible model-only status report.
    '--permission-mode', 'bypassPermissions',
    '--output-format', 'json',
    '--print',
    `/enterprise-harness:harness Start a new governed change with the exact ID ${changeId} for this test request: verify installed plugin session binding. Then read its durable state, report the change ID and current lifecycle stage, and stop. Do not dispatch a subagent or modify files outside this temporary project.`,
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
  const instructionLedger = path.join(fixture, '.git', 'enterprise-harness', 'instructions-loaded', 'events.jsonl');
  assert.ok(fs.existsSync(instructionLedger), 'real Claude startup must trigger the packed InstructionsLoaded hook');
  const instructionEvents = fs.readFileSync(instructionLedger, 'utf-8').trim().split(/\r?\n/u).map(JSON.parse);
  assert.ok(instructionEvents.some((event) => event.filePath === 'CLAUDE.md'
    && /^[a-f0-9]{64}$/u.test(event.fileDigest)), 'InstructionsLoaded receipt must bind CLAUDE.md digest');
  assert.equal(instructionEvents.some((event) => Object.hasOwn(event, 'content')), false,
    'InstructionsLoaded receipts must not retain instruction content');
  console.log('PASS installed-plugin Claude E2E');
} finally {
  fs.rmSync(packedPlugin.packDir, { recursive: true, force: true });
  if (keepFixture) {
    console.error(`PRESERVE installed-plugin E2E fixture: ${fixture}`);
  } else {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
}
