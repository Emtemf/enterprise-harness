import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHandoffV2 } from '../core/handoff-v2.mjs';

const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const sourceRoot = fileURLToPath(new URL('../../', import.meta.url));
const finalize = path.join(sourceRoot, 'skills', 'verify', 'scripts', 'finalize-result.mjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-verify-skill-'));
const changeId = 'verify-slice';
const changeDir = path.join(root, 'harness', 'changes', changeId);
const validationRef = `harness/changes/${changeId}/validation.md`;

try {
  fs.mkdirSync(changeDir, { recursive: true });
  fs.writeFileSync(path.join(root, validationRef), [
    '# Validation',
    '## Commands',
    '- node --test',
    '## Results',
    '- pass',
    '## Freshness',
    '- current input digest',
    '## Coverage and exceptions',
    '- N/A: no API change',
  ].join('\n'));
  const handoff = createHandoffV2(root, {
    changeId,
    stage: 'verify',
    behavior: 'verify.collect',
    agent: { type: 'enterprise-harness:artifact-worker', skill: 'verify' },
    inputRefs: [validationRef],
    tecpc: { target: 'verify slice', evidence: [validationRef], context: [validationRef], path: validationRef, correction: null },
  });
  const passed = spawnSync(process.execPath, [finalize, changeId, handoff.runId], { cwd: root, encoding: 'utf-8', shell: false });
  assert.equal(passed.status, 0, passed.stderr);
  assert.equal(JSON.parse(passed.stdout).status, 'pass');

  fs.writeFileSync(path.join(root, validationRef), '# Validation\n## Commands\n');
  const rejected = spawnSync(process.execPath, [finalize, changeId, handoff.runId], { cwd: root, encoding: 'utf-8', shell: false });
  assert.notEqual(rejected.status, 0, 'incomplete validation must not finalize');

  console.log(`PASS verify-skill-script ${mode}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
