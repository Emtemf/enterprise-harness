import fs from 'node:fs';
import path from 'node:path';
import { migrateAndPersist } from './state-migration.mjs';

export function loadActiveChange(root) {
  const activeFile = path.join(root, 'harness', 'ACTIVE_CHANGE');
  if (!fs.existsSync(activeFile)) {
    return { ok: false, reason: 'missing-active-change' };
  }
  const changeId = fs.readFileSync(activeFile, 'utf-8').trim();
  if (!changeId) return { ok: false, reason: 'empty-active-change' };
  const statePath = path.join(root, 'harness', 'changes', changeId, 'state.json');
  if (!fs.existsSync(statePath)) return { ok: false, reason: 'missing-state', changeId, statePath };
  let data = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
  data = migrateAndPersist(data, statePath);
  return { ok: true, changeId, statePath, data };
}

export const GOVERNANCE_BLOCKLIST = new Set(['target', 'build', 'node_modules', '.git', 'dist', 'out']);
const MAIN_PATTERN = ['src', 'main', 'java'];
const TEST_PATTERN = ['src', 'test', 'java'];

function findSubsequence(segments, pattern) {
  for (let i = 0; i <= segments.length - pattern.length; i++) {
    if (pattern.every((part, j) => segments[i + j] === part)) return i;
  }
  return -1;
}

// Detects whether `target` falls under a Java-convention governed root (src/main/java,
// src/test/java, or an openapi contract directory) anywhere in the project tree, without
// scanning the filesystem. The blocklist only applies to ancestor segments (before the
// matched pattern) so that generated/vendor directories are excluded while business package
// names that happen to contain a blocklisted word (e.g. "target") are not misjudged.
function detectGovernedKind(root, target) {
  const rel = path.relative(root, target);
  if (rel.startsWith('..')) return null;
  const segments = rel.split(path.sep);

  const mainIdx = findSubsequence(segments, MAIN_PATTERN);
  const testIdx = findSubsequence(segments, TEST_PATTERN);
  const openapiIdx = segments.indexOf('openapi');

  const candidates = [];
  if (mainIdx !== -1) candidates.push({ kind: 'main', start: mainIdx, end: mainIdx + MAIN_PATTERN.length });
  if (testIdx !== -1) candidates.push({ kind: 'test', start: testIdx, end: testIdx + TEST_PATTERN.length });
  if (openapiIdx !== -1) candidates.push({ kind: 'openapi', start: openapiIdx, end: openapiIdx + 1 });
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => a.start - b.start);
  const match = candidates[0];

  const ancestors = segments.slice(0, match.start);
  if (ancestors.some((segment) => GOVERNANCE_BLOCKLIST.has(segment))) return null;

  return { kind: match.kind, dir: path.join(root, ...segments.slice(0, match.end)) };
}

export function isGovernedTarget(root, target) {
  const result = detectGovernedKind(root, target);
  return result ? result.dir : null;
}

export function requiredGateForTarget(root, target) {
  const result = detectGovernedKind(root, target);
  if (!result) return null;
  if (result.kind === 'test') return { needsDesignApproved: true, needsRedVerified: false };
  return { needsDesignApproved: true, needsRedVerified: true };
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
