import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { sha256Artifact } from '../lib/result-contract.mjs';
import { bindLatestPromptReceipt, recordPromptReceipt } from '../lib/prompt-receipts.mjs';

const mode = process.argv[2] || 'verify';
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);
const cli = fileURLToPath(new URL('../cli.mjs', import.meta.url));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-lane-handoff-gate-'));
const changeId = 'handoff-lane-gate';
const requirementsRef = `harness/changes/${changeId}/requirements.md`;
const inputRef = `harness/changes/${changeId}/evidence/clarify/lane-applicability-input.json`;

function run(...args) {
  return spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf-8', shell: false });
}

function writeJson(ref, value) {
  const target = path.join(root, ref);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
}

try {
  spawnSync('git', ['init', '--quiet'], { cwd: root, shell: false });
  writeJson(`harness/changes/${changeId}/state.json`, {
    schemaVersion: 6, revision: 1, changeId, lifecycle: 'active', stage: 'clarify',
    artifacts: { classification: null }, validation: { status: 'missing', digest: null, validatedAt: null },
  });
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, requirementsRef), [
    '# Requirements', '', '## 目标与验收', '### 原始需求', '给订单服务增加取消能力',
    '### 澄清后的目标', '待探索。', '', '## 事实探索门禁',
    '| Lane | Required | Brief ref | RunId | Packet ref | Status | Authority / fallback |',
    '|---|---|---|---|---|---|---|',
    '| code | yes | | | | pending | codegraph-first |',
    '| docs | no | | | | not-required | 不涉及外部版本化契约。 |',
  ].join('\n'));
  recordPromptReceipt(root, { session_id: 'handoff-lane-session', prompt: '给订单服务增加取消能力' });
  bindLatestPromptReceipt(root, changeId, 'handoff-lane-session');

  const fake = run('handoff', 'create', changeId, 'clarify', 'clarify.explore-code', 'execute', '--input-ref', requirementsRef);
  assert.equal(fake.status, 2);
  assert.match(`${fake.stdout}\n${fake.stderr}`, /EH-LANE-DISPATCH-159/u);

  writeJson(inputRef, {
    inputVersion: 1, type: 'lane-applicability-input', changeId, requirementsRef,
    requirementsDigest: sha256Artifact(root, requirementsRef),
    lanes: {
      code: { selectedOption: 'required', publicRationale: '仓库行为在范围内。', evidenceRefs: [requirementsRef] },
      docs: { selectedOption: 'not-required', publicRationale: '不涉及外部版本化契约。', evidenceRefs: [requirementsRef] },
    },
  });
  const lanes = run('clarify', 'record-lanes', changeId, inputRef);
  assert.equal(lanes.status, 0, lanes.stderr);

  const code = run('handoff', 'create', changeId, 'clarify', 'clarify.explore-code', 'execute', '--input-ref', requirementsRef);
  assert.equal(code.status, 0, code.stderr);
  assert.match(code.stdout, /HANDOFF_INPUT=/u);

  const docs = run('handoff', 'create', changeId, 'clarify', 'clarify.research-docs', 'execute', '--input-ref', requirementsRef);
  assert.equal(docs.status, 2);
  assert.match(`${docs.stdout}\n${docs.stderr}`, /EH-LANE-DISPATCH-159/u);

  console.log(`PASS clarify-lane-handoff-gate ${mode}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
