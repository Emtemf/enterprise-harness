import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const workflowPath = path.join(repoRoot, 'harness', 'plugin', 'runtime', 'workflow.mjs');
const mode = process.argv[2];

function run(cwd, args) {
  return spawnSync('node', [workflowPath, ...args], { cwd, encoding: 'utf-8' });
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function pass(message) {
  console.log(message);
  process.exit(0);
}

if (!['red', 'green', 'verify'].includes(mode)) {
  console.error('Usage: node harness/plugin/runtime/test/session-log-contract-smoke.mjs <red|green|verify>');
  process.exit(1);
}

// 在隔离临时目录里验证 note / session-log 契约，避免污染真实 change 的事件流。
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'session-log-contract-'));
try {
  const changeId = 'log-demo';
  // 直接预置一个 change（不走 run/scaffold，专注测 note/session-log 契约）。
  const changeDir = path.join(tempRoot, 'harness', 'changes', changeId);
  fs.mkdirSync(path.join(changeDir, 'evidence'), { recursive: true });
  fs.writeFileSync(path.join(changeDir, 'state.json'), JSON.stringify({
    schemaVersion: 1,
    changeId,
    tier: 'L1',
    state: 'DRAFT',
    impact: { api: 'no', data: 'no', architecture: 'no', rule: 'no' },
    tooling: { codegraph: { status: 'available', queries: [], fallbackReason: null }, documentation: { status: 'not-needed', libraries: [] } },
    validation: { status: 'missing', digest: null, validatedAt: null },
    workflow: { stage: 'clarify', clarifyReady: false, userConfirmedScope: false, planReady: false, tddStatus: 'not-started', nextEntry: '/harness-intake' },
  }, null, 2) + '\n');
  fs.writeFileSync(path.join(tempRoot, 'harness', 'ACTIVE_CHANGE'), changeId + '\n');

  // 1. note 记录两类决策级事件。
  const note1 = run(tempRoot, ['note', changeId, 'clarify-qa', 'Q: scope? A: only module X']);
  const note2 = run(tempRoot, ['note', changeId, 'route-decided', 'tier=L1 because single module']);
  // 2. 非法事件类型应被拒绝。
  const badNote = run(tempRoot, ['note', changeId, 'random-type', 'x']);
  // 3. session-log 渲染出可读时间线，含两条 note 内容。
  const log = run(tempRoot, ['session-log', changeId]);
  const logOut = log.stdout || '';

  const eventLog = path.join(tempRoot, 'harness', 'changes', changeId, 'evidence', 'workflow-events.jsonl');
  const eventLines = fs.existsSync(eventLog)
    ? fs.readFileSync(eventLog, 'utf-8').split('\n').filter(Boolean)
    : [];
  const hasClarifyQa = eventLines.some((l) => l.includes('"type":"clarify-qa"'));
  const hasRouteDecided = eventLines.some((l) => l.includes('"type":"route-decided"'));

  const failures = [];
  if (note1.status !== 0) failures.push('note clarify-qa should exit 0');
  if (note2.status !== 0) failures.push('note route-decided should exit 0');
  if (badNote.status === 0) failures.push('invalid note type should be rejected');
  if (!hasClarifyQa) failures.push('event log should contain clarify-qa event');
  if (!hasRouteDecided) failures.push('event log should contain route-decided event');
  if (log.status !== 0) failures.push('session-log should exit 0');
  if (!logOut.includes('Session Log')) failures.push('session-log should render a header');
  if (!logOut.includes('only module X')) failures.push('session-log should include clarify-qa note text');
  if (!logOut.includes('single module')) failures.push('session-log should include route-decided note text');

  const ok = failures.length === 0;

  if (mode === 'red') {
    if (!ok) fail(`Expected session-log contract to hold:\n${failures.join('\n')}`);
    pass('Red precondition no longer holds.');
  }
  if (!ok) fail(`Expected session-log contract to hold:\n${failures.join('\n')}`);
  pass(mode === 'green' ? 'Green session-log-contract smoke passed.' : 'Session-log-contract verify smoke passed.');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
