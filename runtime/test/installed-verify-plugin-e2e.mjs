import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHandoffV2, v2ResultPath } from '../core/handoff-v2.mjs';
import { packInstalledPlugin } from './installed-plugin-fixture.mjs';
import { writeCanonicalSingleTaskPlanFixture } from './plan-proof-fixture.mjs';
import { readVerifyCommandEvidence } from '../api/verify-command.mjs';

const mode = process.argv[2];
if (!['verify', 'e2e'].includes(mode)) process.exit(2);
const pluginRoot = fileURLToPath(new URL('../../', import.meta.url));
const installed = packInstalledPlugin(pluginRoot);
const { packedRoot } = installed;
const packedSkill = fs.readFileSync(path.join(packedRoot, 'skills', 'verify', 'SKILL.md'), 'utf-8');
assert.match(packedSkill, /^context: fork$/mu);
assert.match(packedSkill, /^agent: enterprise-harness:artifact-worker$/mu);
assert.match(packedSkill, /^model: inherit$/mu);
assert.doesNotMatch(packedSkill, /^background:/mu);
assert.match(packedSkill, /verify-run <change-id> <verify-run-id> <TC-id>/u);
for (const relative of [
  'runtime/verify-run.mjs',
  'runtime/api/verify-command.mjs',
  'skills/verify/scripts/prepare-input.mjs',
  'skills/verify/scripts/finalize-result.mjs',
  'skills/verify/references/method.md',
  'skills/verify/references/artifact-contract.md',
  'skills/verify/references/self-check.md',
  'skills/verify/references/examples.md',
]) assert.ok(fs.existsSync(path.join(packedRoot, relative)), `packed Verify asset missing: ${relative}`);

if (mode !== 'e2e' || process.env.EH_RUN_CLAUDE_VERIFY_E2E !== 'true') {
  fs.rmSync(installed.packDir, { recursive: true, force: true });
  console.log('SKIP installed Verify Claude E2E (packaged fork and runner wiring verified; run with: EH_RUN_CLAUDE_VERIFY_E2E=true node runtime/test/installed-verify-plugin-e2e.mjs e2e)');
  process.exit(0);
}

const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-installed-verify-e2e-'));
const keepFixture = process.env.EH_KEEP_CLAUDE_E2E === 'true';
let output = '';

function write(relative, content) {
  const target = path.join(fixture, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

try {
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: fixture, shell: false }).status, 0);
  assert.equal(spawnSync('git', ['config', 'user.email', 'verify@example.test'], { cwd: fixture, shell: false }).status, 0);
  assert.equal(spawnSync('git', ['config', 'user.name', 'Verify Standard Sample'], { cwd: fixture, shell: false }).status, 0);
  write('CLAUDE.md', '# Fixture contract\n\n- 只执行当前 Verify handoff。\n- 必须使用 Enterprise Harness verify-run，完成 StageResult 后停止。\n');
  const changeId = 'verify-standard-sample';
  const taskId = 'task-observable';
  const base = `harness/changes/${changeId}`;
  write(`${base}/requirements.md`, '# Requirements\n\n- R1：最终验证必须观察到标准样例输出。\n');
  write(`${base}/design.md`, '# Design\n\n- D1：以无副作用 CLI 输出作为标准样例。\n- VO1：stdout 精确包含 `verify-standard-ok`。\n');
  write(`${base}/test-cases.md`, [
    '## 测试用例',
    '| TCID | Traces | Level | Priority | Preconditions | Data | Actions | Observable assertions | Cleanup/Recovery | Status |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    '| TC1 | R1 / D1 / VO1 | e2e | critical | Node.js available | none | execute frozen CLI | stdout is verify-standard-ok | none | accepted |',
  ].join('\n'));
  const argv = [process.execPath, '-e', "process.stdout.write('verify-standard-ok\\n')"];
  const tasksContent = [
    '# Tasks', '', 'Status: finalized-plan', '', `## Task 1: ${taskId}`, '',
    '### Target and scope', '- Goal: 执行可观察标准样例。', '- Modify: none', '- Create: none', '- Test: TC1', '- Out of scope: 产品代码。', '',
    '### Frozen inputs', `- Consumes: \`${base}/test-cases.md\``, '- Input digests: bound by Verify Handoff v2', '- Design decisions/requirements: R1 / D1 / VO1', '- Test cases: TC1', '',
    '### Execution strategy', '- Strategy: `direct`', '- Minimal RED case: none', '- Why this strategy fits: 最终验证仅重跑已冻结的无副作用命令。', '- Strategy-specific precondition and receipt: Node.js available。', '',
    '### Commands and verification', `- Frozen primary argv: \`${JSON.stringify(argv)}\``, `- Machine command freeze: \`${base}/task-commands.json#tasks.${taskId}.commands\``, '- Additional argv: none', '- Expected result: exit 0。', '- Acceptance checks: stdout 含 verify-standard-ok。', '- Recovery/rollback: none。', '',
    '### Independent review', '- Applicable rubrics: task', '- Reviewer input artifacts: command evidence、validation、receipt。', '- Review completion condition: 独立 reviewer pass。', '',
  ].join('\n');
  const plan = writeCanonicalSingleTaskPlanFixture(fixture, changeId, {
    taskId,
    tasksContent,
    taskCommands: { schemaVersion: 4, tasks: { [taskId]: {
      executionStrategy: 'direct', strategyRationale: '重跑最终可观察 CLI', testCases: ['TC1'], minimalRedCase: null,
      writeScope: { allowed: ['fixture.txt'], forbidden: ['harness/archive/**'] }, commands: [{ phase: 'VERIFY', argv }],
    } } },
  });
  const implementProofRef = `${base}/evidence/completion/implement.json`;
  write(implementProofRef, '{"type":"completion-proof","stage":"implement","fixture":true}\n');
  const statePath = path.join(fixture, base, 'state.json');
  const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
  fs.writeFileSync(statePath, `${JSON.stringify({ ...state, revision: state.revision + 1, stage: 'verify', currentTask: null }, null, 2)}\n`);
  write('harness/ACTIVE_CHANGE', `${changeId}\n`);
  const inputRefs = [plan.testCasesRef, plan.designProofRef, plan.tasksRef, plan.commandsRef, plan.planProofRef, implementProofRef];
  const handoff = createHandoffV2(fixture, {
    changeId, stage: 'verify', behavior: 'verify.collect', agent: { type: 'enterprise-harness:artifact-worker', skill: 'verify' }, inputRefs,
    tecpc: { target: '用真实 runner 验证标准 CLI 输出', evidence: [plan.planProofRef, implementProofRef], context: inputRefs, path: `${plan.commandsRef} -> TC1 command evidence -> validation.md`, correction: null },
  });
  const marker = `HANDOFF_INPUT=${path.relative(fixture, handoff.path).split(path.sep).join('/')}`;
  const modelArgs = process.env.EH_CLAUDE_E2E_MODEL ? ['--model', process.env.EH_CLAUDE_E2E_MODEL] : [];
  const child = spawnSync('claude', [
    '--plugin-dir', packedRoot,
    ...modelArgs,
    '--max-budget-usd', process.env.EH_CLAUDE_VERIFY_E2E_BUDGET || '5',
    '--permission-mode', 'bypassPermissions',
    '--output-format', 'json',
    '--print',
    `先用 Bash 原样运行 node "${packedRoot}/runtime/cli.mjs" sessions bind "$ENTERPRISE_HARNESS_SESSION_ID" ${changeId} "$PWD" installed-e2e 绑定当前真实 session，不做其他诊断。成功后调用 enterprise-harness:verify Skill，参数必须原样且只有 ${marker}。严格执行 prepare、references、逐 TC verify-run、validation 模板、自检和 finalizer；StageResult 原子持久化后停止，不进入 Review 或 Archive。`,
  ], { cwd: fixture, encoding: 'utf-8', shell: false, timeout: 900_000, env: process.env });
  output = `${child.stdout || ''}\n${child.stderr || ''}`.trim();
  assert.equal(child.status, 0, output);
  assert.ok(fs.existsSync(v2ResultPath(fixture, changeId, handoff.runId)), `Verify Skill did not persist StageResult\n${output}`);
  const result = JSON.parse(fs.readFileSync(v2ResultPath(fixture, changeId, handoff.runId), 'utf-8'));
  assert.equal(result.status, 'pass');
  const evidence = readVerifyCommandEvidence(fixture, changeId, handoff.runId, 'TC1', { expectedInputDigests: handoff.input.inputDigests });
  assert.equal(evidence.ok, true, evidence.problems.join('; '));
  assert.equal(fs.readFileSync(path.join(fixture, evidence.evidence.executions[0].stdoutRef), 'utf-8'), 'verify-standard-ok\n');
  assert.ok(result.artifacts.some(({ path: artifactPath }) => artifactPath.endsWith(`/evidence/verification/${handoff.runId}/TC1.json`)));
  console.log('PASS installed Verify Claude E2E');
} catch (error) {
  console.error(`installed Verify Claude E2E failed\nfixture=${fixture}\n${output}\n${error.stack || error.message}`);
  process.exitCode = 1;
} finally {
  fs.rmSync(installed.packDir, { recursive: true, force: true });
  if (!keepFixture && process.exitCode !== 1) fs.rmSync(fixture, { recursive: true, force: true });
}
