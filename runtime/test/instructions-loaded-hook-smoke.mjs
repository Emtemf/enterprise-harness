import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readInstructionLoads } from '../lib/instruction-load-observations.mjs';

const mode = process.argv[2] || 'verify';
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);
const sourceRoot = fileURLToPath(new URL('../../', import.meta.url));
const hook = path.join(sourceRoot, 'hooks/scripts/instructions-loaded.mjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'enterprise-harness-instructions-loaded-'));

function run(input) {
  return spawnSync(process.execPath, [hook], { cwd: root, input, encoding: 'utf-8', shell: false });
}

try {
  spawnSync('git', ['init', '-q'], { cwd: root, shell: false });
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), '# Claude instructions\n\n@AGENTS.md\n', 'utf-8');
  const event = {
    hook_event_name: 'InstructionsLoaded',
    session_id: 'session-1',
    cwd: root,
    file_path: path.join(root, 'CLAUDE.md'),
    memory_type: 'Project',
    load_reason: 'startup',
    globs: [],
  };
  const started = Date.now();
  assert.equal(run(JSON.stringify(event)).status, 0);
  assert.ok(Date.now() - started < 1000, 'observability hook must remain lightweight');
  assert.equal(run(JSON.stringify(event)).status, 0);
  const loads = readInstructionLoads(root);
  assert.equal(loads.length, 1, 'same InstructionsLoaded event must deduplicate');
  assert.equal(loads[0].filePath, 'CLAUDE.md');
  assert.match(loads[0].fileDigest, /^[a-f0-9]{64}$/u);
  assert.equal(Object.hasOwn(loads[0], 'content'), false, 'instruction content must not be recorded');

  const outside = path.join(os.tmpdir(), 'outside-instructions.md');
  fs.writeFileSync(outside, 'outside\n', 'utf-8');
  assert.equal(run(JSON.stringify({ ...event, file_path: outside })).status, 0);
  assert.equal(readInstructionLoads(root).length, 1, 'outside-project instructions must be ignored');
  fs.rmSync(outside, { force: true });

  const malformed = run('{not-json}');
  assert.equal(malformed.status, 0, 'InstructionsLoaded hook is fail-open');
  assert.match(malformed.stderr, /EH-INSTRUCTION-OBSERVE-165/u);
  console.log(`PASS instructions-loaded-hook ${mode}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
