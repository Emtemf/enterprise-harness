import fs from 'node:fs';
import path from 'node:path';
import { inferWorkflowStage, inferCurrentGap, recommendNextEntry } from './workflow.mjs';

const V6_STAGES = ['clarify', 'design', 'plan', 'implement', 'verify', 'archive'];
const V5_STAGES = ['clarify', 'classify', 'design', 'plan', 'tdd', 'verify', 'archive'];

const STAGE_ARTIFACTS = {
  clarify: ['requirements.md'],
  design: ['design.md'],
  plan: ['tasks.md'],
  implement: [],
  verify: ['validation.md'],
  archive: [],
};

function artifactExists(changeDir, name) {
  return fs.existsSync(path.join(changeDir, name));
}

function stageIsComplete(changeDir, stage, data, currentIdx, stages) {
  const stageIdx = stages.indexOf(stage);
  if (stageIdx < 0) return false;
  if (stageIdx > currentIdx) return false;
  if (stageIdx === currentIdx) {
    const artifacts = STAGE_ARTIFACTS[stage] || [];
    return artifacts.every((a) => artifactExists(changeDir, a));
  }
  const artifacts = STAGE_ARTIFACTS[stage] || [];
  if (artifacts.length > 0) {
    return artifacts.every((a) => artifactExists(changeDir, a));
  }
  switch (stage) {
    case 'implement':
      return Boolean(String(data.currentTask || '').trim());
    default:
      return true;
  }
}

function renderLadder(changeDir, data, currentStage, blockedStages = []) {
  const stages = data.schemaVersion === 6 ? V6_STAGES : V5_STAGES;
  const currentIdx = stages.indexOf(currentStage);
  if (currentIdx < 0) return '';
  const blocked = new Set(blockedStages);

  const lines = [];
  for (const stage of stages) {
    const complete = stageIsComplete(changeDir, stage, data, currentIdx, stages);
    const isCurrent = stage === currentStage;
    let marker;
    if (blocked.has(stage)) {
      marker = '✗';
    } else if (isCurrent) {
      marker = '▸';
    } else if (complete) {
      marker = '✓';
    } else {
      marker = '○';
    }
    lines.push(`  ${marker} ${stage}`);
  }
  return lines.join('\n');
}

/**
 * Render a TECPC (闭环五检) progress card for a change.
 * T = Target, E = Evidence, C = Context, P = Path, C = Correction
 *
 * @param {string} root - projectRoot
 * @param {string} changeId - change identifier
 * @param {object} data - loaded state.json object
 * @returns {string} multi-line TECPC card text
 */
export function renderTECPCCard(root, changeId, data, options = {}) {
  const changeDir = path.join(root, 'harness', 'changes', changeId);
  const workflowResult = options.workflowResult ?? null;
  const stage = workflowResult?.stage || inferWorkflowStage(changeId, data) || 'clarify';
  const gap = workflowResult?.currentGap || inferCurrentGap(root, changeId, data, stage) || '';
  const nextEntry = workflowResult?.nextAction || recommendNextEntry(stage, data) || '/harness';

  const target = data.goal || '未记录';
  const reason = data.routingReason || '未记录';
  const ladder = renderLadder(changeDir, data, stage, workflowResult?.audit?.blockedStages);

  return [
    `┌─ ${changeId} (${data.tier || '?'}) ─`,
    `│ T 目标    ▸ ${target}`,
    `│ E 证据    ▸ ${renderEvidenceSummary(data, workflowResult)}`,
    `│ C 上下文  ▸ ${gap}`,
    `│ P 路径    ▸ ${reason}`,
    `│ C 纠正    ▸ ${nextEntry}`,
    `│ Ladder`,
    ladder,
    `└─`,
  ].join('\n');
}

// Backward-compatible alias; new code should use renderTECPCCard.
export const renderTECPCard = renderTECPCCard;

function renderEvidenceSummary(data, workflowResult = null) {
  if (workflowResult?.audit?.verdict === 'block') {
    return `audit BLOCK (${workflowResult.audit.blockerCount ?? '?'} blocker(s))`;
  }
  const parts = [];
  if (data.validation?.status === 'fresh') parts.push('validation fresh');
  if (data.schemaVersion !== 6) {
    if (data.gates?.designApproved) parts.push('design approved');
    if (data.gates?.redVerified) parts.push('RED verified');
    if (data.workflow?.tddStatus && data.workflow.tddStatus !== 'not-started') {
      parts.push(`TDD: ${data.workflow.tddStatus}`);
    }
  } else {
    if (data.classification?.tier) parts.push(`tier: ${data.classification.tier}`);
    if (data.artifacts && Object.values(data.artifacts).some((a) => a?.digest)) parts.push('artifacts present');
  }
  return parts.length > 0 ? parts.join(' | ') : '尚无证据';
}
