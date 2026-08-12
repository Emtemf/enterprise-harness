// codegraph_status 只是健康检查，绝不能当作 CodeGraph-first 的实际探索 attempt。
// 否则 worker 先查服务状态，就能绕过对受治理 Grep/Read 的真实 CodeGraph 探索要求。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { readAgentEvents } from '../lib/agent-evidence.mjs';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const hookPath = path.join(repoRoot, 'hooks', 'scripts', 'pre-explore.mjs');
const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) {
  console.error('Usage: node runtime/test/codegraph-status-not-attempt-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codegraph-status-'));
const changeId = 'codegraph-status-smoke';
const agentId = 'code-explore-agent';

function invoke(event) {
  return spawnSync('node', [hookPath], { cwd: root, input: JSON.stringify({ cwd: root, ...event }), encoding: 'utf-8' });
}

try {
  spawnSync('git', ['init', '-q', '.'], { cwd: root });
  fs.mkdirSync(path.join(root, 'harness', 'changes', changeId), { recursive: true });
  fs.mkdirSync(path.join(root, 'harness', 'specs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'harness', 'ACTIVE_CHANGE'), `${changeId}\n`, 'utf-8');
  fs.writeFileSync(path.join(root, 'harness', 'changes', changeId, 'state.json'), JSON.stringify({ schemaVersion: 4, changeId }), 'utf-8');
  const ledger = path.join(root, '.git', 'enterprise-harness', 'receipts', changeId, 'agent-events.jsonl');
  fs.mkdirSync(path.dirname(ledger), { recursive: true });
  fs.writeFileSync(ledger, `${JSON.stringify({
    kind: 'start', agentId, observedAgentType: 'enterprise-harness:code-explore', issuedAt: new Date().toISOString(),
  })}\n`, 'utf-8');

  const status = invoke({ tool_name: 'mcp__codegraph__codegraph_status', tool_input: {}, agent_id: agentId, tool_use_id: 'status' });
  assert.equal(status.status, 0, `health status should be allowed: ${status.stderr}`);
  assert.equal(readAgentEvents(root, changeId).filter((entry) => entry.kind === 'codegraph-attempt').length, 0,
    'status must not produce a codegraph-attempt receipt');

  const fallback = invoke({
    tool_name: 'Grep', tool_input: { pattern: 'OrderService', path: 'src/main/java' }, agent_id: agentId, tool_use_id: 'fallback',
  });
  assert.equal(fallback.status, 2, `fallback without real exploration must BLOCK: ${fallback.stderr}`);
  assert.match(fallback.stderr, /CodeGraph attempt/u);
  console.log('CodeGraph status-not-attempt smoke passed.');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
