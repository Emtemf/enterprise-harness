import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, 'harness', 'plugin', 'hooks-manifest.json'), 'utf-8'),
).hooks;
const projected = JSON.parse(
  fs.readFileSync(path.join(root, 'hooks', 'hooks.json'), 'utf-8'),
).hooks;

function manifestEntry(event, script, matcher = null) {
  return (manifest[event] || []).find((entry) => (
    entry.script === script && (matcher === null || entry.matcher === matcher)
  ));
}

function projectedEntry(event, script, matcher = null) {
  return (projected[event] || []).find((entry) => (
    entry.hooks?.some((hook) => hook.command.endsWith(`/hooks/scripts/${script}\"`))
      && (matcher === null || entry.matcher === matcher)
  ));
}

for (const expected of [
  ['PreToolUse', 'pre-agent.mjs', 'Agent'],
  ['PostToolUse', 'post-agent.mjs', 'Agent'],
  ['SubagentStart', 'subagent-start.mjs', null],
  ['SubagentStop', 'subagent-stop.mjs', null],
]) {
  const [event, script, matcher] = expected;
  assert.ok(manifestEntry(event, script, matcher), `manifest missing ${event} -> ${script}`);
  assert.ok(projectedEntry(event, script, matcher), `projection missing ${event} -> ${script}`);
}

console.log(`PASS agent-lifecycle-hook-projection ${mode}`);
