import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHandoffV2, v2ResultPath } from '../core/handoff-v2.mjs';
import { writeCanonicalCompoundDesignFixture } from './design-proof-fixture.mjs';
import { packInstalledPlugin } from './installed-plugin-fixture.mjs';

const mode = process.argv[2];
if (!['verify', 'e2e'].includes(mode)) process.exit(2);

const pluginRoot = fileURLToPath(new URL('../../', import.meta.url));
const installed = packInstalledPlugin(pluginRoot);
const { packedRoot } = installed;
const packedPlan = fs.readFileSync(path.join(packedRoot, 'skills', 'plan', 'SKILL.md'), 'utf-8');
const packedReview = fs.readFileSync(path.join(packedRoot, 'skills', 'review', 'SKILL.md'), 'utf-8');
assert.match(packedPlan, /^context: fork$/mu);
assert.match(packedPlan, /^agent: enterprise-harness:artifact-worker$/mu);
assert.match(packedReview, /^context: fork$/mu);
assert.match(packedReview, /^agent: enterprise-harness:reviewer$/mu);
for (const relative of [
  'skills/plan/scripts/prepare-input.mjs',
  'skills/plan/scripts/finalize-result.mjs',
  'skills/plan/assert/task-shape.mjs',
  'skills/plan/assert/task-command-shape.mjs',
  'skills/plan/assets/tasks.md.tmpl',
  'skills/plan/assets/task-commands.json.tmpl',
  'skills/review/references/plan.md',
]) assert.ok(fs.existsSync(path.join(packedRoot, relative)), `packed Plan asset missing: ${relative}`);

if (mode !== 'e2e' || process.env.EH_RUN_CLAUDE_PLAN_E2E !== 'true') {
  fs.rmSync(installed.packDir, { recursive: true, force: true });
  console.log('SKIP installed Plan Claude E2E (packaged fork wiring verified; run with: EH_RUN_CLAUDE_PLAN_E2E=true node runtime/test/installed-plan-plugin-e2e.mjs e2e)');
  process.exit(0);
}

const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-installed-plan-e2e-'));
const keepFixture = process.env.EH_KEEP_CLAUDE_E2E === 'true';
let commandOutput = '';

function write(target, content) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

try {
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: fixture }).status, 0);
  write(path.join(fixture, 'CLAUDE.md'), [
    '# Fixture contract', '',
    '- 仅处理当前临时 Java/Maven 项目。',
    '- 所有用户可见计划产物使用中文，machine literal 保持原样。',
    '- 必须通过已安装 Enterprise Harness Skill 的脚本完成制品验证和持久化。',
    '',
  ].join('\n'));
  write(path.join(fixture, 'pom.xml'), '<project><modelVersion>4.0.0</modelVersion><groupId>sample</groupId><artifactId>resource-service</artifactId><version>1</version></project>\n');
  write(path.join(fixture, 'src/main/java/sample/ResourceController.java'), 'package sample; public final class ResourceController {}\n');
  write(path.join(fixture, 'src/test/java/sample/ResourceControllerTest.java'), 'package sample; public final class ResourceControllerTest {}\n');

  const changeId = 'plan-standard-sample';
  const base = `harness/changes/${changeId}`;
  const changeDir = path.join(fixture, base);
  const requirementsRef = `${base}/requirements.md`;
  const designRef = `${base}/design.md`;
  const testCasesRef = `${base}/test-cases.md`;
  const designProofRef = `${base}/evidence/completion/design.json`;
  const tasksRef = `${base}/tasks.md`;
  const taskCommandsRef = `${base}/task-commands.json`;
  write(path.join(fixture, requirementsRef), [
    '# Requirements', '',
    '- R1：授权用户可通过 POST /resources 创建资源并得到稳定 ID。',
    '- R2：相同 Idempotency-Key 的并发请求只能创建一个资源。',
    '- R3：数据库变更必须有可审计的 forward/rollback SQL，旧版本可回退。',
    '- 范围外：管理后台和跨区域复制。',
    '',
  ].join('\n'));
  write(path.join(fixture, designRef), [
    '# Design', '',
    '## Decisions',
    '- D1：ResourceController 调用 ResourceService；service 拥有事务边界并返回统一错误模型。',
    '- D2：ResourceService 使用 IdempotencyRepository 的唯一键约束处理并发；重复请求返回原资源。',
    '- D3：新增 `db/migration/V002__resource_idempotency.sql` 和 `db/rollback/U002__resource_idempotency.sql`，不修改历史 SQL。',
    '- D4：使用现有 Spring MVC 分层，不引入新框架或额外模式。',
    '## Verification outcomes',
    '- VO1：POST /resources 的成功、401 和冲突响应可观察。',
    '- VO2：两次并发同键请求只产生一行资源记录。',
    '- VO3：forward/rollback 后 schema 分别存在/移除幂等唯一约束。',
    '## Paths',
    '- API：`src/main/java/sample/ResourceController.java`、`src/main/java/sample/ResourceService.java`。',
    '- Tests：`src/test/java/sample/ResourceControllerTest.java`、`src/test/java/sample/ResourceServiceTest.java`。',
    '- SQL：`db/migration/V002__resource_idempotency.sql`、`db/rollback/U002__resource_idempotency.sql`。',
    '',
  ].join('\n'));
  write(path.join(fixture, testCasesRef), [
    '## 测试用例',
    '| TCID | Traces | Level | Priority | Preconditions | Data | Actions | Observable assertions | Cleanup/Recovery | Status |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    '| TC1 | R1 / D1 / VO1 | unit | critical | controller ready | valid request | POST /resources | 201 and stable ID | delete fixture | accepted |',
    '| TC2 | R2 / D2 / VO2 | integration | critical | database ready | same key twice | concurrent POST | one row and same ID | rollback transaction | accepted |',
    '| TC3 | R1 / D1 / VO1 | integration | critical | anonymous request | valid body | POST /resources | 401 and no row | none | accepted |',
    '| TC4 | R3 / D3 / VO3 | migration | critical | old schema | migration files | apply then rollback | constraint appears then disappears | restore old schema | accepted |',
    '| TC5 | R1 / D1 / VO1 | e2e | normal | service started | authorized request | create resource | response and persisted row agree | delete resource | accepted |',
    '',
  ].join('\n'));
  writeCanonicalCompoundDesignFixture(fixture, changeId, { stateStage: 'plan' });
  write(path.join(fixture, 'harness', 'ACTIVE_CHANGE'), `${changeId}\n`);

  const planHandoff = createHandoffV2(fixture, {
    changeId,
    stage: 'plan',
    behavior: 'plan.produce',
    agent: { type: 'enterprise-harness:artifact-worker', skill: 'plan' },
    inputRefs: [requirementsRef, designRef, testCasesRef, designProofRef, 'pom.xml'],
    tecpc: {
      target: '将 compound Design 拆成可独立执行、审查和回滚的详细任务与命令冻结',
      evidence: [designProofRef, testCasesRef],
      context: [requirementsRef, designRef, 'pom.xml'],
      path: `${designProofRef} -> ${tasksRef} + ${taskCommandsRef}`,
      correction: null,
    },
  });
  const modelArgs = process.env.EH_CLAUDE_E2E_MODEL ? ['--model', process.env.EH_CLAUDE_E2E_MODEL] : [];
  const projectRef = (target) => path.relative(fixture, target).split(path.sep).join('/');

  function runForkedSkill(skill, handoff, instruction, budget = '4') {
    const marker = `HANDOFF_INPUT=${projectRef(handoff.path)}`;
    const child = spawnSync('claude', [
      '--plugin-dir', packedRoot,
      ...modelArgs,
      '--max-budget-usd', process.env.EH_CLAUDE_PLAN_E2E_BUDGET || budget,
      '--permission-mode', 'bypassPermissions',
      '--output-format', 'json',
      '--print',
      `先用 Bash 原样运行 node "${packedRoot}/runtime/cli.mjs" sessions bind "$ENTERPRISE_HARNESS_SESSION_ID" ${changeId} "$PWD" installed-e2e 绑定当前真实 session，不做其他诊断。成功后调用 enterprise-harness:${skill} Skill，参数必须原样且只有 ${marker}。${instruction}`,
    ], { cwd: fixture, encoding: 'utf-8', shell: false, timeout: 900_000 });
    const output = `${child.stdout || ''}\n${child.stderr || ''}`.trim();
    commandOutput = `${commandOutput}\n${output}`.trim();
    assert.equal(child.status, 0, output);
  }

  runForkedSkill('plan', planHandoff,
    '严格执行 prepare、双模板、逐 task 自检和 finalizer；生成 tasks.md 与 task-commands.json，覆盖全部 accepted TC，数据库变更使用独立 migration task 和历史 SQL 路径。成功持久化 StageResult 后停止，不修改产品代码、不进入 Implement。');
  const planResultPath = v2ResultPath(fixture, changeId, planHandoff.runId);
  assert.ok(fs.existsSync(planResultPath), `installed Plan Skill must persist StageResult\nfixture=${fixture}\n${commandOutput}`);
  const planResult = JSON.parse(fs.readFileSync(planResultPath, 'utf-8'));
  assert.equal(planResult.status, 'pass');
  assert.deepEqual(planResult.producer, { agentType: 'enterprise-harness:artifact-worker', skill: 'plan' });
  assert.deepEqual(planResult.inputDigests, planHandoff.input.inputDigests);
  assert.deepEqual(planResult.artifacts.map(({ path: artifactPath }) => artifactPath), [tasksRef, taskCommandsRef]);
  const tasks = fs.readFileSync(path.join(fixture, tasksRef), 'utf-8');
  const commands = JSON.parse(fs.readFileSync(path.join(fixture, taskCommandsRef), 'utf-8'));
  for (const tcId of ['TC1', 'TC2', 'TC3', 'TC4', 'TC5']) assert.match(tasks, new RegExp(`\\b${tcId}\\b`, 'u'));
  assert.ok(Object.values(commands.tasks).some(({ executionStrategy }) => executionStrategy === 'migration'), 'SQL change must produce a migration task');
  assert.ok(Object.values(commands.tasks).every(({ commands: phases }) => phases.every(({ argv }) => Array.isArray(argv) && argv.length > 0)));
  assert.equal(fs.readFileSync(path.join(fixture, 'src/main/java/sample/ResourceController.java'), 'utf-8'), 'package sample; public final class ResourceController {}\n');

  const planResultRef = projectRef(planResultPath);
  const reviewHandoff = createHandoffV2(fixture, {
    changeId,
    stage: 'plan',
    behavior: 'plan.review',
    role: 'check',
    parentRunId: planHandoff.runId,
    agent: { type: 'enterprise-harness:reviewer', skill: 'review' },
    inputRefs: [requirementsRef, designRef, testCasesRef, designProofRef, tasksRef, taskCommandsRef, planResultRef],
    rubricIds: ['plan'],
    tecpc: {
      target: '独立审查详细任务、策略、SQL 历史、命令冻结与全部 TC 覆盖',
      evidence: [planResultRef, tasksRef, taskCommandsRef],
      context: [requirementsRef, designRef, testCasesRef, designProofRef],
      path: `${tasksRef} + ${taskCommandsRef} -> independent plan review`,
      correction: null,
    },
  });
  runForkedSkill('review', reviewHandoff,
    '只读冻结输入并逐项执行 plan rubric；没有未处置 finding 时运行 Review finalizer 原子持久化 pass ReviewResult。不得编辑计划或产品代码。');
  const review = JSON.parse(fs.readFileSync(v2ResultPath(fixture, changeId, reviewHandoff.runId, 'check'), 'utf-8'));
  assert.equal(review.verdict, 'pass');
  assert.deepEqual(review.rubricIds, ['plan']);
  assert.equal(review.reviewedRunId, planHandoff.runId);

  const runtimeEnv = { ...process.env };
  delete runtimeEnv.ENTERPRISE_HARNESS_SESSION_ID;
  delete runtimeEnv.CLAUDE_SESSION_ID;
  const firstTask = Object.keys(commands.tasks)[0];
  const selected = spawnSync(process.execPath, [path.join(packedRoot, 'runtime', 'cli.mjs'), 'lifecycle', 'current-task', changeId, firstTask], {
    cwd: fixture, encoding: 'utf-8', shell: false, env: runtimeEnv,
  });
  assert.equal(selected.status, 0, `${selected.stdout || ''}\n${selected.stderr || ''}`);
  const advanced = spawnSync(process.execPath, [path.join(packedRoot, 'runtime', 'cli.mjs'), 'lifecycle', 'state', changeId, 'implement'], {
    cwd: fixture, encoding: 'utf-8', shell: false, env: runtimeEnv,
  });
  assert.equal(advanced.status, 0, `${advanced.stdout || ''}\n${advanced.stderr || ''}`);
  const proofRef = `${base}/evidence/completion/plan.json`;
  const proof = JSON.parse(fs.readFileSync(path.join(fixture, proofRef), 'utf-8'));
  assert.equal(proof.type, 'completion-proof');
  assert.equal(proof.stage, 'plan');
  assert.deepEqual(proof.artifacts.map(({ path: artifactPath }) => artifactPath), [tasksRef, taskCommandsRef]);
  const state = JSON.parse(fs.readFileSync(path.join(changeDir, 'state.json'), 'utf-8'));
  assert.equal(state.stage, 'implement');
  assert.equal(state.currentTask, firstTask, 'transition must preserve Main\'s explicit frozen-task selection');

  const events = fs.readFileSync(path.join(fixture, '.git', 'enterprise-harness', 'receipts', changeId, 'agent-events.jsonl'), 'utf-8')
    .trim().split(/\r?\n/u).map(JSON.parse);
  for (const [runId, skill, agentType] of [
    [planHandoff.runId, 'plan', 'enterprise-harness:artifact-worker'],
    [reviewHandoff.runId, 'review', 'enterprise-harness:reviewer'],
  ]) {
    assert.ok(events.some((event) => event.kind === 'dispatch' && event.runId === runId && event.preloadedSkill === skill));
    assert.ok(events.some((event) => event.kind === 'stop' && event.runId === runId && event.observedAgentType === agentType));
    assert.ok(events.some((event) => event.kind === 'dispatch-binding' && event.runId === runId));
  }
  console.log('PASS installed Plan Claude E2E');
} finally {
  fs.rmSync(installed.packDir, { recursive: true, force: true });
  if (keepFixture) console.error(`PRESERVE installed Plan E2E fixture: ${fixture}`);
  else fs.rmSync(fixture, { recursive: true, force: true });
}
