import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const sessionStartPath = fileURLToPath(new URL('../hooks/session-start.mjs', import.meta.url));
const mode = process.argv[2];
const requiredTokens = [
  '[Harness 启动检查]',
  '当前阶段',
  'PROGRESS.md',
  '普通用户入口: /harness',
  '[Harness Workflow] 当前 stage:',
  '[Harness Workflow] 当前缺口:',
  '[Harness Workflow] 推荐恢复入口:',
  '[Harness Workflow] 下一步动作:',
  '[Harness Workflow] 普通用户先看:',
  '[Harness 维护] 如需排障再用:',
];

function runSessionStart() {
  return spawnSync('node', [sessionStartPath], {
    cwd: repoRoot,
    encoding: 'utf-8',
  });
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
  console.error('Usage: node harness/plugin/runtime/test/session-start-summary-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const result = runSessionStart();
const output = `${result.stdout || ''}${result.stderr || ''}`;
const hasAllTokens = requiredTokens.every((token) => output.includes(token));

if (mode === 'red') {
  if (!hasAllTokens) {
    fail('Expected SessionStart summary to omit progress source, active change summary, or status command hint before implementation');
  }
  pass('Red precondition no longer holds.');
}

if (result.status !== 0) {
  fail(`Expected SessionStart hook to succeed, got exit=${result.status}`);
}

if (!hasAllTokens) {
  fail('Expected SessionStart summary to include startup check, progress source, active change summary, and status command hint');
}

pass(mode === 'green' ? 'Green session-start smoke passed.' : 'Session-start verify smoke passed.');
