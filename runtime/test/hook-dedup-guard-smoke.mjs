import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// When this repo is opened with the plugin also enabled, both the plugin manifest and
// .claude/settings.json register the same hooks and the host fires each one twice.
//
// The guard that used to live here (`test -z "$CLAUDE_PLUGIN_ROOT" && ... || true`)
// could never work: CLAUDE_PLUGIN_ROOT is injected per-plugin, and a settings.json hook
// belongs to no plugin, so the variable is always empty and the guard always passed.
// Dedup has to happen inside the hook scripts, keyed on the event identity that both
// channels observe alike.

const repoRoot = process.cwd();
const settings = JSON.parse(fs.readFileSync('.claude/settings.json', 'utf-8'));

const withDeadGuard = [];
for (const [event, entries] of Object.entries(settings.hooks || {})) {
  for (const entry of entries) {
    for (const hook of (entry.hooks || [])) {
      const cmd = String(hook.command || '');
      if (cmd.includes('CLAUDE_PLUGIN_ROOT')) {
        withDeadGuard.push(`${event}/${entry.matcher || '*'}: ${cmd.slice(0, 80)}`);
      }
    }
  }
}
assert.equal(
  withDeadGuard.length,
  0,
  `settings.json hooks must not rely on a CLAUDE_PLUGIN_ROOT guard (it is always empty there):\n${withDeadGuard.join('\n')}`,
);

// Every hook script reachable from settings.json must claim the event before acting,
// so a second channel firing the same event becomes a no-op.
const DEDUP_CALL = /\b(dedupGuard|sessionDedupGuard)\s*\(/u;
const EXEMPT = new Set([
  // Agent-lifecycle hooks are exempt because a second fire is already idempotent in
  // outcome: the ledger is append-only and every consumer resolves the latest event
  // per agentId, and the allow/block verdict is a pure function of that state. Adding a
  // marker-file guard here would instead risk skipping a real event in the chain.
  'pre-agent.mjs',
  'post-agent.mjs',
  'agent-failure.mjs',
  'subagent-start.mjs',
  'subagent-stop.mjs',
  'task-completed.mjs',
  // Creates a worktree keyed on a path that already exists after the first run.
  'worktree-create.mjs',
  // Removes a harness/ mirror; a second fire is idempotent (dir already gone).
  'worktree-remove.mjs',
]);

const scripts = new Set();
for (const entries of Object.values(settings.hooks || {})) {
  for (const entry of entries) {
    for (const hook of (entry.hooks || [])) {
      const match = /runtime\/hooks\/([\w-]+\.mjs)/u.exec(String(hook.command || ''));
      if (match) scripts.add(match[1]);
    }
  }
}
assert.ok(scripts.size > 0, 'no hook scripts found in settings.json');

const unguarded = [];
for (const script of scripts) {
  if (EXEMPT.has(script)) continue;
  // Dedup lives in the lib the hook delegates to; the hook file itself is a thin shell.
  const candidates = [
    path.join(repoRoot, 'runtime/hooks', script),
    path.join(repoRoot, 'runtime/lib/hooks', script),
  ];
  const sources = candidates
    .filter((file) => fs.existsSync(file))
    .map((file) => fs.readFileSync(file, 'utf-8'));
  if (!sources.some((source) => DEDUP_CALL.test(source))) unguarded.push(script);
}
assert.deepEqual(
  unguarded,
  [],
  `these hooks run twice under duplicate registration with no dedup guard: ${unguarded.join(', ')}`,
);

console.log(`PASS hook-dedup-guard ${process.argv[2] || 'verify'}`);
