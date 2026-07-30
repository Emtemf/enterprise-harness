import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { appendJsonLineOnce, withFileLock } from './state-store.mjs';

export const PLUGIN_AGENT_TYPES = new Set([
  'code-explore',
  'doc-research',
  'clarify-synthesizer',
  'design-executor',
  'plan-executor',
  'requirement-reviewer',
  'design-reviewer',
  'plan-critic',
  'tdd-executor',
  'implementation-reviewer',
  'verification-executor',
  'api-consistency-reviewer',
  'verification-reviewer',
]);

export function normalizeAgentType(value) {
  const raw = String(value || '').trim();
  if (PLUGIN_AGENT_TYPES.has(raw)) return `enterprise-harness:${raw}`;
  return raw;
}

export function isHarnessAgentType(value) {
  const normalized = normalizeAgentType(value);
  return normalized.startsWith('enterprise-harness:')
    && PLUGIN_AGENT_TYPES.has(normalized.slice('enterprise-harness:'.length));
}

export function isKnownBareAgentType(value) {
  return PLUGIN_AGENT_TYPES.has(String(value || '').trim());
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
  return path.join(
    gitCommonDir(root),
    'enterprise-harness',
    'receipts',
    changeId,
    'agent-events.jsonl',
  );
}

export function activeChangeId(root) {
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
