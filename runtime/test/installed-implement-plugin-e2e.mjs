import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHandoffV2, v2ResultPath } from '../core/handoff-v2.mjs';
import { appendAgentEvent } from '../lib/agent-evidence.mjs';
import { computeStageGateDigest } from '../lib/execution-prerequisites.mjs';
import { packInstalledPlugin } from './installed-plugin-fixture.mjs';
import { writeCanonicalSingleTaskPlanFixture } from './plan-proof-fixture.mjs';

const mode = process.argv[2];
if (!['verify', 'e2e'].includes(mode)) process.exit(2);

const pluginRoot = fileURLToPath(new URL('../../', import.meta.url));
const installed = packInstalledPlugin(pluginRoot);
const { packedRoot } = installed;
const packedImplement = fs.readFileSync(path.join(packedRoot, 'skills', 'implement', 'SKILL.md'), 'utf-8');
const packedReview = fs.readFileSync(path.join(packedRoot, 'skills', 'review', 'SKILL.md'), 'utf-8');
assert.match(packedImplement, /^user-invocable: false$/mu);
assert.doesNotMatch(packedImplement, /^disable-model-invocation: true$/mu);
assert.match(packedReview, /^context: fork$/mu);
assert.match(packedReview, /^agent: enterprise-harness:reviewer$/mu);
for (const relative of [
  'agents/implementer.md',
  'skills/implement/scripts/finalize-result.mjs',
  'skills/implement/references/method.md',
  'skills/implement/references/artifact-contract.md',
  'skills/implement/references/self-check.md',
  'skills/review/references/task.md',
]) assert.ok(fs.existsSync(path.join(packedRoot, relative)), `packed Implement asset missing: ${relative}`);
const packedImplementer = fs.readFileSync(path.join(packedRoot, 'agents', 'implementer.md'), 'utf-8');
assert.match(packedImplementer, /^isolation: worktree$/mu);
assert.match(packedImplementer, /^\s+- enterprise-harness:implement$/mu);

if (mode !== 'e2e' || process.env.EH_RUN_CLAUDE_IMPLEMENT_E2E !== 'true') {
  fs.rmSync(installed.packDir, { recursive: true, force: true });
  console.log('SKIP installed Implement Claude E2E (packaged named-agent wiring verified; run with: EH_RUN_CLAUDE_IMPLEMENT_E2E=true node runtime/test/installed-implement-plugin-e2e.mjs e2e)');
  process.exit(0);
}

const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-installed-implement-e2e-'));
const keepFixture = process.env.EH_KEEP_CLAUDE_E2E === 'true';
let commandOutput = '';

function write(relative, content) {
  const target = path.join(fixture, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: options.cwd || fixture,
    encoding: 'utf-8',
    shell: false,
    env: options.env || process.env,
    timeout: options.timeout,
  });
}

try {
  assert.equal(run('git', ['init', '-q']).status, 0);
  assert.equal(run('git', ['config', 'user.email', 'implement@example.test']).status, 0);
  assert.equal(run('git', ['config', 'user.name', 'Implement Standard Sample']).status, 0);
  write('CLAUDE.md', [
    '# Fixture contract', '',
    '- 只完成当前单个冻结 task，不扩展范围。',
    '- 测试和产品代码必须由 implementer 在原生隔离 worktree 中修改。',
    '- 所有 phase 只能通过 Enterprise Harness task-run 执行。',
    '- 完成 canonical receipt 与原子 StageResult 后停止，不自行 review 或集成。',
    '',
  ].join('\n'));
  write('.gitignore', 'target/\n');
  write('pom.xml', [
    '<project xmlns="http://maven.apache.org/POM/4.0.0">',
    '  <modelVersion>4.0.0</modelVersion>',
    '  <groupId>sample</groupId><artifactId>greeting-service</artifactId><version>1</version>',
    '  <properties><maven.compiler.release>17</maven.compiler.release><project.build.sourceEncoding>UTF-8</project.build.sourceEncoding><junit.version>5.12.2</junit.version></properties>',
    '  <dependencies><dependency><groupId>org.junit.jupiter</groupId><artifactId>junit-jupiter</artifactId><version>${junit.version}</version><scope>test</scope></dependency></dependencies>',
    '  <build><plugins>',
    '    <plugin><groupId>org.apache.maven.plugins</groupId><artifactId>maven-compiler-plugin</artifactId><version>3.13.0</version></plugin>',
    '    <plugin><groupId>org.apache.maven.plugins</groupId><artifactId>maven-surefire-plugin</artifactId><version>3.5.3</version></plugin>',
    '  </plugins></build>',
    '</project>',
    '',
  ].join('\n'));
  const productRef = 'src/main/java/sample/GreetingService.java';
  const testRef = 'src/test/java/sample/GreetingServiceTest.java';
  write(productRef, [
    'package sample;',
    '',
    'public final class GreetingService {',
    '    public String greet(String name) {',
    '        return "Hello, " + name;',
    '    }',
    '}',
    '',
  ].join('\n'));

  const changeId = 'implement-standard-sample';
  const taskId = 'task-greeting';
  const base = `harness/changes/${changeId}`;
  write(`${base}/requirements.md`, '# Requirements\n\n- R1：问候必须返回 `你好，<name>`。\n- 范围外：国际化框架与持久化。\n');
  write(`${base}/design.md`, '# Design\n\n- D1：只修改 GreetingService 返回值，不引入新依赖。\n- VO1：对 Alice 返回 `你好，Alice`。\n');
  write(`${base}/test-cases.md`, [
    '## 测试用例',
    '| TCID | Traces | Level | Priority | Preconditions | Data | Actions | Observable assertions | Cleanup/Recovery | Status |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    '| TC1 | R1 / D1 / VO1 | unit | critical | service available | Alice | call greet | returns 你好，Alice | none | accepted |',
    '',
  ].join('\n'));
  const tasksContent = [
    '# Tasks', '',
    'Status: finalized-plan', '',
    '## Plan inputs',
    `- Design artifact: \`${base}/design.md\``,
    '- Design digest: bound by Plan StageResult',
    '- Classification artifact digest: bound by compound DesignProof',
    '- Plan review run: bound by PlanProof', '',
    `## Task 1: ${taskId}`, '',
    '### Target and scope', '',
    '- Goal: 以一个真实 TDD 链实现中文问候。',
    `- Modify: \`${productRef}\``,
    `- Create: \`${testRef}\``,
    `- Test: \`${testRef}\``,
    '- Out of scope: 国际化框架、API、SQL 和其他服务。', '',
    '### Frozen inputs', '',
    `- Consumes: \`${base}/design.md\`、\`${base}/test-cases.md\``,
    '- Input digests: bound by Implement Handoff v2',
    '- Design decisions/requirements: R1 / D1 / VO1',
    '- Test cases: TC1', '',
    '### Execution strategy', '',
    '- Strategy: `tdd`',
    '- Minimal RED case: TC1',
    '- Why this strategy fits: 用户可观察行为发生变化，先用聚焦单测证明旧行为不满足 R1。',
    '- Strategy-specific precondition and receipt: 真实 RED → 最小 GREEN → REFACTOR。', '',
    '### Commands and verification', '',
    '- Frozen primary argv: `mvn -q -Dtest=GreetingServiceTest test`',
    `- Machine command freeze: \`${base}/task-commands.json#tasks.${taskId}.commands\``,
    '- Additional argv: none',
    '- Expected result: RED 非零，GREEN 与 REFACTOR 为零。',
    '- Acceptance checks: TC1 返回值精确等于 `你好，Alice`。',
    '- Recovery/rollback: 恢复 GreetingService 与删除新增测试。', '',
    '### Independent review', '',
    '- Applicable rubrics: task',
    '- Reviewer input artifacts: tasks、task-commands、canonical receipt、真实 worktree diff。',
    '- Review completion condition: 不同 agent identity 的 reviewer 返回 pass。', '',
  ].join('\n');
  const frozenArgv = ['mvn', '-q', '-Dtest=GreetingServiceTest', 'test'];
  const plan = writeCanonicalSingleTaskPlanFixture(fixture, changeId, {
    taskId,
    tasksContent,
    taskCommands: {
      schemaVersion: 4,
      tasks: {
        [taskId]: {
          executionStrategy: 'tdd',
          strategyRationale: '用户可观察行为发生变化，必须先以 TC1 证明旧行为失败。',
          testCases: ['TC1'],
          minimalRedCase: 'TC1',
          writeScope: { allowed: [productRef, testRef], forbidden: ['harness/archive/**', 'pom.xml'] },
          commands: ['RED', 'GREEN', 'REFACTOR'].map((phase) => ({ phase, argv: frozenArgv })),
        },
      },
    },
  });
  write('harness/ACTIVE_CHANGE', `${changeId}\n`);
  appendAgentEvent(fixture, changeId, {
    kind: 'codegraph-attempt', agentId: 'fixture-code-explorer',
    observedAgentType: 'enterprise-harness:code-explore', cwd: fixture,
  });
  write(`${base}/evidence/stage-gate.json`, `${JSON.stringify({
    schemaVersion: 1,
    changeId,
    stage: 'implement',
    ok: true,
    validatedAt: new Date().toISOString(),
    changeDigest: computeStageGateDigest(fixture, changeId),
  }, null, 2)}\n`);
  assert.equal(run('git', ['add', '.']).status, 0);
  assert.equal(run('git', ['commit', '-qm', 'implement standard fixture']).status, 0);

  const stateRef = `${base}/state.json`;
  const receiptRef = `${base}/evidence/tasks/${taskId}.json`;
  const implementHandoff = createHandoffV2(fixture, {
    changeId,
    stage: 'implement',
    behavior: 'implement.execute-task',
    agent: { type: 'enterprise-harness:implementer', skill: 'implement' },
    inputRefs: [stateRef, plan.tasksRef, plan.commandsRef, plan.planProofRef, plan.designRef, plan.testCasesRef],
    tecpc: {
      target: '在隔离 worktree 以真实 TDD 完成中文问候单任务',
      evidence: [plan.planProofRef, plan.testCasesRef],
      context: [plan.designRef, plan.tasksRef, plan.commandsRef],
      path: `${plan.planProofRef} -> ${receiptRef}`,
      correction: null,
    },
  });
  const modelArgs = process.env.EH_CLAUDE_E2E_MODEL ? ['--model', process.env.EH_CLAUDE_E2E_MODEL] : [];
  const projectRef = (target) => path.relative(fixture, target).split(path.sep).join('/');

  function runForkedSkill(skill, handoff, instruction, budget = '5') {
    const marker = `HANDOFF_INPUT=${projectRef(handoff.path)}`;
    const child = run('claude', [
      '--plugin-dir', packedRoot,
      ...modelArgs,
      '--max-budget-usd', process.env.EH_CLAUDE_IMPLEMENT_E2E_BUDGET || budget,
      '--permission-mode', 'bypassPermissions',
      '--output-format', 'json',
      '--print',
      `先用 Bash 原样运行 node "${packedRoot}/runtime/cli.mjs" sessions bind "$ENTERPRISE_HARNESS_SESSION_ID" ${changeId} "$PWD" installed-e2e 绑定当前真实 session，不做其他诊断。成功后调用 enterprise-harness:${skill} Skill，参数必须原样且只有 ${marker}。${instruction}`,
    ], { timeout: 900_000 });
    const output = `${child.stdout || ''}\n${child.stderr || ''}`.trim();
    commandOutput = `${commandOutput}\n${output}`.trim();
    assert.equal(child.status, 0, output);
  }

  function runNamedAgent(agentType, handoff, instruction, budget = '5') {
    const marker = `HANDOFF_INPUT=${handoff.path}`;
    const child = run('claude', [
      '--plugin-dir', packedRoot,
      ...modelArgs,
      '--max-budget-usd', process.env.EH_CLAUDE_IMPLEMENT_E2E_BUDGET || budget,
      '--permission-mode', 'bypassPermissions',
      '--output-format', 'json',
      '--print',
      `先用 Bash 原样运行 node "${packedRoot}/runtime/cli.mjs" sessions bind "$ENTERPRISE_HARNESS_SESSION_ID" ${changeId} "$PWD" installed-e2e 绑定当前真实 session，不做其他诊断。成功后调用 Agent tool，subagent_type 必须是 ${agentType}，prompt 必须原样且只有 ${marker}。${instruction}`,
    ], { timeout: 900_000 });
    const output = `${child.stdout || ''}\n${child.stderr || ''}`.trim();
    commandOutput = `${commandOutput}\n${output}`.trim();
    assert.equal(child.status, 0, output);
  }

  runNamedAgent('enterprise-harness:implementer', implementHandoff,
    `只执行 ${taskId}：先用 Write 创建 ${testRef} 的 JUnit 5 测试并精确断言“你好，Alice”；然后分别以三条独立、单行 Bash 命令调用 task-run RED、GREEN、REFACTOR。RED 必须先真实失败；RED 后用 Edit 对 ${productRef} 做最小实现，GREEN 后不做无关重构。最后读取 Implement 自检清单并用一条独立、单行命令运行 finalizer。StageResult 原子持久化后立即停止，不 review、不集成。`);

  const resultPath = v2ResultPath(fixture, changeId, implementHandoff.runId);
  assert.ok(fs.existsSync(resultPath), `installed Implement Skill must persist StageResult\nfixture=${fixture}\n${commandOutput}`);
  const implementResult = JSON.parse(fs.readFileSync(resultPath, 'utf-8'));
  assert.equal(implementResult.status, 'pass');
  assert.deepEqual(implementResult.producer, { agentType: 'enterprise-harness:implementer', skill: 'implement' });
  assert.deepEqual(implementResult.inputDigests, implementHandoff.input.inputDigests);
  assert.deepEqual(implementResult.artifacts.map(({ path: artifactPath }) => artifactPath), [receiptRef]);
  const receipt = JSON.parse(fs.readFileSync(path.join(fixture, receiptRef), 'utf-8'));
  assert.deepEqual(receipt.executions.map(({ phase, exitCode }) => ({ phase, exitCode })), [
    { phase: 'RED', exitCode: 1 },
    { phase: 'GREEN', exitCode: 0 },
    { phase: 'REFACTOR', exitCode: 0 },
  ]);
  assert.deepEqual(receipt.executions.map(({ argv }) => argv), [frozenArgv, frozenArgv, frozenArgv]);
  assert.deepEqual(receipt.changedPaths.sort(), [productRef, testRef].sort());
  assert.notEqual(path.resolve(receipt.worktree.path), path.resolve(fixture), 'Implement must run in a native isolated worktree');
  assert.match(fs.readFileSync(path.join(receipt.worktree.path, productRef), 'utf-8'), /你好/u);
  assert.ok(fs.existsSync(path.join(receipt.worktree.path, testRef)));
  assert.match(fs.readFileSync(path.join(fixture, productRef), 'utf-8'), /Hello/u, 'integration checkout must remain unchanged before review');

  const reviewHandoff = createHandoffV2(fixture, {
    changeId,
    stage: 'implement',
    behavior: 'implement.review-task',
    role: 'check',
    parentRunId: implementHandoff.runId,
    agent: { type: 'enterprise-harness:reviewer', skill: 'review' },
    inputRefs: [stateRef, plan.designRef, plan.testCasesRef, plan.tasksRef, plan.commandsRef, receiptRef],
    rubricIds: ['task'],
    tecpc: {
      target: '独立审查中文问候 task 的 frozen contract、TDD receipt 与真实 worktree diff',
      evidence: [receiptRef],
      context: [plan.designRef, plan.testCasesRef, plan.tasksRef, plan.commandsRef],
      path: `${receiptRef} -> independent task review`,
      correction: null,
    },
  });
  runForkedSkill('review', reviewHandoff,
    '严格读取 task rubric、canonical receipt 和 receipt.worktree.path 下的真实代码与测试；核对 frozen argv、真实 RED→GREEN→REFACTOR、write scope、TC1 与最小 diff。没有 finding 时运行 Review finalizer 原子持久化 pass；不得编辑、集成或读取 implementer transcript。');
  const review = JSON.parse(fs.readFileSync(v2ResultPath(fixture, changeId, reviewHandoff.runId, 'check'), 'utf-8'));
  assert.equal(review.verdict, 'pass');
  assert.deepEqual(review.rubricIds, ['task']);
  assert.equal(review.reviewedRunId, implementHandoff.runId);

  const beforeIntegration = run(process.execPath, [path.join(packedRoot, 'runtime', 'cli.mjs'), 'lifecycle', 'state', changeId, 'verify']);
  assert.notEqual(beforeIntegration.status, 0, 'Implement must not complete before reviewed worktree content is integrated');
  assert.match(`${beforeIntegration.stdout}\n${beforeIntegration.stderr}`, /not integrated|differs from the reviewed worktree/u);
  for (const relative of receipt.changedPaths) {
    const source = path.join(receipt.worktree.path, relative);
    const target = path.join(fixture, relative);
    if (fs.existsSync(source)) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(source, target);
    } else {
      fs.rmSync(target, { force: true });
    }
  }
  const advanced = run(process.execPath, [path.join(packedRoot, 'runtime', 'cli.mjs'), 'lifecycle', 'state', changeId, 'verify']);
  assert.equal(advanced.status, 0, `${advanced.stdout}\n${advanced.stderr}`);
  const proof = JSON.parse(fs.readFileSync(path.join(fixture, `${base}/evidence/completion/implement.json`), 'utf-8'));
  assert.equal(proof.stage, 'implement');
  assert.deepEqual(proof.taskProofs.map(({ taskId: completedTask }) => completedTask), [taskId]);
  const state = JSON.parse(fs.readFileSync(path.join(fixture, stateRef), 'utf-8'));
  assert.equal(state.stage, 'verify');

  const events = fs.readFileSync(path.join(fixture, '.git', 'enterprise-harness', 'receipts', changeId, 'agent-events.jsonl'), 'utf-8')
    .trim().split(/\r?\n/u).map(JSON.parse);
  for (const [runId, skill, agentType] of [
    [implementHandoff.runId, 'implement', 'enterprise-harness:implementer'],
    [reviewHandoff.runId, 'review', 'enterprise-harness:reviewer'],
  ]) {
    assert.ok(events.some((event) => event.kind === 'dispatch' && event.runId === runId && event.preloadedSkill === skill));
    assert.ok(events.some((event) => event.kind === 'stop' && event.runId === runId && event.observedAgentType === agentType));
    assert.ok(events.some((event) => event.kind === 'dispatch-binding' && event.runId === runId));
  }
  console.log('PASS installed Implement Claude E2E');
} finally {
  fs.rmSync(installed.packDir, { recursive: true, force: true });
  if (keepFixture) console.error(`PRESERVE installed Implement E2E fixture: ${fixture}`);
  else fs.rmSync(fixture, { recursive: true, force: true });
}
