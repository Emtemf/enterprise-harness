import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const STAGES = ['clarify', 'route', 'design', 'plan', 'tdd', 'verify', 'archive'];

export function artifactDependencies() {
  return Object.freeze({
    requirements: [],
    design: ['requirements'],
    plan: ['design'],
    evidence: ['plan'],
    validation: ['requirements', 'design', 'plan', 'evidence'],
  });
}

export function deriveStaleArtifacts(graph, changedArtifacts) {
  const changed = new Set(changedArtifacts || []);
  const stale = new Set();
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const [artifact, dependencies] of Object.entries(graph || {})) {
      if (changed.has(artifact) || stale.has(artifact)) continue;
      if (dependencies.some((dependency) => changed.has(dependency) || stale.has(dependency))) {
        stale.add(artifact);
        expanded = true;
      }
    }
  }
  return [...stale].sort();
}

export function controlledRewind({ currentStage, staleArtifacts = [], targetStage }) {
  const currentIndex = STAGES.indexOf(currentStage);
  const targetIndex = STAGES.indexOf(targetStage);
  if (currentIndex === -1 || targetIndex === -1) {
    throw new Error('EH-REWIND-001: unknown workflow stage');
  }
  if (targetIndex >= currentIndex) {
    throw new Error('EH-REWIND-001: rewind target must be upstream');
  }
  return Object.freeze({
    stage: targetStage,
    invalidated: [...new Set(staleArtifacts)].sort(),
    historyPreserved: true,
    recordedAt: new Date().toISOString(),
  });
}

export function artifactNameForPath(relativePath) {
  const normalized = String(relativePath).replaceAll('\\', '/').replace(/^\/+|\/+$/gu, '');
  if (normalized === 'requirements.md') return 'requirements';
  if (normalized === 'design.md') return 'design';
  if (normalized === 'tasks.md') return 'plan';
  if (normalized === 'validation.md') return 'validation';
  if (normalized === 'evidence' || normalized.startsWith('evidence/')) return 'evidence';
  return null;
}

export function invalidateStateArtifacts(state, changedArtifacts) {
  const changed = [...new Set(changedArtifacts || [])];
  const graph = state?.dependencies && Object.keys(state.dependencies).length
    ? state.dependencies
    : artifactDependencies();
  const stale = deriveStaleArtifacts(graph, changed);
  const invalidated = [...new Set([...changed, ...stale])];
  if (invalidated.length === 0) return state;
  const artifacts = { ...(state?.artifacts || {}) };
  for (const artifact of invalidated) {
    artifacts[artifact] = {
      ...(artifacts[artifact] || {}),
      status: 'stale',
      invalidatedBy: changed,
    };
  }
  const next = {
    ...state,
    artifacts,
    dependencies: graph,
  };
  if (invalidated.includes('validation')) {
    next.validation = {
      ...(state?.validation || {}),
      status: 'stale',
      digest: null,
      validatedAt: null,
    };
  }
  return next;
}

export function digestText(text) {
  return crypto.createHash('sha256').update(String(text).replaceAll('\r\n', '\n').replaceAll('\r', '\n')).digest('hex');
}

export function digestFile(file) {
  return digestText(fs.readFileSync(file, 'utf-8'));
}

export function snapshotArtifacts(changeDir, relativePaths = Object.keys(artifactDependencies())) {
  return Object.fromEntries(relativePaths
    .filter((relativePath) => fs.existsSync(path.join(changeDir, relativePath)))
    .map((relativePath) => [relativePath, {
      path: relativePath,
      digest: digestFile(path.join(changeDir, relativePath)),
    }]));
}
