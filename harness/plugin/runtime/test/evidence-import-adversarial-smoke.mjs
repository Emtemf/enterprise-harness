import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  appendAgentEvent,
  receiptSpoolPath,
} from '../lib/agent-evidence.mjs';
import {
  changedWorktreePaths,
  headSnapshotDigest,
  worktreeSnapshotDigest,
} from '../lib/git-evidence.mjs';
import {
  validateBootstrapReview,
  validateImportProvenance,
  writeExclusive,
} from '../lib/import-validation.mjs';
import { receiptDigest } from '../lib/tdd-receipts.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-import-adversarial-'));
const changeId = 'import-probe';
const taskId = 'task-2';
const git = (...args) => {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf-8', shell: false });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
};
git('init', '-q');
git('config', 'user.email', 'harness@example.invalid');
git('config', 'user.name', 'Harness Smoke');
fs.mkdirSync(path.join(root, 'src'), { recursive: true });
fs.writeFileSync(path.join(root, 'src/probe.txt'), 'before\n');
git('add', '.');
git('commit', '-qm', 'baseline');
const headBefore = git('rev-parse', 'HEAD');
const treeBefore = headSnapshotDigest(root);

appendAgentEvent(root, changeId, {
  kind: 'dispatch',
  sessionId: 'session-1',
  toolUseId: 'tool-1',
  requestedAgentType: 'enterprise-harness:tdd-executor',
});
appendAgentEvent(root, changeId, {
  kind: 'start',
  sessionId: 'session-1',
  agentId: 'agent-1',
  observedAgentType: 'enterprise-harness:tdd-executor',
});
appendAgentEvent(root, changeId, {
  kind: 'dispatch-binding',
  sessionId: 'session-1',
  toolUseId: 'tool-1',
  agentId: 'agent-1',
  requestedAgentType: 'enterprise-harness:tdd-executor',
});
appendAgentEvent(root, changeId, {
  kind: 'stop',
  sessionId: 'session-1',
  agentId: 'agent-1',
  observedAgentType: 'enterprise-harness:tdd-executor',
});

fs.writeFileSync(path.join(root, 'src/probe.txt'), 'after\n');
const changedPaths = changedWorktreePaths(root);
const treeAfter = worktreeSnapshotDigest(root);
git('add', '.');
git('commit', '-qm', 'implementation');
const sourceHead = git('rev-parse', 'HEAD');
const digest = (value) => crypto.createHash('sha256').update(value).digest('hex');
const receipt = {
  receiptVersion: 1,
  provenance: 'tdd-run',
  changeId,
  taskId,
  agent: { id: 'agent-1', type: 'enterprise-harness:tdd-executor' },
  worktree: {
    path: root,
    gitCommonDir: path.join(root, '.git'),
    headBefore,
    headAfter: headBefore,
    treeDigestBefore: treeBefore,
    treeDigestAfter: treeAfter,
  },
  changedPaths,
  executions: [],
};
const validOptions = { root, changeId, taskId, sourceHead, integrationHead: sourceHead };
assert.deepEqual(validateImportProvenance(receipt, validOptions), []);
for (const [name, forged] of [
  ['agent', { ...receipt, agent: { ...receipt.agent, id: 'forged-agent' } }],
  ['head', { ...receipt, worktree: { ...receipt.worktree, headBefore: 'f'.repeat(40) } }],
  ['tree', { ...receipt, worktree: { ...receipt.worktree, treeDigestAfter: digest('forged') } }],
  ['changed paths', { ...receipt, changedPaths: [] }],
]) {
  assert.notDeepEqual(
    validateImportProvenance(forged, validOptions),
    [],
    `forged ${name} provenance must fail`,
  );
}

const spoolDigest = receiptDigest(receipt);
assert.notDeepEqual(
  validateBootstrapReview(
    { verdict: 'pass', digest: sourceHead },
    { reviewedCommit: sourceHead, spoolDigest },
  ),
  [],
  'review without an exact receipt binding must fail',
);
assert.deepEqual(validateBootstrapReview({
  verdict: 'pass',
  implementationCommit: sourceHead,
  receiptDigest: spoolDigest,
}, { reviewedCommit: sourceHead, spoolDigest }), []);

const durable = path.join(root, 'durable.json');
writeExclusive(durable, 'first\n');
assert.throws(() => writeExclusive(durable, 'forged\n'), /already exists/i);
assert.equal(fs.readFileSync(durable, 'utf-8'), 'first\n');

const sourceRoot = process.cwd();
const escapeTarget = path.join(root, 'harness', 'outside');
const traversal = spawnSync('node', [
  path.join(sourceRoot, 'harness/plugin/runtime/evidence-import.mjs'),
  '../outside',
  taskId,
], { cwd: root, encoding: 'utf-8', shell: false });
assert.equal(traversal.status, 2);
assert.equal(fs.existsSync(escapeTarget), false);
assert.equal(fs.existsSync(receiptSpoolPath(root, changeId)), true);
console.log(`PASS evidence-import-adversarial ${process.argv[2] || 'verify'}`);
