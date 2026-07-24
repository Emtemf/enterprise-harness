import fs from 'node:fs';
import path from 'node:path';
import { inferWorkflowStage, inferCurrentGap, recommendNextEntry } from './workflow.mjs';

const STAGES = ['clarify', 'route', 'design', 'plan', 'tdd', 'verify', 'archive'];

const STAGE_ARTIFACTS = {
  clarify: ['requirements.md'],
  route: [],
  design: ['design.md'],
  plan: ['tasks.md'],
  tdd: [],
  verify: ['validation.md'],
  archive: [],
};

function artifactExists(changeDir, name) {
  return fs.existsSync(path.join(changeDir, name));
}

function stageIsComplete(changeDir, stage, data, currentIdx) {
  const stageIdx = STAGES.indexOf(stage);
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
    case 'route':
      return data.tier && ['L0', 'L1', 'L2', 'L3'].includes(data.tier);
    case 'tdd':
      return data.workflow?.tddStatus === 'refactor-verified';
    default:
      return true;
  }
}

function renderLadder(changeDir, data, currentStage) {
  const currentIdx = STAGES.indexOf(currentStage);
  if (currentIdx < 0) return '';

  const lines = [];
  for (const stage of STAGES) {
    const complete = stageIsComplete(changeDir, stage, data, currentIdx);
    const isCurrent = stage === currentStage;
    let marker;
    if (isCurrent) {
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
 * Render a TECP (闭环五检) progress card for a change.
 * T = Target, C = Context, E = Evidence, P = Path (选择 + 纠正)
 *
 * @param {string} root - projectRoot
 * @param {string} changeId - change identifier
 * @param {object} data - loaded state.json object
 * @returns {string} multi-line TECP card text
 */
export function renderTECPCard(root, changeId, data) {
  const changeDir = path.join(root, 'harness', 'changes', changeId);
  const stage = inferWorkflowStage(changeId, data) || 'clarify';
  const gap = inferCurrentGap(root, changeId, data, stage) || '';
  const nextEntry = recommendNextEntry(stage, data) || '/harness';

  const target = data.goal || '未记录';
  const reason = data.routingReason || '未记录';
  const ladder = renderLadder(changeDir, data, stage);

  return [
    `┌─ ${changeId} (${data.tier || '?'}) ─`,
    `│ T 目标    ▸ ${target}`,
    `│ C 上下文  ▸ ${gap}`,
    `│ E 证据    ▸ ${renderEvidenceSummary(data)}`,
    `│ P 路径    ▸ ${reason}`,
    `│ P 纠正    ▸ ${nextEntry}`,
    `│ Ladder`,
    ladder,
    `└─`,
  ].join('\n');
}

function renderEvidenceSummary(data) {
  const parts = [];
  if (data.validation?.status === 'fresh') parts.push('validation fresh');
  if (data.gates?.designApproved) parts.push('design approved');
  if (data.gates?.redVerified) parts.push('RED verified');
  if (data.workflow?.tddStatus && data.workflow.tddStatus !== 'not-started') {
    parts.push(`TDD: ${data.workflow.tddStatus}`);
  }
  return parts.length > 0 ? parts.join(' | ') : '尚无证据';
}

