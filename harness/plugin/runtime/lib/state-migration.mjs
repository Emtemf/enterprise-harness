import fs from 'node:fs';
import path from 'node:path';

function inferStageFromState(state) {
  const map = {
    'DRAFT': 'clarify',
    'DISCOVERED': 'clarify',
    'CHANGE_APPROVED': 'route',
    'SPECIFIED': 'design',
    'DESIGN_APPROVED': 'design',
    'TASKED': 'plan',
    'EXECUTING': 'tdd',
    'REVIEWED': 'verify',
    'VALIDATED': 'verify',
    'ARCHIVED': 'archive',
  };
  return map[state] || 'verify';
}

export function migrateStateV1ToV2(data) {
  if (!data || typeof data !== 'object') return data;
  if (data.schemaVersion >= 2) return data;

  data.schemaVersion = 2;

  // workflow.* fields
  if (!data.workflow || typeof data.workflow !== 'object') {
    data.workflow = {
      stage: inferStageFromState(data.state),
      clarifyReady: true,
      userConfirmedScope: true,
      planReady: true,
      tddStatus: 'not-started',
      nextEntry: '/harness',
    };
  }

  // gates.redTask / redEvidenceRef
  if (data.gates && typeof data.gates === 'object') {
    if (data.gates.redVerified === true && (!data.gates.redTask || !data.gates.redEvidenceRef)) {
      // redVerified=true but missing required fields — cannot determine original currentTask,
      // reset to false for safety
      data.gates.redVerified = false;
      data.gates.redTask = null;
      data.gates.redEvidenceRef = null;
    } else {
      if (!('redTask' in data.gates)) data.gates.redTask = null;
      if (!('redEvidenceRef' in data.gates)) data.gates.redEvidenceRef = null;
    }
  }

  return data;
}

export function migrateStateV2ToV3(data) {
  if (!data || typeof data !== 'object') return data;
  if (data.schemaVersion >= 3) return data;

  data.schemaVersion = 3;

  // G4C fields: goal, successCriteria, routingReason (optional, default null/[])
  if (!('goal' in data)) data.goal = null;
  if (!('successCriteria' in data)) data.successCriteria = [];
  if (!('routingReason' in data)) data.routingReason = null;

  return data;
}

export function migrateAndPersist(data, statePath) {
  const before = JSON.stringify(data);
  let migrated = migrateStateV1ToV2(data);
  migrated = migrateStateV2ToV3(migrated);
  const after = JSON.stringify(migrated);
  if (before !== after) {
    try {
      fs.writeFileSync(statePath, JSON.stringify(migrated, null, 2) + '\n', 'utf-8');
    } catch (err) {
      console.error(`Warning: failed to persist state migration to ${statePath}: ${err.message}`);
    }
  }
  return migrated;
}
