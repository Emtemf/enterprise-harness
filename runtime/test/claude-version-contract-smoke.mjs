import assert from 'node:assert/strict';
import process from 'node:process';
import { MINIMUM_CLAUDE_CODE_VERSION, evaluateClaudeCodeVersion } from '../lib/claude-version.mjs';

const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) {
  console.error('Usage: node runtime/test/claude-version-contract-smoke.mjs <red|green|verify>');
  process.exit(1);
}

try {
  assert.equal(MINIMUM_CLAUDE_CODE_VERSION, '2.1.219');
  assert.deepEqual(evaluateClaudeCodeVersion({ status: 0, stdout: '2.1.226 (Claude Code)' }), {
    ok: true,
    severity: 'info',
    status: 'supported',
    detectedVersion: '2.1.226',
    minimumVersion: '2.1.219',
    detail: 'Claude Code 2.1.226 meets required >=2.1.219',
  });
  assert.equal(evaluateClaudeCodeVersion({ status: 0, stdout: '2.1.217 (Claude Code)' }).severity, 'error');
  assert.equal(evaluateClaudeCodeVersion({ status: 127, error: { message: 'not found' } }).severity, 'warn');
  assert.equal(evaluateClaudeCodeVersion({ status: 0, stdout: 'development build' }).status, 'unknown-version');
} catch (error) {
  if (mode === 'red') {
    console.log(`Red precondition observed: ${error.code || error.message}`);
    process.exit(0);
  }
  console.error(error.stack || error.message);
  process.exit(1);
}

if (mode === 'red') {
  console.error('Red precondition no longer holds.');
  process.exit(1);
}
console.log(mode === 'green' ? 'Green Claude version contract smoke passed.' : 'Claude version contract verify smoke passed.');
