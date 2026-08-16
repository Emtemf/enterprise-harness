import fs from 'node:fs';
import path from 'node:path';
import { atomicWriteJson } from './state-store.mjs';
import { ensureRuntimePaths, runtimePaths } from './runtime-paths.mjs';
import { assertSafeId, resolveChild } from './safe-paths.mjs';

const DEFAULT_TTL_MS = 15 * 60 * 1000;

function healthPath(root, sessionId, options = {}) {
  const paths = runtimePaths(root, options);
  const directory = path.join(paths.runtimeRoot, 'hook-health');
  return resolveChild(directory, `${assertSafeId(sessionId, 'sessionId')}.json`, 'sessionId');
}

function validateReceipt(receipt) {
  const problems = [];
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) return ['hook-health receipt must be an object'];
  if (receipt.schemaVersion !== 1) problems.push('schemaVersion must be 1');
  try { assertSafeId(receipt.sessionId, 'sessionId'); } catch (error) { problems.push(error.message); }
  if (receipt.hook !== 'SessionStart') problems.push('hook must be SessionStart');
  if (!String(receipt.controllerRevision || '').trim()) problems.push('controllerRevision is required');
  if (!Number.isFinite(receipt.observedAt)) problems.push('observedAt must be numeric');
  if (!Number.isFinite(receipt.freshUntil) || receipt.freshUntil <= receipt.observedAt) {
    problems.push('freshUntil must be after observedAt');
  }
  if (receipt.status !== 'fresh') problems.push('status must be fresh when recorded');
  return problems;
}

export function recordHookHealth(root, {
  sessionId,
  hook = 'SessionStart',
  controllerRevision = process.env.CLAUDE_PLUGIN_VERSION || 'unknown-controller',
  now = Date.now(),
  ttlMs = DEFAULT_TTL_MS,
} = {}, options = {}) {
  const receipt = Object.freeze({
    schemaVersion: 1,
    sessionId: assertSafeId(sessionId, 'sessionId'),
    hook,
    controllerRevision,
    observedAt: now,
    freshUntil: now + ttlMs,
    status: 'fresh',
  });
  const problems = validateReceipt(receipt);
  if (problems.length > 0) throw new Error(`EH-HOOK-HEALTH-001: ${problems.join('; ')}`);
  const paths = ensureRuntimePaths(root, options);
  fs.mkdirSync(path.join(paths.runtimeRoot, 'hook-health'), { recursive: true, mode: 0o700 });
  atomicWriteJson(healthPath(root, receipt.sessionId, options), receipt);
  return receipt;
}

export function readHookHealth(root, sessionId, options = {}) {
  const file = healthPath(root, sessionId, options);
  if (!fs.existsSync(file)) return null;
  const receipt = JSON.parse(fs.readFileSync(file, 'utf-8'));
  const problems = validateReceipt(receipt);
  if (problems.length > 0) throw new Error(`EH-HOOK-HEALTH-001: ${problems.join('; ')}`);
  return Object.freeze(receipt);
}

export function evaluateHookHealth(root, sessionId, { now = Date.now(), ...options } = {}) {
  let receipt;
  try {
    receipt = readHookHealth(root, sessionId, options);
  } catch (error) {
    return Object.freeze({ ok: false, mode: 'block', reason: `invalid hook-health receipt: ${error.message}`, receipt: null });
  }
  if (!receipt) {
    return Object.freeze({ ok: false, mode: 'block', reason: 'missing SessionStart hook-health receipt', receipt: null });
  }
  if (now >= receipt.freshUntil) {
    return Object.freeze({ ok: false, mode: 'block', reason: 'stale SessionStart hook-health receipt', receipt });
  }
  return Object.freeze({
    ok: true,
    mode: 'enforced',
    reason: 'fresh SessionStart hook-health receipt',
    receipt,
  });
}
