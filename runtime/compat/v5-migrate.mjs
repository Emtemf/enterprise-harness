import fs from 'node:fs';
import { atomicWriteJson } from '../lib/state-store.mjs';
import { validateV6State } from '../core/change-state.mjs';

function readJson(statePath) {
  return JSON.parse(fs.readFileSync(statePath, 'utf-8'));
}

function stageForLegacyState(state) {
  const legacyStage = state.workflow?.stage;
  if (legacyStage === 'tdd') return 'implement';
  if (legacyStage === 'route') return 'design';
  if (['clarify', 'design', 'plan', 'verify', 'archive'].includes(legacyStage)) return legacyStage;
  if (state.state === 'ARCHIVED') return 'archive';
  if (state.state === 'VALIDATED' || state.state === 'REVIEWED') return 'verify';
  if (state.state === 'EXECUTING') return 'implement';
  if (state.state === 'TASKED' || state.state === 'PLANNED') return 'plan';
  if (state.state === 'DESIGNED' || state.state === 'DESIGN_APPROVED') return 'design';
  return 'clarify';
}

export function migrateV5State(statePath, { confirm = false } = {}) {
  if (!confirm) throw new Error('EH-V5-MIGRATE-CONFIRM-019: active v5 changes require explicit confirmation before migration');
  const source = readJson(statePath);
  if (source.schemaVersion !== 5) throw new Error(`EH-V5-MIGRATE-020: expected schema v5, got v${source.schemaVersion}`);
  if (source.lifecycle && source.lifecycle !== 'active') {
    throw new Error('EH-V5-MIGRATE-021: only active changes may migrate; archived history is read-only');
  }
  const impact = source.impact || {};
  const next = {
    schemaVersion: 6,
    revision: 1,
    changeId: source.changeId,
    lifecycle: 'active',
    stage: stageForLegacyState(source),
    impact: {
      api: impact.api || 'unknown',
      data: impact.data || 'unknown',
      architecture: impact.architecture || 'unknown',
      rule: impact.rule || 'unknown',
      security: impact.security || 'unknown',
    },
    artifacts: {},
    validation: { status: 'stale', digest: null, validatedAt: null },
    migration: {
      sourceSchemaVersion: 5,
      sourceRevision: Number.isInteger(source.revision) ? source.revision : 1,
    },
  };
  const problems = validateV6State(next);
  if (problems.length > 0) throw new Error(`EH-V5-MIGRATE-022: ${problems.join('; ')}`);
  atomicWriteJson(statePath, next);
  return next;
}
