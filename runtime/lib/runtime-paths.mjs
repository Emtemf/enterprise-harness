import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { assertSafeId, resolveChild } from './safe-paths.mjs';

function resolveCommonDir(root, explicit) {
  if (explicit) return path.resolve(explicit);
  try {
    const raw = execFileSync('git', ['rev-parse', '--git-common-dir'], {
      cwd: root,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return path.resolve(root, raw || '.git');
  } catch {
    return path.join(root, '.git');
  }
}

export function runtimePaths(root = process.cwd(), options = {}) {
  const projectRoot = path.resolve(root);
  const commonDir = resolveCommonDir(projectRoot, options.commonDir);
  const runtimeRoot = path.join(commonDir, 'enterprise-harness');
  const sessionDir = path.join(runtimeRoot, 'sessions');
  const lockDir = path.join(runtimeRoot, 'locks');
  const ledgerDir = path.join(runtimeRoot, 'ledger');
  return Object.freeze({
    projectRoot,
    commonDir,
    runtimeRoot,
    sessionDir,
    lockDir,
    ledgerDir,
    sessionPath(sessionId) {
      assertSafeId(sessionId, 'sessionId');
      return resolveChild(sessionDir, `${sessionId}.json`, 'sessionId');
    },
    lockPath(changeId) {
      assertSafeId(changeId, 'changeId');
      return resolveChild(lockDir, `${changeId}.json`, 'changeId');
    },
  });
}

export function ensureRuntimePaths(root = process.cwd(), options = {}) {
  const paths = runtimePaths(root, options);
  for (const dir of [paths.runtimeRoot, paths.sessionDir, paths.lockDir, paths.ledgerDir]) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  return paths;
}
