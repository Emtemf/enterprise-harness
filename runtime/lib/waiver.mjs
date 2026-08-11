import { randomUUID } from 'node:crypto';

const WAIVER_RULES = new Set([
  'RESEARCH_CODEGRAPH_REQUIRED',
  'RESEARCH_CONTEXT7_REQUIRED',
  'TDD_REQUIRED',
  'GENERATED_CODE',
  'CONFIGURATION_NOT_TESTABLE',
  'MIGRATION_EXCEPTION',
]);

export function createWaiver(input = {}) {
  const waiver = {
    schemaVersion: 1,
    waiverId: input.waiverId || randomUUID(),
    rule: input.rule,
    scope: input.scope,
    reason: String(input.reason || '').trim(),
    approvedBy: String(input.approvedBy || '').trim(),
    artifact: {
      path: String(input.artifact?.path || ''),
      digest: String(input.artifact?.digest || ''),
    },
    createdAt: input.createdAt || new Date().toISOString(),
  };
  validateWaiver(waiver);
  return Object.freeze(waiver);
}

export function validateWaiver(waiver) {
  if (!waiver || waiver.schemaVersion !== 1) {
    throw new Error('EH-WAIVER-001: unsupported waiver schemaVersion');
  }
  if (!WAIVER_RULES.has(waiver.rule)) {
    throw new Error(`EH-WAIVER-001: unsupported waiver rule ${waiver.rule}`);
  }
  if (!waiver.scope || !waiver.reason || !waiver.approvedBy) {
    throw new Error('EH-WAIVER-001: rule, scope, reason and approvedBy are required');
  }
  if (!waiver.artifact?.path || !waiver.artifact?.digest) {
    throw new Error('EH-WAIVER-001: waiver must bind an artifact digest');
  }
  if (!waiver.createdAt) throw new Error('EH-WAIVER-001: createdAt is required');
  return true;
}

export function isWaiverFresh(waiver, artifact) {
  validateWaiver(waiver);
  return waiver.artifact.path === artifact?.path && waiver.artifact.digest === artifact?.digest;
}

export function waiverStatus(waiver, artifact) {
  return isWaiverFresh(waiver, artifact) ? 'fresh' : 'stale';
}
