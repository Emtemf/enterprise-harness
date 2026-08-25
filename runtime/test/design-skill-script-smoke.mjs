import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { writeClassificationV2Fixture as writeClassificationArtifact } from './classification-v2-fixture.mjs';
import { createHandoffV2 } from '../core/handoff-v2.mjs';

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

try {
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: fixture }).status, 0);
  fs.mkdirSync(path.join(changeDir, 'evidence'), { recursive: true });
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
  fs.writeFileSync(path.join(changeDir, 'requirements.md'), '# Requirements\n\n## R1\n- 用户可创建资源。\n');
  fs.writeFileSync(path.join(changeDir, 'design.md'), [
    '# Design',
    '## 目标与验收',
    '- 覆盖 R1。',
    '## 事实与约束',
    '- requirements.md',
    '## 决策与证据',
    '- decision: use existing service; evidence: requirements.md',
    '## 架构边界',
    '- controller delegates to service.',
    '## 测试与验证',
    '- node runtime/test/result-contract-smoke.mjs verify',
    '## 风险与回滚',
    '- rollback by reverting the change.',
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

  const prepared = run(prepare, [changeId]);
  assert.equal(prepared.status, 0, prepared.stderr);
  const input = JSON.parse(prepared.stdout);
  assert.equal(input.changeId, changeId);
  assert.equal(input.stage, 'design');
  assert.deepEqual(input.conditionalReferences.sort(), ['references/api-design.md', 'references/method.md']);

  const finalized = run(finalize, [changeId, handoff.runId]);
  assert.equal(finalized.status, 0, finalized.stderr);
  const result = JSON.parse(finalized.stdout);
  assert.equal(result.type, 'stage-result');
  assert.equal(result.status, 'pass');
  assert.equal(result.assertions.every((item) => item.verdict === 'pass'), true);
  assert.deepEqual(result.inputDigests, handoff.input.inputDigests);

  fs.writeFileSync(path.join(changeDir, 'design.md'), '# Design\n');
  const rejected = run(finalize, [changeId, handoff.runId]);
  assert.notEqual(rejected.status, 0, 'incomplete design must not finalize as pass');

  console.log(`PASS design-skill-script ${mode}`);
} finally {
  fs.rmSync(fixture, { recursive: true, force: true });
}
