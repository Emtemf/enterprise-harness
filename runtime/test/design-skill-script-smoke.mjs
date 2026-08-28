import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { writeClassificationV2Fixture as writeClassificationArtifact } from './classification-v2-fixture.mjs';
import { approvedRequirements } from './clarify-readiness-fixture.mjs';
import { createHandoffV2, v2ResultPath } from '../core/handoff-v2.mjs';

const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const root = fileURLToPath(new URL('../../', import.meta.url));
const prepare = path.join(root, 'skills/design/scripts/prepare-input.mjs');
const finalize = path.join(root, 'skills/design/scripts/finalize-result.mjs');
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'enterprise-harness-design-skill-'));
const changeId = 'design-slice';
const changeDir = path.join(fixture, 'harness', 'changes', changeId);
const requirementsRef = `harness/changes/${changeId}/requirements.md`;
const researchRef = `harness/changes/${changeId}/evidence/research.json`;

function run(script, args) {
  return spawnSync('node', [script, ...args], { cwd: fixture, encoding: 'utf-8' });
}

function markerFor(handoff) {
  return `HANDOFF_INPUT=${path.relative(fixture, handoff.path).split(path.sep).join('/')}`;
}

try {
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: fixture }).status, 0);
  fs.mkdirSync(path.join(changeDir, 'evidence'), { recursive: true });
  fs.writeFileSync(
    path.join(changeDir, 'requirements.md'),
    approvedRequirements().replace(
      '## 事实探索门禁',
      '### 验收\n- R1：用户可创建资源。\n- R2：重复请求保持幂等。\n## 事实探索门禁',
    ),
  );
  const classificationReference = writeClassificationArtifact(fixture, changeId, {
    impact: { api: 'yes', data: 'no', architecture: 'yes', rule: 'no', security: 'yes' },
    decision: { impact: 'bounded' },
  });
  fs.writeFileSync(path.join(changeDir, 'state.json'), JSON.stringify({
    schemaVersion: 6,
    revision: 1,
    changeId,
    lifecycle: 'active',
    stage: 'design',
    artifacts: { classification: classificationReference },
    blocker: null,
    validation: { status: 'missing', digest: null, validatedAt: null },
  }, null, 2));
  fs.writeFileSync(path.join(changeDir, 'design.md'), [
    '# Design',
    '## 目标与验收',
    '- 覆盖 R1。',
    '## 事实与约束',
    '| EID | 来源 | 已确认事实 |',
    '|---|---|---|',
    `| E1 | ${requirementsRef} | 用户可创建资源 |`,
    '## 方案与权衡',
    '### Alternatives',
    '| 方案 | 优点 | 代价/风险 | 结论 |',
    '|---|---|---|---|',
    '| A | reuse service | preserve boundary | selected |',
    '| B | create service | extra deployment cost | rejected |',
    '### Decisions',
    '| DID | Context | Decision | Consequences | Status |',
    '|---|---|---|---|---|',
    '| D1 | E1 | use existing service | keep boundary | accepted |',
    '## Requirement Trace',
    '| Requirement | Decision | Evidence | Verification Obligation | Rollback |',
    '|---|---|---|---|---|',
    '| R1 | D1 | E1 | VO1 | RB1 |',
    '| R2 | D1 | E1 | VO1 | RB1 |',
    '## 架构边界',
    '- controller delegates to service.',
    '## 交互与失败路径',
    '- request -> controller -> service; errors preserve stable contract.',
    '## API 设计',
    '- POST /resources with stable error model.',
    '## 数据与 SQL 设计',
    '- N/A：data impact is no and existing storage is unchanged.',
    '## 安全、并发与可观测性',
    '- authorization and audit event are covered by VO1.',
    '## 可验证性义务',
    '| VOID | Requirement / Decision | 必须可观察的行为 | 主要失败信号 | 后续 Test Design 入口 |',
    '|---|---|---|---|---|',
    '| VO1 | R1 / R2 / D1 | resource is returned and duplicates are idempotent | missing resource or duplicate creation | 由 test-design 映射 TC* |',
    '## 风险、兼容与回滚',
    '| RID | 触发条件 | 回滚动作 | 回滚后验证 |',
    '|---|---|---|---|',
    '| RB1 | error rate rises | revert route | old route passes |',
    '## Design Self-Check',
    '- verdict：pass',
    '- unresolved decisions：none',
    '- downstream findings：none',
  ].join('\n'));
  fs.writeFileSync(path.join(fixture, researchRef), '{"fact":"digest-bound design input"}\n');
  const handoff = createHandoffV2(fixture, {
    changeId,
    stage: 'design',
    behavior: 'produce',
    agent: { type: 'enterprise-harness:artifact-worker', skill: 'design' },
    inputRefs: [
      requirementsRef,
      classificationReference.path,
      researchRef,
    ],
    tecpc: {
      target: 'design artifact',
      evidence: [researchRef],
      context: [requirementsRef, classificationReference.path],
      path: `${requirementsRef} -> harness/changes/${changeId}/design.md`,
      correction: null,
    },
  });

  const pollutedMarker = run(prepare, [markerFor(handoff), 'Produce design.']);
  assert.notEqual(pollutedMarker.status, 0, 'Design prepare must reject every argument beyond the exact marker');
  assert.match(pollutedMarker.stderr, /HANDOFF_INPUT marker is required/u);

  const prepared = run(prepare, [markerFor(handoff)]);
  assert.equal(prepared.status, 0, prepared.stderr);
  const input = JSON.parse(prepared.stdout);
  assert.equal(input.changeId, changeId);
  assert.equal(input.runId, handoff.runId);
  assert.equal(input.handoffPath, markerFor(handoff).slice('HANDOFF_INPUT='.length));
  assert.equal(input.stage, 'design');
  assert.deepEqual(input.inputRefs, handoff.input.inputRefs);
  assert.deepEqual(input.inputDigests, handoff.input.inputDigests);
  assert.deepEqual(input.conditionalReferences.sort(), [
    'references/api-design.md',
    'references/method.md',
    'references/quality-design.md',
  ]);

  const missingMarker = run(prepare, []);
  assert.notEqual(missingMarker.status, 0, 'prepare must bind to the canonical handoff marker');

  const unboundClassification = createHandoffV2(fixture, {
    changeId,
    stage: 'design',
    behavior: 'produce',
    agent: { type: 'enterprise-harness:artifact-worker', skill: 'design' },
    inputRefs: [requirementsRef, researchRef],
    tecpc: {
      target: 'invalid design input',
      evidence: [researchRef],
      context: [requirementsRef],
      path: 'invalid',
      correction: null,
    },
  });
  const unboundPrepared = run(prepare, [markerFor(unboundClassification)]);
  assert.notEqual(unboundPrepared.status, 0);
  assert.match(unboundPrepared.stderr, /classification input must be digest-bound/u);
  const unboundFinalized = run(finalize, [changeId, unboundClassification.runId]);
  assert.notEqual(unboundFinalized.status, 0);
  assert.match(unboundFinalized.stderr, /classification input must be digest-bound/u);

  const outsideMarker = run(prepare, ['HANDOFF_INPUT=../escape/input.json']);
  assert.notEqual(outsideMarker.status, 0);
  assert.match(outsideMarker.stderr, /outside v2 common-dir runs/u);

  const statePath = path.join(changeDir, 'state.json');
  if (process.platform !== 'win32') {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'enterprise-harness-design-outside-'));
    const outsideState = path.join(outside, 'state.json');
    const stateBackup = path.join(changeDir, 'state.backup.json');
    fs.writeFileSync(outsideState, fs.readFileSync(statePath));
    fs.renameSync(statePath, stateBackup);
    fs.symlinkSync(outsideState, statePath);
    const symlinkState = run(prepare, [markerFor(handoff)]);
    assert.notEqual(symlinkState.status, 0);
    assert.match(symlinkState.stderr, /symbolic-link component/u);
    fs.unlinkSync(statePath);
    fs.renameSync(stateBackup, statePath);

    const designPath = path.join(changeDir, 'design.md');
    const designBackup = fs.readFileSync(designPath);
    const outsideDesign = path.join(outside, 'design.md');
    fs.writeFileSync(outsideDesign, designBackup);
    fs.unlinkSync(designPath);
    fs.symlinkSync(outsideDesign, designPath);
    const symlinkDesign = run(finalize, [changeId, handoff.runId]);
    assert.notEqual(symlinkDesign.status, 0);
    assert.match(symlinkDesign.stderr, /symbolic-link component/u);
    fs.unlinkSync(designPath);
    fs.writeFileSync(designPath, designBackup);
    fs.rmSync(outside, { recursive: true, force: true });
  }

  const designState = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
  fs.writeFileSync(statePath, JSON.stringify({ ...designState, stage: 'plan' }, null, 2));
  const rewound = run(finalize, [changeId, handoff.runId]);
  assert.notEqual(rewound.status, 0);
  assert.match(rewound.stderr, /must still be at design stage/u);
  fs.writeFileSync(statePath, JSON.stringify(designState, null, 2));

  const frozenRequirements = fs.readFileSync(path.join(changeDir, 'requirements.md'), 'utf-8');
  fs.appendFileSync(path.join(changeDir, 'requirements.md'), '\n- stale mutation\n');
  const staleInput = run(finalize, [changeId, handoff.runId]);
  assert.notEqual(staleInput.status, 0);
  assert.match(staleInput.stderr, /input digest is stale/u);
  fs.writeFileSync(path.join(changeDir, 'requirements.md'), frozenRequirements);

  const completeDesign = fs.readFileSync(path.join(changeDir, 'design.md'), 'utf-8');
  fs.writeFileSync(path.join(changeDir, 'design.md'), '# Design\n');
  const rejected = run(finalize, [changeId, handoff.runId]);
  assert.notEqual(rejected.status, 0, 'incomplete design must not finalize as pass');
  fs.writeFileSync(path.join(changeDir, 'design.md'), completeDesign);

  const finalized = run(finalize, [input.changeId, input.runId]);
  assert.equal(finalized.status, 0, finalized.stderr);
  const result = JSON.parse(finalized.stdout);
  assert.equal(result.type, 'stage-result');
  assert.equal(result.status, 'pass');
  assert.equal(result.assertions.every((item) => item.verdict === 'pass'), true);
  assert.deepEqual(result.inputDigests, handoff.input.inputDigests);
  const durableResultPath = v2ResultPath(fixture, changeId, handoff.runId);
  assert.equal(fs.existsSync(durableResultPath), true, 'finalizer must persist immutable v2 result');
  assert.deepEqual(JSON.parse(fs.readFileSync(durableResultPath, 'utf-8')), result);
  const duplicateFinalize = run(finalize, [input.changeId, input.runId]);
  assert.notEqual(duplicateFinalize.status, 0, 'finalizer must not overwrite an immutable result');

  console.log(`PASS design-skill-script ${mode}`);
} finally {
  fs.rmSync(fixture, { recursive: true, force: true });
}
