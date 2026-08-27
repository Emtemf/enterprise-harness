import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { preWrite } from '../lib/hooks/pre-write.mjs';
import { changeWriteLeaseExists, changeTransactionTarget } from '../lib/state-store.mjs';

const mode = process.argv[2] || 'verify';
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const runtimeCli = path.join(sourceRoot, 'runtime', 'cli.mjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'enterprise-harness-bash-allowlist-'));
const changeId = 'bash-allowlist';
const changeDir = path.join(root, 'harness', 'changes', changeId);

function bash(command, toolUseId) {
  return preWrite({
    root,
    event: {
      tool_name: 'Bash',
      tool_use_id: toolUseId,
      cwd: root,
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
    `rg fixture . --pre "rm -rf ${leaseDirectory}"`,
    'git status && rm -rf harness',
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
    'rg --files harness',
    'git status --short',
    'git diff --stat',
    'git log -1 --oneline',
    'git show --stat HEAD',
    'git rev-parse --show-toplevel',
    'git ls-files',
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

  console.log(`PASS governed-bash-allowlist ${mode}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
