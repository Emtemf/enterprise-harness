import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHandoffV2 } from '../core/handoff-v2.mjs';

const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'enterprise-harness-v2-cli-validate-'));
const changeId = 'v2-cli-validate';
const inputRef = `harness/changes/${changeId}/research/code-brief.md`;

function validate(inputPath, resultPath) {
  return spawnSync(process.execPath, [
    path.join(sourceRoot, 'runtime', 'cli.mjs'),
    'handoff',
    'validate',
    path.relative(root, inputPath),
    path.relative(root, resultPath),
  ], { cwd: root, encoding: 'utf-8', shell: false });
}

try {
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: root, shell: false }).status, 0);
  fs.mkdirSync(path.join(root, path.dirname(inputRef)), { recursive: true });
  fs.writeFileSync(path.join(root, inputRef), '# Code research brief\n');
  const handoff = createHandoffV2(root, {
    changeId,
    stage: 'clarify',
    behavior: 'clarify.explore-code',
    agent: { type: 'enterprise-harness:code-explore', skill: 'explore-code' },
    inputRefs: [inputRef],
    tecpc: {
      target: 'Validate v2 ResearchPacket through the public CLI',
      evidence: [inputRef],
      context: [inputRef],
      path: 'v2 CLI validation',
      correction: null,
    },
  });
  const packet = {
    packetVersion: 1,
    type: 'research-packet',
    changeId,
    source: 'code-explore',
    question: 'Does the public CLI understand v2 ResearchPacket results?',
    scope: ['runtime handoff validation'],
    facts: [{ claim: 'The fixture binds a v2 research handoff.', sources: [inputRef] }],
    uncertainties: [],
    authority: 'codegraph-first',
    fallback: null,
    degraded: false,
    recommendedDecision: null,
    inputRefs: [...handoff.input.inputRefs],
    inputDigests: { ...handoff.input.inputDigests },
    collectedAt: '2026-08-31T00:00:00.000Z',
  };
  const resultPath = path.join(root, 'valid-result.json');
  fs.writeFileSync(resultPath, `${JSON.stringify(packet, null, 2)}\n`);

  const valid = validate(handoff.path, resultPath);
  assert.equal(valid.status, 0, valid.stderr || valid.stdout);
  assert.match(valid.stdout, /PASS handoff contract/u);

  const invalidPath = path.join(root, 'invalid-result.json');
  fs.writeFileSync(invalidPath, `${JSON.stringify({ ...packet, confidence: 'high' }, null, 2)}\n`);
  const invalid = validate(handoff.path, invalidPath);
  assert.equal(invalid.status, 2, invalid.stderr || invalid.stdout);
  assert.match(`${invalid.stdout}\n${invalid.stderr}`, /unknown property confidence/u);

  console.log(`PASS handoff-v2-cli-validate ${mode}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
