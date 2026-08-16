import fs from 'node:fs';
import path from 'node:path';
import { atomicWriteJson } from '../lib/state-store.mjs';
import { validateV6State } from '../core/change-state.mjs';
import { writeClassificationArtifact } from '../core/classification-artifact.mjs';

function readJson(statePath) {
  return JSON.parse(fs.readFileSync(statePath, 'utf-8'));
}

function projectRootForState(statePath, changeId) {
  const changeDir = path.dirname(statePath);
  const changesDir = path.dirname(changeDir);
  const harnessDir = path.dirname(changesDir);
  if (path.basename(changeDir) !== changeId
    || path.basename(changesDir) !== 'changes'
    || path.basename(harnessDir) !== 'harness') {
    throw new Error('EH-V5-MIGRATE-023: state path must be harness/changes/<changeId>/state.json');
  }
  return path.dirname(harnessDir);
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
  const classification = {
    impact: {
      api: impact.api || 'unknown',
      data: impact.data || 'unknown',
      architecture: impact.architecture || 'unknown',
      rule: impact.rule || 'unknown',
      security: impact.security || 'unknown',
    },
    ...(source.classification && typeof source.classification === 'object'
      ? { decision: { ...source.classification } }
      : {}),
  };
  const root = projectRootForState(statePath, source.changeId);
  const classificationReference = writeClassificationArtifact(root, source.changeId, classification);
  const next = {
    schemaVersion: 6,
    revision: 1,
    changeId: source.changeId,
    lifecycle: 'active',
    stage: stageForLegacyState(source),
    artifacts: { classification: classificationReference },
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
