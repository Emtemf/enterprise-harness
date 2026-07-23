import fs from 'node:fs';
import path from 'node:path';
import { inferWorkflowStage, inferCurrentGap, recommendNextEntry } from './workflow.mjs';

const STAGES = ['clarify', 'route', 'design', 'plan', 'tdd', 'verify', 'archive'];

const STAGE_ARTIFACTS = {
  clarify: ['requirements.md'],
  route: [], // tier is in state.json, not a file
  design: ['design.md'],
  plan: ['tasks.md'],
  tdd: [],
  verify: ['validation.md'],
  archive: [],
};

const STAGE_LABELS = {
  clarify: 'clarify',
  route: 'route',
  design: 'design',
  plan: 'plan',
  tdd: 'tdd',
  verify: 'verify',
  archive: 'archive',
};

function artifactExists(changeDir, name) {
  return fs.existsSync(path.join(changeDir, name));
}

function stageIsComplete(changeDir, stage, data, currentIdx) {
  const stageIdx = STAGES.indexOf(stage);
  if (stageIdx < 0) return false;

  // Future stages are never complete
  if (stageIdx > currentIdx) return false;

  // Current stage is only "complete" if it has its artifacts
  if (stageIdx === currentIdx) {
    const artifacts = STAGE_ARTIFACTS[stage] || [];
    return artifacts.every((a) => artifactExists(changeDir, a));
  }

  // Past stages: check artifacts exist
  const artifacts = STAGE_ARTIFACTS[stage] || [];
  if (artifacts.length > 0) {
    return artifacts.every((a) => artifactExists(changeDir, a));
  }

  // No file artifacts required → infer from state.json progression
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
 * Render a G4C progress card for a change.
 * Pure function — no side effects beyond reading artifact existence.
 *
 * @param {string} root - projectRoot
 * @param {string} changeId - change identifier
 * @param {object} data - loaded state.json object
 * @returns {string} multi-line G4C card text
 */
export function renderG4CCard(root, changeId, data) {
  const changeDir = path.join(root, 'harness', 'changes', changeId);
  const stage = inferWorkflowStage(changeId, data) || 'clarify';
  const gap = inferCurrentGap(root, changeId, data, stage) || '';
  const nextEntry = recommendNextEntry(stage, data) || '/harness';

  const goal = data.goal || '未记录';
  const criteria = (data.successCriteria && data.successCriteria.length > 0)
    ? data.successCriteria.join(' | ')
    : '未记录';
  const reason = data.routingReason || '未记录';

  const ladder = renderLadder(changeDir, data, stage);

  return [
    `┌─ ${changeId} (${data.tier || '?'}) ─`,
    `│ Goal    ▸ ${goal}`,
    `│ Success ▸ ${criteria}`,
    `│ Choice  ▸ ${reason}`,
    `│ Ladder`,
    ladder,
    `│ Correction ▸ ${gap}`,
    `│ Next     ▸ ${nextEntry}`,
    `└─`,
  ].join('\n');
}
