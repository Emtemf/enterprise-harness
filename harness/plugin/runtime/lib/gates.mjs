import fs from 'node:fs';
import path from 'node:path';

export function loadActiveChange(root) {
  const activeFile = path.join(root, 'harness', 'ACTIVE_CHANGE');
  if (!fs.existsSync(activeFile)) {
    return { ok: false, reason: 'missing-active-change' };
  }
  const changeId = fs.readFileSync(activeFile, 'utf-8').trim();
  if (!changeId) return { ok: false, reason: 'empty-active-change' };
  const statePath = path.join(root, 'harness', 'changes', changeId, 'state.json');
  if (!fs.existsSync(statePath)) return { ok: false, reason: 'missing-state', changeId, statePath };
  const data = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
  return { ok: true, changeId, statePath, data };
}

export function isGovernedTarget(root, target) {
  const governed = [
    path.resolve(path.join(root, 'reference-service', 'src', 'main')),
    path.resolve(path.join(root, 'reference-service', 'src', 'test')),
    path.resolve(path.join(root, 'reference-service', 'openapi')),
  ];
  return governed.find((dir) => target === dir || target.startsWith(dir + path.sep)) || null;
}

export function requiredGateForTarget(root, target) {
  const mainDir = path.resolve(path.join(root, 'reference-service', 'src', 'main'));
  const openapiDir = path.resolve(path.join(root, 'reference-service', 'openapi'));
  const testDir = path.resolve(path.join(root, 'reference-service', 'src', 'test'));
  if (target === mainDir || target.startsWith(mainDir + path.sep) || target === openapiDir || target.startsWith(openapiDir + path.sep)) {
    return { needsDesignApproved: true, needsRedVerified: true };
  }
  if (target === testDir || target.startsWith(testDir + path.sep)) {
    return { needsDesignApproved: true, needsRedVerified: false };
  }
  return null;
}

export function hasCurrentTaskRedVerification(state) {
  const currentTask = typeof state?.currentTask === 'string' ? state.currentTask.trim() : '';
  const gates = state?.gates || {};
  return Boolean(
    gates.redVerified
    && currentTask
    && gates.redTask === currentTask
    && typeof gates.redEvidenceRef === 'string'
    && gates.redEvidenceRef.trim().length > 0
  );
}
