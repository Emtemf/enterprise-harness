import process from 'node:process';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const sessionStartPath = path.join(repoRoot, 'harness', 'plugin', 'runtime', 'hooks', 'session-start.mjs');
const stopPath = path.join(repoRoot, 'harness', 'plugin', 'runtime', 'hooks', 'stop.mjs');
const mode = process.argv[2];
const requiredStartTokens = ['[Harness Workflow] 当前 stage:', '[Harness Workflow] 推荐恢复入口:'];
const requiredStopTokens = ['当前 workflow stage', '建议下次从：'];

function runNode(file) {
  return spawnSync('node', [file], {
    cwd: repoRoot,
    encoding: 'utf-8',
  });
}

function outputOf(result) {
  return `${result.stdout || ''}${result.stderr || ''}`;
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
  console.error('Usage: node harness/plugin/runtime/test/stage-guidance-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const startResult = runNode(sessionStartPath);
const stopResult = runNode(stopPath);
const startOutput = outputOf(startResult);
const stopOutput = outputOf(stopResult);
const startOk = startResult.status === 0 && requiredStartTokens.every((token) => startOutput.includes(token));
const stopOk = stopOutput.includes('Stop handoff guidance') && requiredStopTokens.every((token) => stopOutput.includes(token));

if (mode === 'red') {
  if (!startOk || !stopOk) {
    fail('Expected SessionStart and Stop to provide current-stage and next-stage recovery guidance');
  }
  pass('Red precondition no longer holds.');
}

if (!startOk) {
  fail('Expected SessionStart to provide current-stage and next-stage recovery guidance');
}
if (!stopOk) {
  fail('Expected Stop to provide current-stage and next-stage recovery guidance');
}

pass(mode === 'green' ? 'Green stage-guidance smoke passed.' : 'Stage-guidance verify smoke passed.');
