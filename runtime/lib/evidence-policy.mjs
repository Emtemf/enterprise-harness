import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { gitCommonDir } from './agent-evidence.mjs';
import { readSession, sessionIdFromEnv } from './sessions.mjs';

export const EVIDENCE_POLICY_PATH = path.join('harness', 'evidence-policy.json');

export function evidencePolicySealPath(root) {
  return path.join(gitCommonDir(root), 'enterprise-harness', 'evidence-policy-seal.json');
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function git(root, args) {
  const result = spawnSync('git', args, {
    cwd: root,
    encoding: 'utf-8',
    shell: false,
  });
  return result.status === 0 ? result.stdout.trim() : null;
}

function gitSealedPolicy(root) {
  const commit = git(root, [
    'log',
    '--diff-filter=A',
    '--format=%H',
    '--',
    EVIDENCE_POLICY_PATH,
  ])?.split('\n').filter(Boolean).at(-1);
  if (!commit) return null;
  const content = git(root, ['show', `${commit}:${EVIDENCE_POLICY_PATH}`]);
  if (!content) return null;
  try {
    return { commit, policy: JSON.parse(content) };
  } catch {
    return { commit, policy: null };
  }
}

function runtimePolicySeal(root) {
  const sealPath = evidencePolicySealPath(root);
  if (!fs.existsSync(sealPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(sealPath, 'utf-8'));
  } catch {
    return { invalid: true };
  }
}

function canonicalPolicy(policy) {
  return {
    policyVersion: policy.policyVersion,
    strictByDefault: policy.strictByDefault,
    sealed: policy.sealed,
    legacyBaselineCommit: policy.legacyBaselineCommit,
    legacyChangeIds: [...(policy.legacyChangeIds || [])].sort(),
  };
}

export function evidencePolicyDigest(policy) {
  return sha256(JSON.stringify(canonicalPolicy(policy)));
}

function committedChangeIds(root, baseline, strictChangeIds = [], options = {}) {
  const output = git(root, [
    'ls-tree',
    '-r',
    '--name-only',
    baseline,
    '--',
    'harness/changes',
  ]);
  if (output === null) throw new Error('cannot inspect committed change baseline');
  const activePath = path.join(root, 'harness', 'ACTIVE_CHANGE');
  const sessionId = options.sessionId || sessionIdFromEnv(options.env || process.env);
  const sessionBinding = sessionId ? readSession(root, sessionId, options) : null;
  const activeChange = sessionId
    ? (sessionBinding?.changeId || null)
    : (fs.existsSync(activePath) ? fs.readFileSync(activePath, 'utf-8').trim() : null);
  const strict = new Set([activeChange, ...strictChangeIds].filter(Boolean));
  return [...new Set(output
    .split('\n')
    .filter((name) => /^harness\/changes\/[^/]+\/state\.json$/.test(name))
    .map((name) => name.split('/')[2])
    .filter((changeId) => !strict.has(changeId)))].sort();
}

export function validateEvidencePolicy(root, policy) {
  const problems = [];
  if (!policy || typeof policy !== 'object') return ['evidence policy is not an object'];
  if (policy.policyVersion !== 1) problems.push('policyVersion must be 1');
  if (policy.strictByDefault !== true) problems.push('strictByDefault must remain true');
  if (policy.sealed !== true) problems.push('sealed must remain true');
  if (!/^[0-9a-f]{40,64}$/.test(String(policy.legacyBaselineCommit || ''))) {
    problems.push('legacyBaselineCommit must be a git object id');
  }
  if (!Array.isArray(policy.legacyChangeIds)
      || policy.legacyChangeIds.some((id) => !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(String(id)))) {
    problems.push('legacyChangeIds must contain safe change ids');
  }
  if (!/^[0-9a-f]{64}$/.test(String(policy.contentDigest || ''))
      || policy.contentDigest !== evidencePolicyDigest(policy)) {
    problems.push('sealed policy content digest mismatch');
  }
  if (problems.length) return problems;
  if (git(root, ['cat-file', '-e', `${policy.legacyBaselineCommit}^{commit}`]) === null) {
    problems.push('legacy baseline commit does not exist');
    return problems;
  }
  for (const changeId of policy.legacyChangeIds) {
    if (git(root, [
      'cat-file',
      '-e',
      `${policy.legacyBaselineCommit}:harness/changes/${changeId}/state.json`,
    ]) === null) {
      problems.push(`legacy change ${changeId} did not exist in sealed baseline`);
    }
  }
  const sealed = gitSealedPolicy(root);
  if (sealed && JSON.stringify(sealed.policy) !== JSON.stringify(policy)) {
    problems.push(`evidence policy differs from git-sealed migration commit ${sealed.commit}`);
  }
  const runtimeSeal = runtimePolicySeal(root);
  if (runtimeSeal && (
    runtimeSeal.sealVersion !== 1
    || runtimeSeal.legacyBaselineCommit !== policy.legacyBaselineCommit
    || runtimeSeal.contentDigest !== policy.contentDigest
  )) {
    problems.push('evidence policy differs from runtime migration seal');
  }
  return problems;
}

export function readEvidencePolicy(root = process.cwd()) {
  const policyPath = path.join(root, EVIDENCE_POLICY_PATH);
  if (!fs.existsSync(policyPath)) {
    return { ok: false, reason: 'missing', path: policyPath, problems: ['evidence policy is missing'] };
  }
  try {
    const policy = JSON.parse(fs.readFileSync(policyPath, 'utf-8'));
    const problems = validateEvidencePolicy(root, policy);
    return {
      ok: problems.length === 0,
      reason: problems.length ? 'invalid' : null,
      path: policyPath,
      policy,
      problems,
    };
  } catch (error) {
    return { ok: false, reason: 'unreadable', path: policyPath, problems: [error.message] };
  }
}

export function createEvidencePolicy(root = process.cwd(), { strictChangeIds = [], ...options } = {}) {
  const policyPath = path.join(root, EVIDENCE_POLICY_PATH);
  if (fs.existsSync(policyPath)) {
    throw new Error(`sealed evidence policy already exists: ${policyPath}`);
  }
  const baseline = git(root, ['rev-parse', 'HEAD']);
  if (!baseline) throw new Error('evidence policy requires a git HEAD baseline');
  const policy = {
    policyVersion: 1,
    strictByDefault: true,
    sealed: true,
    legacyBaselineCommit: baseline,
    legacyChangeIds: committedChangeIds(root, baseline, strictChangeIds, options),
  };
  policy.contentDigest = evidencePolicyDigest(policy);
  const problems = validateEvidencePolicy(root, policy);
  if (problems.length) throw new Error(`cannot seal evidence policy: ${problems.join('; ')}`);
  fs.mkdirSync(path.dirname(policyPath), { recursive: true });
  fs.writeFileSync(policyPath, `${JSON.stringify(policy, null, 2)}\n`, { flag: 'wx' });
  const sealPath = evidencePolicySealPath(root);
  fs.mkdirSync(path.dirname(sealPath), { recursive: true });
  try {
    fs.writeFileSync(sealPath, `${JSON.stringify({
      sealVersion: 1,
      legacyBaselineCommit: baseline,
      contentDigest: policy.contentDigest,
      createdAt: new Date().toISOString(),
    }, null, 2)}\n`, { flag: 'wx' });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const existing = runtimePolicySeal(root);
    if (existing?.legacyBaselineCommit !== baseline
        || existing?.contentDigest !== policy.contentDigest) {
      throw new Error('runtime evidence-policy migration seal already exists with different content');
    }
  }
  return { created: true, path: policyPath, policy };
}

export function evidenceModeForChange(root, changeId) {
  const loaded = readEvidencePolicy(root);
  if (!loaded.ok) return { ok: false, mode: null, ...loaded };
  return {
    ok: true,
    mode: loaded.policy.legacyChangeIds.includes(changeId) ? 'legacy' : 'strict',
    policy: loaded.policy,
    path: loaded.path,
    problems: [],
  };
}
