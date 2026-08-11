import { artifactDependencies } from './artifacts.mjs';

export const CURRENT_STATE_SCHEMA = 5;

export function createStateV5Envelope({ changeId, owner = 'harness-governance', tier = 'L1', topic = null } = {}) {
  if (!changeId) throw new Error('EH-STATE-V5-001: changeId is required');
  return {
    schemaVersion: CURRENT_STATE_SCHEMA,
    revision: 1,
    changeId,
    tier,
    state: 'DRAFT',
    status: 'active',
    lifecycle: 'active',
    owner,
    controller: {
      mode: 'released-controller',
      revision: null,
      subjectRoot: null,
    },
    sessionBinding: null,
    changeLock: null,
    artifacts: {},
    dependencies: artifactDependencies(),
    blocker: null,
    impact: { api: 'unknown', data: 'unknown', architecture: 'unknown', rule: 'unknown' },
    tooling: {
      codegraph: { status: 'unknown', queries: [], fallbackReason: null },
      documentation: { status: 'unknown', libraries: [] },
    },
    decisions: [],
    blockers: [],
    approvals: {},
    gates: { designApproved: false, redVerified: false, redTask: null, redEvidenceRef: null },
    currentTask: null,
    tddEvidence: { worktreeUsed: false, commandExecuted: null, commandOutputSummary: null, evidencePath: null, authority: 'runtime-receipt-only' },
    goal: topic,
    successCriteria: [],
    routingReason: null,
    workflow: {
      stage: 'clarify',
      clarifyReady: false,
      userConfirmedScope: false,
      routeReady: false,
      planReady: false,
      tddStatus: 'not-started',
      nextEntry: '/harness',
    },
    validation: { status: 'missing', digest: null, validatedAt: null },
  };
}

export function isArchiveCompatibleState(state, archived = false) {
  return Boolean(state && archived && Number(state.schemaVersion) === 4);
}

export function assertStateV5(state, options = {}) {
  if (isArchiveCompatibleState(state, options.archived === true)) return true;
  if (Number(state?.schemaVersion) !== CURRENT_STATE_SCHEMA) {
    throw new Error(`EH-STATE-V5-001: active state requires schemaVersion ${CURRENT_STATE_SCHEMA}`);
  }
  if (!state.changeId || state.lifecycle !== 'active') {
    throw new Error('EH-STATE-V5-001: active state requires changeId and lifecycle=active');
  }
  if (!state.artifacts || typeof state.artifacts !== 'object') {
    throw new Error('EH-STATE-V5-001: artifacts map is required');
  }
  if (!state.dependencies || typeof state.dependencies !== 'object') {
    throw new Error('EH-STATE-V5-001: dependency graph is required');
  }
  return true;
}
