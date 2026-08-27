import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { preWrite } from '../lib/hooks/pre-write.mjs';
import { changeWriteLeaseExists, changeTransactionTarget } from '../lib/state-store.mjs';
import { bindSession } from '../lib/sessions.mjs';

const mode = process.argv[2] || 'verify';
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const runtimeCli = path.join(sourceRoot, 'runtime', 'cli.mjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'enterprise-harness-bash-allowlist-'));
const changeId = 'bash-allowlist';
const changeDir = path.join(root, 'harness', 'changes', changeId);

function bash(command, toolUseId, sessionId = null) {
  return preWrite({
    root,
    event: {
      tool_name: 'Bash',
      tool_use_id: toolUseId,
      cwd: root,
      ...(sessionId ? { session_id: sessionId } : {}),
      tool_input: { command },
    },
  });
}

try {
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: root }).status, 0);
  fs.mkdirSync(changeDir, { recursive: true });
  fs.writeFileSync(path.join(root, 'harness', 'ACTIVE_CHANGE'), `${changeId}\n`);
  fs.writeFileSync(path.join(changeDir, 'state.json'), `${JSON.stringify({
    schemaVersion: 6,
    revision: 1,
    changeId,
    lifecycle: 'active',
    stage: 'clarify',
    artifacts: {},
    validation: { status: 'stale', digest: null, validatedAt: null },
  }, null, 2)}\n`);

  const leaseDirectory = `${changeTransactionTarget(root, changeId)}-write-leases`;
  const attacks = [
    `node -p "require('node:fs').rmSync('${leaseDirectory}',{recursive:true,force:true})"`,
    `command rm -rf "${leaseDirectory}"`,
    `env rm -rf "${leaseDirectory}"`,
    `find "${path.dirname(leaseDirectory)}" -delete`,
    `python3 "${path.join(root, 'mutate.py')}"`,
    `bash "${path.join(root, 'mutate.sh')}"`,
    'rg needle .',
    `rg fixture . --pre "rm -rf ${leaseDirectory}"`,
    'git status --short',
    'git diff --stat',
    'git log -1 --oneline',
    'git show --stat HEAD',
    'git ls-files',
    'git status && rm -rf harness',
    `node "${runtimeCli}" task-run fake-change fake-task fake-run verify`,
    'enterprise-harness task-run fake-change fake-task fake-run verify',
    'pwd > observed.txt',
    'echo $(rm -rf harness)',
  ];
  for (const [index, command] of attacks.entries()) {
    const result = bash(command, `attack-${index}`);
    assert.equal(result.exitCode, 2, `must reject governed Bash: ${command}`);
    assert.match(result.stderr, /EH-HOOK-BASH-MUTATION-157/u);
  }

  for (const [index, command] of [
    'pwd -P',
    'ls -la harness',
    'rg --no-config --files harness',
    'git rev-parse --show-toplevel',
    `node "${runtimeCli}" status`,
    'enterprise-harness status',
  ].entries()) {
    const toolUseId = `allowed-${index}`;
    const result = bash(command, toolUseId);
    assert.equal(result.exitCode, 0, `must allow canonical/read-only Bash: ${command}; ${result.stderr || ''}`);
    assert.equal(
      changeWriteLeaseExists(root, changeId, toolUseId),
      false,
      'read-only and transaction-owning runtime commands must not acquire hook write leases',
    );
  }

  const sessionDirectory = path.join(root, '.git', 'enterprise-harness', 'sessions');
  fs.mkdirSync(sessionDirectory, { recursive: true });
  fs.writeFileSync(path.join(sessionDirectory, 'corrupt-binding.json'), '{not-json}\n');
  const corruptBash = bash(
    `awk 'BEGIN { system("touch escaped-marker") }'`,
    'corrupt-binding-arbitrary',
    'corrupt-binding',
  );
  assert.equal(corruptBash.exitCode, 2, 'a corrupt binding must not fall through to legacy Bash heuristics');
  assert.match(corruptBash.stderr, /EH-SESSION-BINDING-024/u);
  assert.equal(
    bash(`node "${runtimeCli}" doctor --json`, 'corrupt-binding-recovery', 'corrupt-binding').exitCode,
    0,
    'canonical runtime recovery must remain available for a corrupt binding',
  );
  for (const [index, command] of [
    `node "${runtimeCli}" lifecycle scaffold bypass-change`,
    `node "${runtimeCli}" install --write-local-adapter`,
    'enterprise-harness sync --json',
  ].entries()) {
    assert.equal(
      bash(command, `corrupt-binding-mutator-${index}`, 'corrupt-binding').exitCode,
      2,
      `unresolved binding must not allow non-recovery runtime action: ${command}`,
    );
  }
  assert.equal(
    bash('enterprise-harness sessions unbind corrupt-binding', 'corrupt-binding-unbind', 'corrupt-binding').exitCode,
    0,
    'the current corrupt session may invoke its exact unbind recovery command',
  );

  bindSession(root, {
    sessionId: 'expired-binding',
    changeId,
    worktreePath: root,
    controllerRevision: 'test-controller',
    leaseExpiresAt: Date.now() - 1,
  }, { commonDir: path.join(root, '.git') });
  const expiredBash = bash('awk BEGIN', 'expired-binding-arbitrary', 'expired-binding');
  assert.equal(expiredBash.exitCode, 2, 'an expired binding must remain fail closed for arbitrary Bash');
  assert.match(expiredBash.stderr, /EH-SESSION-LEASE-023/u);
  assert.equal(
    bash('enterprise-harness start-change bash-allowlist', 'expired-binding-recovery', 'expired-binding').exitCode,
    0,
    'canonical lease recovery must remain available for an expired binding',
  );

  console.log(`PASS governed-bash-allowlist ${mode}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
