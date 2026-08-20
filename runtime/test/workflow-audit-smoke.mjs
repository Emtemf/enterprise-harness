// workflow audit v6 必须验证 state、artifact、result gate 证据，并在 invalid stage 或
// 缺少 StageResult 时 block。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { auditWorkflow } from '../lib/workflow-audit.mjs';

const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) {
  console.error('Usage: node runtime/test/workflow-audit-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-audit-'));
const changeId = 'audit-smoke';
const changeDir = path.join(root, 'harness', 'changes', changeId);

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

try {
  fs.mkdirSync(changeDir, { recursive: true });
  fs.writeFileSync(path.join(changeDir, 'requirements.md'), '# Requirements\n', 'utf-8');

  const state = {
    schemaVersion: 6,
    revision: 1,
    changeId,
    lifecycle: 'active',
    stage: 'clarify',
    artifacts: {
      classification: { tier: 'L1', impact: { api: false, data: false, architecture: false, security: false }, digest: 'abc123' },
    },
    validation: { status: 'missing', digest: null, validatedAt: null },
  };
  fs.writeFileSync(path.join(changeDir, 'state.json'), JSON.stringify(state, null, 2), 'utf-8');

  // 不能把未知 stage 视作所有阶段都尚未开始，然后错误返回 PASS。
  const invalidStageAudit = auditWorkflow(root, changeId, { ...state, stage: 'bogus' });
  if (invalidStageAudit.verdict !== 'block' || !invalidStageAudit.blockers.some((item) => item.code === 'EH-AUDIT-STATE-005')) {
    fail(`Expected invalid workflow stage to block audit, got ${invalidStageAudit.verdict}: ${JSON.stringify(invalidStageAudit.blockers)}`);
  }

  // 缺少 requirements.md 必须 block
  fs.rmSync(path.join(changeDir, 'requirements.md'));
  const noReqsAudit = auditWorkflow(root, changeId, state);
  const clarifyStage = noReqsAudit.stages.find((s) => s.stage === 'clarify');
  if (!clarifyStage || clarifyStage.status !== 'block') {
    fail(`Expected clarify stage to block without requirements.md, got ${clarifyStage?.status}`);
  }

  if (process.exitCode !== 1) console.log('Workflow audit v6 smoke passed (invalid stage BLOCK; missing artifact BLOCK).');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
