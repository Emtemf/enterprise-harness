import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// v0.5 Controller/Subject isolation: .claude/settings.json must NOT contain
// governance hooks. The candidate tree must not self-govern. Governance hooks
// belong exclusively in the plugin's hooks/hooks.json.

const repoRoot = process.cwd();
const settings = JSON.parse(fs.readFileSync('.claude/settings.json', 'utf-8'));

// settings.json must have no hooks at all
assert.equal(
  settings.hooks,
  undefined,
  '.claude/settings.json must not contain governance hooks (Controller/Subject isolation)',
);

// settings.json must still carry project-level config
assert.ok(settings.env?.CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH, 'settings.json must carry spawn depth env');
assert.equal(settings.worktree?.baseRef, 'head', 'settings.json must carry worktree.baseRef=head');

// Plugin hooks.json: every non-exempt hook must still have a dedup guard
const hooksJson = JSON.parse(fs.readFileSync('hooks/hooks.json', 'utf-8'));
const DEDUP_CALL = /\b(dedupGuard|sessionDedupGuard)\s*\(/u;
const EXEMPT = new Set([
  'pre-agent.mjs', 'post-agent.mjs', 'agent-failure.mjs',
  'subagent-start.mjs', 'subagent-stop.mjs', 'task-completed.mjs',
  // Clarify question runtime authorization/resolution is itself retry-safe. A
  // pre-runtime marker would incorrectly turn a denied or failed same-ID retry
  // into an allow, so these adapters deliberately do not use dedupGuard.
  'pre-question.mjs', 'post-question.mjs',
]);

const scripts = new Set();
for (const entries of Object.values(hooksJson.hooks || {})) {
  for (const entry of entries) {
    for (const hook of (entry.hooks || [])) {
      const match = /hooks\/scripts\/([\w-]+\.mjs)/u.exec(String(hook.command || ''));
      if (match) scripts.add(match[1]);
    }
  }
}
assert.ok(scripts.size > 0, 'no hook scripts found in hooks.json');

const unguarded = [];
for (const script of scripts) {
  if (EXEMPT.has(script)) continue;
  const candidates = [
    path.join(repoRoot, 'hooks/scripts', script),
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
  `these plugin hooks have no dedup guard: ${unguarded.join(', ')}`,
);

console.log(`PASS hook-dedup-guard ${process.argv[2] || 'verify'}`);
