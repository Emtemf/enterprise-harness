import { randomUUID } from 'node:crypto';

const WAIVER_RULES = new Set([
  'RESEARCH_CODEGRAPH_REQUIRED',
  'RESEARCH_CONTEXT7_REQUIRED',
  'TDD_REQUIRED',
  'GENERATED_CODE',
  'CONFIGURATION_NOT_TESTABLE',
  'MIGRATION_EXCEPTION',
]);

const WAIVER_FIELDS = new Set([
  'schemaVersion',
  'waiverId',
  'rule',
  'scope',
  'reason',
  'approvedBy',
  'artifact',
  'createdAt',
]);
const ARTIFACT_FIELDS = new Set(['path', 'digest']);
const DIGEST = /^[a-f0-9]{64}$/u;

function rejectUnknownProperties(value, field, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (unknown) throw new Error(`EH-WAIVER-001: ${field} has unknown property ${unknown}`);
}

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
  rejectUnknownProperties(waiver, 'waiver', WAIVER_FIELDS);
  rejectUnknownProperties(waiver.artifact, 'waiver.artifact', ARTIFACT_FIELDS);
  if (!String(waiver.waiverId || '').trim()) throw new Error('EH-WAIVER-001: waiverId is required');
  if (!WAIVER_RULES.has(waiver.rule)) {
    throw new Error(`EH-WAIVER-001: unsupported waiver rule ${waiver.rule}`);
  }
  if (!String(waiver.scope || '').trim() || !String(waiver.reason || '').trim() || !String(waiver.approvedBy || '').trim()) {
    throw new Error('EH-WAIVER-001: rule, scope, reason and approvedBy are required');
  }
  if (!String(waiver.artifact?.path || '').trim() || !DIGEST.test(waiver.artifact?.digest || '')) {
    throw new Error('EH-WAIVER-001: waiver must bind a sha256 artifact digest');
  }
  if (!waiver.createdAt || !Number.isFinite(Date.parse(waiver.createdAt))) {
    throw new Error('EH-WAIVER-001: createdAt must be an ISO timestamp');
  }
  return true;
}

export function isWaiverFresh(waiver, artifact) {
  validateWaiver(waiver);
  return waiver.artifact.path === artifact?.path && waiver.artifact.digest === artifact?.digest;
}

export function waiverStatus(waiver, artifact) {
  return isWaiverFresh(waiver, artifact) ? 'fresh' : 'stale';
}
