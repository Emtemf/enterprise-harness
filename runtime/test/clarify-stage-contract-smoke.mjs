import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHandoffV2 } from '../core/handoff-v2.mjs';
import { writeClassificationArtifact } from '../core/classification-artifact.mjs';

const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const sourceRoot = fileURLToPath(new URL('../../', import.meta.url));
const finalize = path.join(sourceRoot, 'skills', 'harness', 'scripts', 'finalize-clarify-result.mjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-clarify-stage-'));
const changeId = 'clarify-slice';
const changeDir = path.join(root, 'harness', 'changes', changeId);
const requirementsRef = `harness/changes/${changeId}/requirements.md`;

const requirements = [
  '# Requirements（v6 topology / frontier）',
  '',
  '## 目标与验收',
  '### 原始需求',
  '构建可恢复的订单取消流程。',
  '### 澄清后的目标',
  '支持用户取消订单并获得可验证结果。',
  '### 验收',
  '- R1：取消成功时返回可观察结果。',
  '',
  '## 组件拓扑',
  '| Component | Goal | Scope | Constraints | Acceptance | Business context |',
  '|---|---|---|---|---|---|',
  '| order-service | cancel order | cancellation only | idempotent | R1 | commerce |',
  '',
  '## Frontier（component × unresolved dimension）',
  '| Component | Unresolved dimension | Evidence / known fact | Risk | Next action |',
  '|---|---|---|---|---|',
  '| order-service | none | confirmed | low | resolve |',
  '',
  '## 事实、约束与条件分支',
  '### ResearchPacket',
  '- packet ref: none',
  '- code/document facts: confirmed',
  '- input digest: recorded',
  '- 未确定事实与 fallback: none',
  '### 条件分支',
  '- API/Data：不适用；依据：当前需求无接口或数据变更。',
  '- Architecture：适用；依据：服务边界已确认。',
  '- Rule：不适用；依据：无规则变更。',
  '- Security：不适用；依据：无安全边界变更。',
  '### 非目标与约束',
  '- 非目标：不改支付流程。',
  '- 兼容性：保持现有调用兼容。',
  '- 性能与运行约束：无新增约束。',
  '- 风险与回滚边界：失败时回滚订单状态。',
  '',
  '## Classification',
  '- tier：L1',
  '- impact：architecture',
  '- owning module / service：order-service',
  '- classification evidence：用户确认',
  '',
  '## 未决决策与确认',
  '- unresolved high-risk decision：none',
  '- 当前下一问（一次一个）：none',
  '- 假设及验证方式：none',
  '- confirmed：true',
  '- source：user',
  '- confirmedAt：2026-08-16T00:00:00.000Z',
].join('\n');

try {
  fs.mkdirSync(changeDir, { recursive: true });
  fs.writeFileSync(path.join(root, requirementsRef), requirements);
  const classification = writeClassificationArtifact(root, changeId, {
    tier: 'L1',
    impact: { api: 'no', data: 'no', architecture: 'yes', rule: 'no', security: 'no' },
    owningModule: 'order-service',
    evidence: [requirementsRef],
  });
  const handoff = createHandoffV2(root, {
    changeId,
    stage: 'clarify',
    behavior: 'clarify.confirmed',
    agent: { type: 'enterprise-harness:main', skill: 'harness' },
    inputRefs: [requirementsRef, classification.path],
    tecpc: {
      target: 'confirmed requirements and classification',
      evidence: [requirementsRef, classification.path],
      context: [requirementsRef],
      path: `${requirementsRef} -> ${classification.path}`,
      correction: null,
    },
  });
  const passed = spawnSync(process.execPath, [finalize, changeId, handoff.runId], {
    cwd: root,
    encoding: 'utf-8',
    shell: false,
  });
  assert.equal(passed.status, 0, passed.stderr);
  assert.equal(JSON.parse(passed.stdout).stage, 'clarify');

  fs.writeFileSync(path.join(root, requirementsRef), '# Requirements\n\n## 目标与验收\n');
  const rejected = spawnSync(process.execPath, [finalize, changeId, handoff.runId], {
    cwd: root,
    encoding: 'utf-8',
    shell: false,
  });
  assert.notEqual(rejected.status, 0, 'incomplete clarify artifact must not finalize');
  console.log(`PASS clarify-stage-contract ${mode}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
