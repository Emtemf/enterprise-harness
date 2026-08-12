// CodeGraph attempt 不仅要放行，还必须写入 durable agent ledger。
// 回归背景：修复 Bash commit heredoc 的误伤时，codegraph 命令被目标路径豁免提前返回，
// exit 0 但没有 codegraph-attempt；随后 fallback 无法证明同一 agent 已先尝试 CodeGraph。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { readAgentEvents } from '../lib/agent-evidence.mjs';
import { bindSession } from '../lib/sessions.mjs';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const hookPath = path.join(repoRoot, 'runtime', 'hooks', 'pre-explore.mjs');
const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) {
  console.error('Usage: node runtime/test/codegraph-attempt-ledger-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codegraph-attempt-ledger-'));
const changeId = 'codegraph-ledger-smoke';
const agentId = 'code-explore-agent';

try {
  spawnSync('git', ['init', '-q', '.'], { cwd: root });
  bindSession(root, {
    sessionId: 'codegraph-ledger-session',
    changeId,
    worktreePath: root,
    controllerRevision: '0.4.0-dev',
  }, { commonDir: path.join(root, '.git') });
  fs.mkdirSync(path.join(root, 'harness', 'changes', changeId), { recursive: true });
  fs.mkdirSync(path.join(root, 'harness', 'specs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'harness', 'ACTIVE_CHANGE'), `${changeId}\n`, 'utf-8');
  fs.writeFileSync(path.join(root, 'harness', 'changes', changeId, 'state.json'), JSON.stringify({
    schemaVersion: 4,
    changeId,
    workflow: { stage: 'clarify' },
  }), 'utf-8');

  // pre-explore 的 code-explore 绑定前置：写入真实 start receipt，而非篡改 state。
  const ledger = path.join(root, '.git', 'enterprise-harness', 'receipts', changeId, 'agent-events.jsonl');
  fs.mkdirSync(path.dirname(ledger), { recursive: true });
  fs.writeFileSync(ledger, `${JSON.stringify({
    kind: 'start', agentId, observedAgentType: 'enterprise-harness:code-explore', issuedAt: new Date().toISOString(),
  })}\n`, 'utf-8');

  const event = {
    tool_name: 'Bash',
    tool_input: { command: 'codegraph search OrderService' },
    agent_id: agentId,
    session_id: 'codegraph-ledger-session',
    tool_use_id: 'codegraph-ledger-tool',
    cwd: root,
  };
  const result = spawnSync('node', [hookPath], { cwd: root, input: JSON.stringify(event), encoding: 'utf-8' });
  assert.equal(result.status, 0, `CodeGraph attempt must pass: ${result.stderr}`);
  const attempts = readAgentEvents(root, changeId).filter((entry) => (
    entry.kind === 'codegraph-attempt' && entry.agentId === agentId
  ));
  assert.equal(attempts.length, 1, `expected one durable codegraph-attempt, got ${attempts.length}`);
  assert.equal(attempts[0].observedAgentType, 'enterprise-harness:code-explore');
  console.log('CodeGraph attempt ledger smoke passed.');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
