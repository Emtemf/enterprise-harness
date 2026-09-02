import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { approvedRequirements } from './clarify-readiness-fixture.mjs';
import { writeClassificationV2Fixture } from './classification-v2-fixture.mjs';
import { packInstalledPlugin } from './installed-plugin-fixture.mjs';
import { createHandoffV2, v2ResultPath } from '../core/handoff-v2.mjs';

const mode = process.argv[2];
if (!['verify', 'e2e'].includes(mode)) process.exit(2);

const pluginRoot = fileURLToPath(new URL('../../', import.meta.url));
const installed = packInstalledPlugin(pluginRoot);
const { packedRoot } = installed;
const packedSkill = fs.readFileSync(path.join(packedRoot, 'skills', 'design', 'SKILL.md'), 'utf-8');
const packedReviewSkill = fs.readFileSync(path.join(packedRoot, 'skills', 'review', 'SKILL.md'), 'utf-8');
const packedTestDesignSkill = fs.readFileSync(path.join(packedRoot, 'skills', 'test-design', 'SKILL.md'), 'utf-8');
assert.match(packedSkill, /^context: fork$/mu);
assert.match(packedSkill, /^agent: enterprise-harness:artifact-worker$/mu);
assert.match(packedReviewSkill, /^context: fork$/mu);
assert.match(packedReviewSkill, /^agent: enterprise-harness:reviewer$/mu);
assert.match(packedTestDesignSkill, /^context: fork$/mu);
assert.match(packedTestDesignSkill, /^agent: enterprise-harness:test-design-worker$/mu);
assert.ok(fs.existsSync(path.join(packedRoot, 'skills', 'design', 'scripts', 'prepare-input.mjs')));
assert.ok(fs.existsSync(path.join(packedRoot, 'skills', 'design', 'scripts', 'finalize-result.mjs')));

if (mode !== 'e2e' || process.env.EH_RUN_CLAUDE_DESIGN_E2E !== 'true') {
  fs.rmSync(installed.packDir, { recursive: true, force: true });
  console.log('SKIP installed Design Claude E2E (packaged fork wiring verified; run with: EH_RUN_CLAUDE_DESIGN_E2E=true node runtime/test/installed-design-plugin-e2e.mjs e2e)');
  process.exit(0);
}

const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-installed-design-e2e-'));
const keepFixture = process.env.EH_KEEP_CLAUDE_E2E === 'true';
let commandOutput = '';

try {
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: fixture }).status, 0);
  fs.writeFileSync(path.join(fixture, 'CLAUDE.md'), [
    '# Fixture contract',
    '',
    '- 仅处理当前临时项目。',
    '- 所有用户可见产物使用中文。',
    '- 必须通过已安装 Enterprise Harness Skill 的脚本完成制品验证。',
    '',
  ].join('\n'));
  const changeId = 'design-standard-sample';
  const changeDir = path.join(fixture, 'harness', 'changes', changeId);
  const requirementsRef = `harness/changes/${changeId}/requirements.md`;
  const researchRef = `harness/changes/${changeId}/evidence/code-research.json`;
  fs.mkdirSync(path.join(changeDir, 'evidence'), { recursive: true });
  fs.writeFileSync(path.join(fixture, requirementsRef), approvedRequirements().replace(
    '## 事实探索门禁',
    [
      '### 验收',
      '- R1：已授权用户可通过 POST /resources 创建资源，并得到稳定的资源标识。',
      '- R2：同一幂等键的重复请求不能创建重复资源。',
      '- R3：数据库迁移失败时必须可回滚且旧版本继续服务。',
      '### 范围',
      '- 包含：API 契约、持久化、授权、幂等、迁移与回滚。',
      '- 不包含：管理后台页面和跨区域复制。',
      '## 事实探索门禁',
    ].join('\n'),
  ));
  const classification = writeClassificationV2Fixture(fixture, changeId, {
    tier: 'L2',
    impact: { api: 'yes', data: 'yes', architecture: 'yes', rule: 'yes', security: 'yes' },
  });
  fs.writeFileSync(path.join(fixture, researchRef), `${JSON.stringify({
    packetVersion: 1,
    type: 'research-packet',
    facts: [
      { claim: '现有 controller 只依赖 resource service，事务边界归 service 所有。', sources: ['src/resource-service'] },
      { claim: '现有迁移使用顺序 SQL 文件，并要求 down migration 恢复旧 schema。', sources: ['db/migrations'] },
    ],
    uncertainties: [],
  }, null, 2)}\n`);
  fs.writeFileSync(path.join(changeDir, 'state.json'), `${JSON.stringify({
    schemaVersion: 6,
    revision: 1,
    changeId,
    lifecycle: 'active',
    stage: 'design',
    artifacts: { classification },
    blocker: null,
    validation: { status: 'missing', digest: null, validatedAt: null },
  }, null, 2)}\n`);
  fs.writeFileSync(path.join(fixture, 'harness', 'ACTIVE_CHANGE'), `${changeId}\n`);
  const handoff = createHandoffV2(fixture, {
    changeId,
    stage: 'design',
    behavior: 'design.produce',
    agent: { type: 'enterprise-harness:artifact-worker', skill: 'design' },
    inputRefs: [requirementsRef, classification.path, researchRef],
    tecpc: {
      target: '生成可供独立 Review 与 Test Design 消费的架构设计',
      evidence: [researchRef],
      context: [requirementsRef, classification.path],
      path: `${requirementsRef} -> harness/changes/${changeId}/design.md`,
      correction: null,
    },
  });
  const marker = `HANDOFF_INPUT=${path.relative(fixture, handoff.path).split(path.sep).join('/')}`;
  const modelArgs = process.env.EH_CLAUDE_E2E_MODEL ? ['--model', process.env.EH_CLAUDE_E2E_MODEL] : [];
  const result = spawnSync('claude', [
    '--plugin-dir', packedRoot,
    ...modelArgs,
    '--max-budget-usd', process.env.EH_CLAUDE_DESIGN_E2E_BUDGET || '3',
    '--permission-mode', 'bypassPermissions',
    '--output-format', 'json',
    '--print',
    `先用 Bash 原样运行 node "${packedRoot}/runtime/cli.mjs" sessions bind "$ENTERPRISE_HARNESS_SESSION_ID" ${changeId} "$PWD" installed-e2e 绑定当前真实 session，不做其他诊断。成功后调用 enterprise-harness:design Skill，参数必须原样且只有 ${marker}。严格执行该 Skill 的 prepare、模板、自检和 finalizer；成功持久化 StageResult 后停止，不进入 Review、Test Design 或 Plan。`,
  ], {
    cwd: fixture,
    encoding: 'utf-8',
    shell: false,
    timeout: 900_000,
  });
  commandOutput = `${result.stdout || ''}\n${result.stderr || ''}`.trim();
  assert.equal(result.status, 0, commandOutput);
  const resultPath = v2ResultPath(fixture, changeId, handoff.runId);
  assert.ok(fs.existsSync(resultPath), `installed Design Skill must persist StageResult\nfixture=${fixture}\n${commandOutput}`);
  const stageResult = JSON.parse(fs.readFileSync(resultPath, 'utf-8'));
  assert.equal(stageResult.status, 'pass');
  assert.deepEqual(stageResult.producer, { agentType: 'enterprise-harness:artifact-worker', skill: 'design' });
  assert.deepEqual(stageResult.inputDigests, handoff.input.inputDigests);
  assert.deepEqual(stageResult.artifacts.map(({ path: artifactPath }) => artifactPath), [
    `harness/changes/${changeId}/design.md`,
  ]);
  const eventPath = path.join(fixture, '.git', 'enterprise-harness', 'receipts', changeId, 'agent-events.jsonl');
  const events = fs.readFileSync(eventPath, 'utf-8').trim().split(/\r?\n/u).map(JSON.parse);
  const dispatch = events.find((event) => event.kind === 'dispatch'
    && event.runId === handoff.runId
    && event.invocationTool === 'Skill'
    && event.preloadedSkill === 'design');
  const stop = events.find((event) => event.kind === 'stop'
    && event.runId === handoff.runId
    && event.observedAgentType === 'enterprise-harness:artifact-worker');
  const binding = events.find((event) => event.kind === 'dispatch-binding'
    && event.runId === handoff.runId
    && event.agentId === stop?.agentId);
  assert.ok(dispatch, 'real Claude must dispatch the packaged Design Skill');
  assert.ok(stop?.transcriptDigest, 'the isolated artifact worker must stop with transcript evidence');
  assert.ok(binding, 'the completed worker must bind dispatch, identity and canonical result');
  const design = fs.readFileSync(path.join(changeDir, 'design.md'), 'utf-8');
  for (const token of ['R1', 'R2', 'R3', 'D1', 'E1', 'VO1', 'RB1', 'POST /resources', 'SQL']) {
    assert.match(design, new RegExp(token.replace('/', '\\/'), 'u'), `design must contain ${token}`);
  }
  assert.doesNotMatch(design, /^##\s+(?:测试设计|测试用例|Test Cases?)\s*$/imu);
  assert.equal(fs.existsSync(path.join(changeDir, 'test-cases.md')), false, 'Design must not absorb Test Design');

  const projectRef = (target) => path.relative(fixture, target).split(path.sep).join('/');
  const riskRubrics = ['api', 'data', 'architecture', 'rule', 'security'];
  function runForkedSkill(skill, nextHandoff, instruction, budget = '3') {
    const nextMarker = `HANDOFF_INPUT=${projectRef(nextHandoff.path)}`;
    const next = spawnSync('claude', [
      '--plugin-dir', packedRoot,
      ...modelArgs,
      '--max-budget-usd', process.env.EH_CLAUDE_DESIGN_E2E_BUDGET || budget,
      '--permission-mode', 'bypassPermissions',
      '--output-format', 'json',
      '--print',
      `先用 Bash 原样运行 node "${packedRoot}/runtime/cli.mjs" sessions bind "$ENTERPRISE_HARNESS_SESSION_ID" ${changeId} "$PWD" installed-e2e 绑定当前真实 session，不做其他诊断。成功后调用 enterprise-harness:${skill} Skill，参数必须原样且只有 ${nextMarker}。${instruction}`,
    ], {
      cwd: fixture,
      encoding: 'utf-8',
      shell: false,
      timeout: 900_000,
    });
    const output = `${next.stdout || ''}\n${next.stderr || ''}`.trim();
    commandOutput = `${commandOutput}\n${output}`.trim();
    assert.equal(next.status, 0, output);
    return output;
  }

  const architectureResultRef = projectRef(resultPath);
  const architectureCheck = createHandoffV2(fixture, {
    changeId,
    stage: 'design',
    behavior: 'design.review',
    role: 'check',
    parentRunId: handoff.runId,
    agent: { type: 'enterprise-harness:reviewer', skill: 'review' },
    inputRefs: [requirementsRef, classification.path, researchRef, `harness/changes/${changeId}/design.md`, architectureResultRef],
    rubricIds: ['design', ...riskRubrics],
    tecpc: {
      target: '独立审查架构设计与全部 full-impact 风险面',
      evidence: [architectureResultRef, researchRef],
      context: [requirementsRef, classification.path, `harness/changes/${changeId}/design.md`],
      path: `design.md -> independent architecture review`,
      correction: null,
    },
  });
  runForkedSkill('review', architectureCheck,
    '只读冻结输入，机械核对 handoff 中全部 rubrics；没有未处置 finding 时运行 Review finalizer 持久化 pass ReviewResult 后停止。不得编辑 design.md。');
  const architectureReviewPath = v2ResultPath(fixture, changeId, architectureCheck.runId, 'check');
  const architectureReview = JSON.parse(fs.readFileSync(architectureReviewPath, 'utf-8'));
  assert.equal(architectureReview.verdict, 'pass');
  assert.deepEqual(architectureReview.rubricIds, ['design', ...riskRubrics]);
  assert.equal(architectureReview.reviewedRunId, handoff.runId);

  const runtimeEnv = { ...process.env };
  delete runtimeEnv.ENTERPRISE_HARNESS_SESSION_ID;
  delete runtimeEnv.CLAUDE_SESSION_ID;
  const sealed = spawnSync(process.execPath, [path.join(packedRoot, 'runtime', 'cli.mjs'), 'design', 'seal-architecture', changeId], {
    cwd: fixture, encoding: 'utf-8', shell: false, env: runtimeEnv,
  });
  assert.equal(sealed.status, 0, `${sealed.stdout || ''}\n${sealed.stderr || ''}`);
  const architectureProofRef = `harness/changes/${changeId}/evidence/completion/design-architecture.json`;
  const architectureProof = JSON.parse(fs.readFileSync(path.join(fixture, architectureProofRef), 'utf-8'));
  assert.equal(architectureProof.executionRunId, handoff.runId);
  assert.equal(architectureProof.reviewRunId, architectureCheck.runId);

  const testDesignHandoff = createHandoffV2(fixture, {
    changeId,
    stage: 'design',
    behavior: 'design.test-cases',
    agent: { type: 'enterprise-harness:test-design-worker', skill: 'test-design' },
    inputRefs: [
      requirementsRef,
      classification.path,
      `harness/changes/${changeId}/design.md`,
      architectureProofRef,
      architectureResultRef,
    ],
    tecpc: {
      target: '把 Architecture Design 的 R/D/VO 映射为独立权威测试用例',
      evidence: [architectureProofRef, architectureResultRef],
      context: [requirementsRef, classification.path, `harness/changes/${changeId}/design.md`],
      path: `${architectureProofRef} -> test-cases.md`,
      correction: null,
    },
  });
  runForkedSkill('test-design', testDesignHandoff,
    '严格执行 prepare、模板、自检和 finalizer；只生成 test-cases.md，不运行测试、不写 exact argv、不修改 design/state。成功持久化 StageResult 后停止。', '4');
  const testDesignResultPath = v2ResultPath(fixture, changeId, testDesignHandoff.runId);
  const testDesignResult = JSON.parse(fs.readFileSync(testDesignResultPath, 'utf-8'));
  assert.equal(testDesignResult.status, 'pass');
  assert.deepEqual(testDesignResult.producer, { agentType: 'enterprise-harness:test-design-worker', skill: 'test-design' });
  const testCasesRef = `harness/changes/${changeId}/test-cases.md`;
  assert.deepEqual(testDesignResult.artifacts.map(({ path: artifactPath }) => artifactPath), [testCasesRef]);

  const testDesignResultRef = projectRef(testDesignResultPath);
  const testDesignCheck = createHandoffV2(fixture, {
    changeId,
    stage: 'design',
    behavior: 'design.test-cases.review',
    role: 'check',
    parentRunId: testDesignHandoff.runId,
    agent: { type: 'enterprise-harness:reviewer', skill: 'review' },
    inputRefs: [requirementsRef, classification.path, `harness/changes/${changeId}/design.md`, architectureProofRef, testCasesRef, testDesignResultRef],
    rubricIds: ['test-design', ...riskRubrics],
    tecpc: {
      target: '独立审查测试设计覆盖、失败路径、E2E 与全部 full-impact 风险面',
      evidence: [testDesignResultRef, architectureProofRef],
      context: [requirementsRef, classification.path, `harness/changes/${changeId}/design.md`, testCasesRef],
      path: `test-cases.md -> independent test-design review`,
      correction: null,
    },
  });
  runForkedSkill('review', testDesignCheck,
    '只读冻结输入，机械核对 handoff 中全部 rubrics；没有未处置 finding 时运行 Review finalizer 持久化 pass ReviewResult 后停止。不得编辑 test-cases.md。');
  const testDesignReview = JSON.parse(fs.readFileSync(v2ResultPath(fixture, changeId, testDesignCheck.runId, 'check'), 'utf-8'));
  assert.equal(testDesignReview.verdict, 'pass');
  assert.deepEqual(testDesignReview.rubricIds, ['test-design', ...riskRubrics]);
  assert.equal(testDesignReview.reviewedRunId, testDesignHandoff.runId);

  const advanced = spawnSync(process.execPath, [path.join(packedRoot, 'runtime', 'cli.mjs'), 'lifecycle', 'state', changeId, 'plan'], {
    cwd: fixture, encoding: 'utf-8', shell: false, env: runtimeEnv,
  });
  assert.equal(advanced.status, 0, `${advanced.stdout || ''}\n${advanced.stderr || ''}`);
  const designProofRef = `harness/changes/${changeId}/evidence/completion/design.json`;
  const designProof = JSON.parse(fs.readFileSync(path.join(fixture, designProofRef), 'utf-8'));
  assert.equal(designProof.type, 'completion-proof');
  assert.equal(designProof.stage, 'design');
  assert.deepEqual(designProof.stageProofs.map(({ kind }) => kind), ['architecture', 'test-design']);
  assert.deepEqual(designProof.artifacts.map(({ path: artifactPath }) => artifactPath), [
    `harness/changes/${changeId}/design.md`,
    testCasesRef,
  ]);
  assert.equal(JSON.parse(fs.readFileSync(path.join(changeDir, 'state.json'), 'utf-8')).stage, 'plan');
  console.log('PASS installed compound Design Claude E2E');
} finally {
  fs.rmSync(installed.packDir, { recursive: true, force: true });
  if (keepFixture) console.error(`PRESERVE installed Design E2E fixture: ${fixture}`);
  else fs.rmSync(fixture, { recursive: true, force: true });
}
