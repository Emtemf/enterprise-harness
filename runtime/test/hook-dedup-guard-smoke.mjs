import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

// settings.json hooks must self-skip when CLAUDE_PLUGIN_ROOT is set (plugin is loaded),
// so that developing in the repo that doubles as a plugin doesn't run every hook twice.
// Without the guard, each PreToolUse/PostToolUse/SessionStart fires twice — once from
// the plugin manifest and once from .claude/settings.json.

const settingsPath = '.claude/settings.json';
const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));

let guardMissing = [];
for (const [event, entries] of Object.entries(settings.hooks || {})) {
  for (const entry of entries) {
    for (const hook of (entry.hooks || [])) {
      const cmd = String(hook.command || '');
      if (cmd.includes('CLAUDE_PROJECT_DIR') && !cmd.includes('CLAUDE_PLUGIN_ROOT')) {
        guardMissing.push(`${event}/${entry.matcher || '*'}: ${cmd.slice(0, 80)}`);
      }
    }
  }
}
assert.equal(guardMissing.length, 0, `hooks missing CLAUDE_PLUGIN_ROOT guard:\n${guardMissing.join('\n')}`);

// Each guarded command must exit 0 when CLAUDE_PLUGIN_ROOT is set (skip) and not crash.
const sample = settings.hooks?.PreToolUse?.[0]?.hooks?.[0]?.command;
assert.ok(sample, 'PreToolUse hook command not found');
const withPlugin = spawnSync('bash', ['-c', `export CLAUDE_PLUGIN_ROOT=/tmp; ${sample}`], {
  encoding: 'utf-8',
  shell: false,
});
assert.equal(withPlugin.status, 0, `guarded hook must exit 0 when plugin root is set; got ${withPlugin.status}`);

console.log(`PASS hook-dedup-guard ${process.argv[2] || 'verify'}`);
