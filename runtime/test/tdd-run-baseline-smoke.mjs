import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { appendAgentEvent } from '../lib/agent-evidence.mjs';
import {
  headSnapshotDigest,
  worktreeSnapshotDigest,
} from '../lib/git-evidence.mjs';
import { tddReceiptSpoolPath } from '../lib/tdd-receipts.mjs';

const mode = process.argv[2] || 'verify';
const testDir = path.dirname(fileURLToPath(import.meta.url));
const sourceRoot = path.resolve(testDir, '../..');
const changeId = 'test-dynamic-change';
const taskId = 'task-2';
const agentId = 'agent-1';
let root = null;

try {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-tdd-run-baseline-'));
  const git = (...args) => {
    const result = spawnSync('git', args, { cwd: root, encoding: 'utf-8', shell: false });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };

  git('init', '-q');
  git('config', 'user.email', 'harness@example.invalid');
  git('config', 'user.name', 'Harness Smoke');
  fs.mkdirSync(path.join(root, 'runtime', 'test'), { recursive: true });
  fs.mkdirSync(path.join(root, 'harness', 'changes', changeId), { recursive: true });
  fs.writeFileSync(path.join(root, 'harness', 'ACTIVE_CHANGE'), `${changeId}\n`);
  fs.writeFileSync(path.join(root, 'harness', 'command-policy.json'), `${JSON.stringify({
    schemaVersion: 1,
    build: { type: 'command', executables: ['node'] },
  })}\n`);
  fs.writeFileSync(
    path.join(root, 'harness', 'changes', changeId, 'task-commands.json'),
    `${JSON.stringify({
      schemaVersion: 1,
      tasks: {
        [taskId]: {
          redCommand: ['node', 'runtime/test/task2-plugin-agent-smoke.mjs', 'red'],
          greenCommand: ['node', 'runtime/test/task2-plugin-agent-smoke.mjs', 'green'],
          refactorCommand: ['node', 'runtime/test/task2-plugin-agent-smoke.mjs', 'verify'],
        },
      },
    })}\n`,
  );
  fs.writeFileSync(
    path.join(root, 'runtime', 'test', 'task2-plugin-agent-smoke.mjs'),
    "console.error('intentional red'); process.exit(1);\n",
  );
  fs.writeFileSync(path.join(root, 'dirty.txt'), 'baseline\n');
  git('add', '.');
  git('commit', '-qm', 'baseline');
  const headBefore = git('rev-parse', 'HEAD');
  const headBeforeDigest = headSnapshotDigest(root, headBefore);

  fs.writeFileSync(path.join(root, 'dirty.txt'), 'dirty\n');
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude', 'settings.json'), '{}\n');
  const dirtyWorktreeDigest = worktreeSnapshotDigest(root);
  assert.notEqual(dirtyWorktreeDigest, headBeforeDigest, 'fixture must stay dirty before RED execution');

  appendAgentEvent(root, changeId, {
    kind: 'start',
    sessionId: 'session-1',
    agentId,
    observedAgentType: 'enterprise-harness:tdd-executor',
    cwd: root,
  });

  const command = [
    path.join(sourceRoot, 'runtime/tdd-run.mjs'),
    changeId,
    taskId,
    'red',
    '--',
    'node',
    'runtime/test/task2-plugin-agent-smoke.mjs',
    'red',
  ];
  const result = spawnSync('node', command, {
    cwd: root,
    encoding: 'utf-8',
    shell: false,
    env: {
      ...process.env,
      CLAUDE_AGENT_ID: agentId,
    },
  });
  assert.equal(result.status, 1, `tdd-run RED must preserve child nonzero exit: ${result.stderr}`);

  const receiptPath = tddReceiptSpoolPath(root, changeId, taskId);
  const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf-8'));
  const worktreeAfterDigest = worktreeSnapshotDigest(root);
  assert.equal(receipt.worktree.headBefore, headBefore);
  assert.equal(
    receipt.worktree.treeDigestBefore,
    headBeforeDigest,
    'treeDigestBefore must match headSnapshotDigest(headBefore), not the dirty RED worktree snapshot',
  );
  assert.equal(
    receipt.worktree.treeDigestAfter,
    worktreeAfterDigest,
    'treeDigestAfter must remain the dirty worktree snapshot after RED execution',
  );
  assert.equal(receipt.executions.length, 1);
  assert.equal(receipt.executions[0].phase, 'RED');
  assert.equal(receipt.executions[0].exitCode, 1);
  console.log(`PASS tdd-run-baseline ${mode}`);
} finally {
  if (root && fs.existsSync(root)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
