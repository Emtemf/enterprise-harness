import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { appendJsonLineOnce, withFileLock } from './state-store.mjs';
import { sessionIdFromEnv, readSession } from './sessions.mjs';
import { assertSafeId, resolveChild, resolveWithin } from './safe-paths.mjs';

export const V6_CAPABILITY_AGENT_TYPES = new Set([
  'code-explore',
  'doc-research',
  'artifact-worker',
  'test-design-worker',
  'implementer',
  'reviewer',
]);

export const V5_COMPATIBILITY_AGENT_TYPES = new Set([
  'clarify-synthesizer',
  'route-decider',
  'design-executor',
  'plan-executor',
  'clarify-reviewer',
  'requirement-reviewer',
  'design-reviewer',
  'plan-critic',
  'tdd-executor',
  'implementation-reviewer',
  'verification-executor',
  'api-consistency-reviewer',
  'verification-reviewer',
]);

export const PLUGIN_AGENT_TYPES = new Set([
  ...V6_CAPABILITY_AGENT_TYPES,
  ...V5_COMPATIBILITY_AGENT_TYPES,
]);

export function normalizeAgentType(value) {
  const raw = String(value || '').trim();
  if (PLUGIN_AGENT_TYPES.has(raw)) return `enterprise-harness:${raw}`;
  return raw;
}

export function isV6CapabilityAgentType(value) {
  const normalized = normalizeAgentType(value);
  return normalized.startsWith('enterprise-harness:')
    && V6_CAPABILITY_AGENT_TYPES.has(normalized.slice('enterprise-harness:'.length));
}

export function isHarnessAgentType(value) {
  const normalized = normalizeAgentType(value);
  return normalized.startsWith('enterprise-harness:')
    && PLUGIN_AGENT_TYPES.has(normalized.slice('enterprise-harness:'.length));
}

export function sha256(value) {
  return crypto.createHash('sha256').update(value ?? '').digest('hex');
}

export function gitCommonDir(root) {
  const result = spawnSync('git', ['rev-parse', '--git-common-dir'], {
    cwd: root,
    encoding: 'utf-8',
    shell: false,
  });
  if (result.status !== 0) return path.join(root, '.git');
  return path.resolve(root, result.stdout.trim());
}

export function receiptSpoolPath(root, changeId) {
  const safeChangeId = assertSafeId(changeId, 'changeId');
  const receiptsRoot = path.join(
    gitCommonDir(root),
    'enterprise-harness',
    'receipts',
  );
  const changeReceipts = resolveChild(receiptsRoot, safeChangeId, 'changeId');
  return resolveWithin(changeReceipts, 'agent-events.jsonl', 'receiptPath');
}

export function activeChangeId(root, options = {}) {
  const sessionId = options.sessionId || sessionIdFromEnv(options.env || process.env);
  if (sessionId) return readSession(root, sessionId, options)?.changeId || null;
  const activePath = path.join(root, 'harness', 'ACTIVE_CHANGE');
  if (!fs.existsSync(activePath)) return null;
  const value = fs.readFileSync(activePath, 'utf-8').trim();
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value) ? value : null;
}

export function appendAgentEvent(root, changeId, event) {
  if (!changeId) return null;
  const target = receiptSpoolPath(root, changeId);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const record = {
    receiptVersion: 1,
    eventId: event.eventId || `agent_${crypto.randomUUID()}`,
    changeId,
    sessionId: event.sessionId || null,
    toolUseId: event.toolUseId || null,
    agentId: event.agentId || null,
    requestedAgentType: event.requestedAgentType || null,
    observedAgentType: event.observedAgentType || null,
    cwd: path.resolve(event.cwd || root),
    commandDigest: event.commandDigest || null,
    transcriptDigest: event.transcriptDigest || null,
    runId: event.runId || null,
    behavior: event.behavior || null,
    handoffRole: event.handoffRole || null,
    handoffPath: event.handoffPath || null,
    parentRunId: event.parentRunId || null,
    issuedAt: event.issuedAt || new Date().toISOString(),
    ...event,
  };
  withFileLock(target, () => appendJsonLineOnce(target, record));
  return record;
}

export function readAgentEvents(root, changeId) {
  const target = receiptSpoolPath(root, changeId);
  if (!fs.existsSync(target)) return [];
  return fs.readFileSync(target, 'utf-8')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try { return JSON.parse(line); } catch { return { kind: 'invalid-json', raw: line }; }
    });
}

export function activeHandoffAgentBinding(root, changeId, input, { agentId, sessionId } = {}) {
  if (!agentId || !sessionId) return null;
  const expectedType = normalizeAgentType(input?.agent?.type);
  const expectedParent = input?.parentRunId ?? null;
  const events = readAgentEvents(root, changeId);
  const dispatch = [...events].reverse().find((event) => (
    event.kind === 'dispatch'
    && event.runId === input?.runId
    && event.sessionId === sessionId
    && event.requestedAgentType === expectedType
    && event.handoffRole === input?.role
    && (event.parentRunId ?? null) === expectedParent
  ));
  const start = [...events].reverse().find((event) => (
    event.kind === 'start'
    && event.agentId === agentId
    && event.sessionId === sessionId
    && event.observedAgentType === expectedType
  ));
  const laterStop = start && events.find((event) => (
    event.kind === 'stop'
    && event.agentId === agentId
    && Date.parse(event.issuedAt) >= Date.parse(start.issuedAt)
  ));
  return dispatch && start && !laterStop ? { agentId, sessionId, dispatch, start } : null;
}

export function trustedHandoffAgentBindings(root, changeId, input) {
  const expectedType = normalizeAgentType(input?.agent?.type);
  const expectedParent = input?.parentRunId ?? null;
  const events = readAgentEvents(root, changeId);
  const bindings = events.filter((event) => (
    event.kind === 'dispatch-binding'
    && event.runId === input?.runId
    && event.requestedAgentType === expectedType
    && event.handoffRole === input?.role
    && event.agentId
    && event.sessionId
    && event.toolUseId
  ));
  if (bindings.length > 0) {
    return bindings.flatMap((binding) => {
      const dispatch = events.find((event) => (
        event.kind === 'dispatch'
        && event.runId === input.runId
        && event.toolUseId === binding.toolUseId
        && event.sessionId === binding.sessionId
        && event.requestedAgentType === expectedType
        && event.handoffRole === input.role
        && (event.parentRunId ?? null) === expectedParent
      ));
      const start = events.find((event) => (
        event.kind === 'start'
        && event.agentId === binding.agentId
        && event.sessionId === binding.sessionId
        && event.observedAgentType === expectedType
      ));
      const stop = events.find((event) => (
        event.kind === 'stop'
        && event.runId === input.runId
        && event.agentId === binding.agentId
        && event.sessionId === binding.sessionId
        && event.observedAgentType === expectedType
        && event.handoffRole === input.role
        && (event.parentRunId ?? null) === expectedParent
      ));
      return dispatch && start && stop
        ? [{ agentId: binding.agentId, sessionId: binding.sessionId, dispatch, start, stop, binding }]
        : [];
    });
  }

  const dispatch = [...events].reverse().find((event) => (
    event.kind === 'dispatch'
    && event.runId === input?.runId
    && event.requestedAgentType === expectedType
    && event.handoffRole === input?.role
    && (event.parentRunId ?? null) === expectedParent
  ));
  if (!dispatch) return [];
  const start = [...events].reverse().find((event) => (
    event.kind === 'start'
    && event.sessionId === dispatch.sessionId
    && event.observedAgentType === expectedType
  ));
  const stop = [...events].reverse().find((event) => (
    event.kind === 'stop'
    && event.runId === input.runId
    && event.sessionId === dispatch.sessionId
    && event.observedAgentType === expectedType
    && event.handoffRole === input.role
    && (event.parentRunId ?? null) === expectedParent
  ));
  return dispatch && start && stop
    ? [{ agentId: start.agentId, sessionId: dispatch.sessionId, dispatch, start, stop, binding: null }]
    : [];
}

export function boundHarnessAgent(root, changeId, agentId, expectedType = null) {
  const normalizedExpected = expectedType ? normalizeAgentType(expectedType) : null;
  const events = readAgentEvents(root, changeId);
  const binding = [...events].reverse().find((event) => (
    event.kind === 'dispatch-binding'
    && event.agentId === agentId
    && (!normalizedExpected || event.requestedAgentType === normalizedExpected)
  ));
  const start = [...events].reverse().find((event) => (
    event.kind === 'start'
    && event.agentId === agentId
    && (!normalizedExpected || event.observedAgentType === normalizedExpected)
  ));
  const stop = [...events].reverse().find((event) => event.kind === 'stop' && event.agentId === agentId);
  return binding && start && (!stop || Date.parse(stop.issuedAt) < Date.parse(start.issuedAt))
    ? { binding, start }
    : null;
}

export function startedHarnessAgent(root, changeId, agentId, expectedType = null) {
  const normalizedExpected = expectedType ? normalizeAgentType(expectedType) : null;
  const events = readAgentEvents(root, changeId);
  const start = [...events].reverse().find((event) => (
    event.kind === 'start'
    && event.agentId === agentId
    && (!normalizedExpected || event.observedAgentType === normalizedExpected)
  ));
  if (!start) return null;
  const laterStop = events.find((event) => (
    event.kind === 'stop'
    && event.agentId === agentId
    && Date.parse(event.issuedAt) >= Date.parse(start.issuedAt)
  ));
  return laterStop ? null : start;
}

export function completedHarnessAgent(root, changeId, agentId, expectedType = null) {
  const normalizedExpected = expectedType ? normalizeAgentType(expectedType) : null;
  const events = readAgentEvents(root, changeId);
  const start = events.find((event) => (
    event.kind === 'start'
    && event.agentId === agentId
    && (!normalizedExpected || event.observedAgentType === normalizedExpected)
  ));
  const binding = events.find((event) => (
    event.kind === 'dispatch-binding'
    && event.agentId === agentId
    && (!normalizedExpected || event.requestedAgentType === normalizedExpected)
  ));
  const stop = events.find((event) => (
    event.kind === 'stop'
    && event.agentId === agentId
    && (!normalizedExpected || event.observedAgentType === normalizedExpected)
    && (!start || Date.parse(event.issuedAt) >= Date.parse(start.issuedAt))
  ));
  return start && binding && stop ? { start, binding, stop } : null;
}
