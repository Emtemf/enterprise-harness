import fs from 'node:fs';
import path from 'node:path';
import { migrateAndPersist } from './state-migration.mjs';
import { readSession, sessionIdFromEnv, isSessionLeaseExpired } from './sessions.mjs';
import { loadProjectProfile } from './project-profile.mjs';
import { runtimePaths } from './runtime-paths.mjs';

export function loadActiveChange(root, options = {}) {
  const sessionId = options.sessionId
    ? sessionIdFromEnv({ ENTERPRISE_HARNESS_SESSION_ID: options.sessionId })
    : sessionIdFromEnv(options.env || process.env);
  if (sessionId) {
    const binding = readSession(root, sessionId, options);
    if (!binding) {
      const bindingPath = runtimePaths(root, options).sessionPath(sessionId);
      if (pathEntryExists(bindingPath)) {
        return {
          ok: false,
          reason: 'invalid-session-binding',
          errorCode: 'EH-SESSION-BINDING-024',
          sessionId,
          bindingPath,
        };
      }
      return { ok: false, reason: 'missing-session-binding', sessionId };
    }
    if (isSessionLeaseExpired(binding)) {
      return {
        ok: false,
        reason: 'expired-session-lease',
        errorCode: 'EH-SESSION-LEASE-023',
        sessionId,
        changeId: binding.changeId,
      };
    }
    const currentRoot = canonicalPath(root);
    const bindingRoot = canonicalPath(binding.worktreePath);
    const subjectRoot = canonicalPath(binding.subjectRoot || binding.worktreePath);
    if (currentRoot !== bindingRoot && currentRoot !== subjectRoot) {
      if (options.allowBoundWorktree !== true) {
        return {
          ok: false,
          reason: 'session-worktree-mismatch',
          errorCode: 'EH-SESSION-WORKTREE-001',
          sessionId,
          worktreePath: binding.worktreePath,
          subjectRoot: binding.subjectRoot || null,
        };
      }
      return loadChangeState(binding.subjectRoot || binding.worktreePath, binding.changeId, {
        ...options,
        sessionId,
        binding,
        resolvedFromBoundSubject: true,
        eventRoot: root,
      });
    }
    return loadChangeState(root, binding.changeId, { ...options, sessionId, binding });
  }

  const activeFile = path.join(root, 'harness', 'ACTIVE_CHANGE');
  if (!fs.existsSync(activeFile)) {
    return { ok: false, reason: 'missing-active-change' };
  }
  const changeId = fs.readFileSync(activeFile, 'utf-8').trim();
  if (!changeId) return { ok: false, reason: 'empty-active-change' };
  return loadChangeState(root, changeId, options);
}

function loadChangeState(root, changeId, metadata = {}) {
  const statePath = path.join(root, 'harness', 'changes', changeId, 'state.json');
  if (!fs.existsSync(statePath)) return { ok: false, reason: 'missing-state', changeId, statePath };
  let data;
  try {
    data = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    data = migrateAndPersist(data, statePath);
    if (!isRecognizedStateEnvelope(data, changeId)) throw new Error('invalid state envelope');
  } catch {
    return {
      ok: false,
      reason: 'invalid-state',
      errorCode: 'EH-STATE-READ-025',
      changeId,
      statePath,
      ...(metadata.sessionId ? { sessionId: metadata.sessionId } : {}),
    };
  }
  if (metadata.requireV5 && data.schemaVersion === 4) {
    return {
      ok: false,
      reason: 'active-state-v4',
      errorCode: 'EH-STATE-V5-001',
      changeId,
      statePath,
    };
  }
  return {
    ok: true,
    changeId,
    statePath,
    data,
    ...(metadata.sessionId ? { sessionId: metadata.sessionId } : {}),
    ...(metadata.binding ? { binding: metadata.binding } : {}),
  };
}

function isRecognizedStateEnvelope(data, changeId) {
  return Boolean(
    data
    && typeof data === 'object'
    && !Array.isArray(data)
    && Number.isInteger(data.schemaVersion)
    && data.schemaVersion >= 3
    && data.schemaVersion <= 6
    && data.changeId === changeId
  );
}

function pathEntryExists(file) {
  try {
    fs.lstatSync(file);
    return true;
  } catch (error) {
    return error?.code !== 'ENOENT';
  }
}

export const GOVERNANCE_BLOCKLIST = new Set(['target', 'build', 'node_modules', '.git', 'dist', 'out']);

function canonicalPath(targetPath) {
  const resolved = path.resolve(targetPath);
  const suffix = [];
  let existing = resolved;
  while (!fs.existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) break;
    suffix.unshift(path.basename(existing));
    existing = parent;
  }
  let canonicalBase = existing;
  try {
    canonicalBase = fs.realpathSync.native(existing);
  } catch {
    // If no ancestor can be resolved, retain the absolute spelling and let
    // the containment check fail closed where appropriate.
  }
  const canonical = path.normalize(path.join(canonicalBase, ...suffix));
  return process.platform === 'win32' ? canonical.toLowerCase() : canonical;
}

function findSubsequence(segments, pattern) {
  for (let i = 0; i <= segments.length - pattern.length; i++) {
    if (pattern.every((part, j) => segments[i + j] === part)) return i;
  }
  return -1;
}

function findConfiguredMatch(segments, roots) {
  return roots
    .map((rootPath) => {
      const pattern = rootPath.split('/');
      return { pattern, index: findSubsequence(segments, pattern) };
    })
    .filter((entry) => entry.index !== -1)
    .sort((a, b) => a.index - b.index)[0] || null;
}

// src/test/java, or an openapi contract directory) anywhere in the project tree, without
// scanning the filesystem. The blocklist only applies to ancestor segments (before the
// matched pattern) so that generated/vendor directories are excluded while business package
// names that happen to contain a blocklisted word (e.g. "target") are not misjudged.
function detectGovernedKind(root, target) {
  const canonicalRoot = canonicalPath(root);
  const canonicalTarget = canonicalPath(target);
  const rel = path.relative(canonicalRoot, canonicalTarget);
  if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) return null;
  const segments = rel.split(path.sep);

  const profile = loadProjectProfile(root);
  const mainMatch = findConfiguredMatch(segments, profile.productionRoots);
  const testMatch = findConfiguredMatch(segments, profile.testRoots);
  const apiMatch = findConfiguredMatch(segments, profile.apiRoots);

  const candidates = [];
  if (mainMatch) candidates.push({ kind: 'main', start: mainMatch.index, end: mainMatch.index + mainMatch.pattern.length });
  if (testMatch) candidates.push({ kind: 'test', start: testMatch.index, end: testMatch.index + testMatch.pattern.length });
  if (apiMatch) candidates.push({ kind: 'openapi', start: apiMatch.index, end: apiMatch.index + apiMatch.pattern.length });
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => a.start - b.start);
  const match = candidates[0];

  const ancestors = segments.slice(0, match.start);
  if (ancestors.some((segment) => GOVERNANCE_BLOCKLIST.has(segment))) return null;

  return { kind: match.kind, dir: path.join(canonicalRoot, ...segments.slice(0, match.end)) };
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

export function hasCurrentTaskTddExecutionEvidence(state) {
  const tddEvidence = state?.tddEvidence || {};
  const cmd = typeof tddEvidence.commandExecuted === 'string' ? tddEvidence.commandExecuted.trim() : '';
  const summary = typeof tddEvidence.commandOutputSummary === 'string' ? tddEvidence.commandOutputSummary.trim() : '';
  const evidencePath = typeof tddEvidence.evidencePath === 'string' ? tddEvidence.evidencePath.trim() : '';
  const worktreeUsed = tddEvidence.worktreeUsed === true;
  const ranProjectNativeBuild = /mvn\s+(test|verify|compile)\b/.test(cmd);
  return Boolean(worktreeUsed && ranProjectNativeBuild && summary && evidencePath);
}
