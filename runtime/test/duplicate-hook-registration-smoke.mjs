import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const sourceRoot = process.cwd();
const changeId = 'duplicate-hook-probe';

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-duplicate-hook-'));
  // An empty changes/ dir keeps trackingChanges true (so the Bash-write snapshot path
  // runs) while giving the artifact validators nothing to report.
  fs.mkdirSync(path.join(root, 'harness/changes'), { recursive: true });
  spawnSync('git', ['init', '-q'], { cwd: root, shell: false });
  return root;
}

function hook(root, script, payload) {
  return spawnSync('node', [path.join(sourceRoot, 'hooks/scripts', script)], {
    cwd: root,
    encoding: 'utf-8',
    input: JSON.stringify(payload),
    shell: false,
  });
}

const event = {
  tool_name: 'Bash',
  tool_use_id: 'toolu_duplicate_registration',
  session_id: 'session-dup',
  cwd: null,
  tool_input: { command: 'echo probe > /dev/null' },
};

// When both the plugin manifest and .claude/settings.json register the same hooks,
// Claude Code runs each PostToolUse hook twice for one tool call. Attribution must
// survive that: the second run must not report a missing snapshot for a write it
// already accounted for.
{
  const root = fixture();
  const payload = { ...event, cwd: root };

  assert.equal(hook(root, 'pre-write.mjs', payload).status, 0);
  assert.equal(hook(root, 'pre-write.mjs', payload).status, 0);

  const first = hook(root, 'post-write.mjs', payload);
  assert.equal(first.status, 0, `first post-write must pass; stderr=${first.stderr}`);

  const second = hook(root, 'post-write.mjs', payload);
  assert.equal(
    second.status,
    0,
    `duplicate post-write must not block on a consumed snapshot; stderr=${second.stderr}`,
  );
  assert.doesNotMatch(second.stderr, /EH-HOOK-SNAPSHOT-010/);

  fs.rmSync(root, { recursive: true, force: true });
}

// A genuinely unattributed Bash write — no pre-write snapshot at all — must still block.
{
  const root = fixture();
  const payload = { ...event, tool_use_id: 'toolu_never_snapshotted', cwd: root };
  const result = hook(root, 'post-write.mjs', payload);
  assert.equal(result.status, 2, 'missing snapshot must still block');
  assert.match(result.stderr, /EH-HOOK-SNAPSHOT-010/);
  fs.rmSync(root, { recursive: true, force: true });
}

// Consumed markers must not accumulate forever: they are pruned once stale.
{
  const root = fixture();
  const dir = path.join(root, '.git', 'enterprise-harness', 'hook-snapshots');
  fs.mkdirSync(dir, { recursive: true });
  const stale = path.join(dir, 'deadbeef.consumed');
  fs.writeFileSync(stale, '');
  const old = Date.now() - (48 * 60 * 60 * 1000);
  fs.utimesSync(stale, old / 1000, old / 1000);

  assert.equal(hook(root, 'pre-write.mjs', { ...event, tool_use_id: 'toolu_prune', cwd: root }).status, 0);
  assert.equal(fs.existsSync(stale), false, 'stale consumed marker must be pruned');
  fs.rmSync(root, { recursive: true, force: true });
}

console.log(`PASS duplicate-hook-registration ${process.argv[2] || 'verify'}`);
