import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readDecisionEvents } from '../core/decision-ledger.mjs';
import { sha256Artifact } from '../lib/result-contract.mjs';
import { bindLatestPromptReceipt, recordPromptReceipt } from '../lib/prompt-receipts.mjs';

const mode = process.argv[2] || 'verify';
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);
const cli = fileURLToPath(new URL('../cli.mjs', import.meta.url));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-clarify-lanes-'));
const changeId = 'lane-cli';
const requirementsRef = `harness/changes/${changeId}/requirements.md`;
const inputRef = `harness/changes/${changeId}/evidence/clarify/lane-applicability-input.json`;

function run(...args) {
  return spawnSync(process.execPath, [cli, 'clarify', ...args], { cwd: root, encoding: 'utf-8', shell: false });
}

function writeJson(ref, value) {
  const target = path.join(root, ref);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
}

function input(overrides = {}) {
  return {
    inputVersion: 1,
    type: 'lane-applicability-input',
    changeId,
    requirementsRef,
    requirementsDigest: sha256Artifact(root, requirementsRef),
    lanes: {
      code: {
        selectedOption: 'required',
        publicRationale: '现有仓库行为在范围内。',
        evidenceRefs: [requirementsRef],
      },
      docs: {
        selectedOption: 'not-required',
        publicRationale: '不涉及外部版本化契约。',
        evidenceRefs: [requirementsRef],
      },
    },
    ...overrides,
  };
}

try {
  spawnSync('git', ['init', '--quiet'], { cwd: root, shell: false });
  writeJson(`harness/changes/${changeId}/state.json`, {
    schemaVersion: 6,
    revision: 1,
    changeId,
    lifecycle: 'active',
    stage: 'clarify',
    artifacts: { classification: null },
    validation: { status: 'missing', digest: null, validatedAt: null },
  });
  const requirementsPath = path.join(root, requirementsRef);
  fs.writeFileSync(requirementsPath, [
    '# Requirements', '', '## 目标与验收', '### 原始需求',
    '给现有订单服务增加取消能力', '### 澄清后的目标', '待探索。', '',
    '## 事实探索门禁',
    '| Lane | Required | Brief ref | RunId | Packet ref | Status | Authority / fallback |',
    '|---|---|---|---|---|---|---|',
    '| code | yes | | | | pending | codegraph-first |',
    '| docs | no | | | | not-required | 不涉及外部版本化契约。 |',
  ].join('\n'));
  recordPromptReceipt(root, { session_id: 'lane-cli-session', prompt: '给现有订单服务增加取消能力' });
  bindLatestPromptReceipt(root, changeId, 'lane-cli-session');
  writeJson(inputRef, input());

  const recorded = run('record-lanes', changeId, inputRef);
  assert.equal(recorded.status, 0, recorded.stderr);
  const output = JSON.parse(recorded.stdout);
  assert.equal(output.requirementsDigest, sha256Artifact(root, requirementsRef));
  assert.deepEqual(output.events.map(({ lane }) => lane), ['code', 'docs']);
  assert.equal(new Set(output.events.map(({ eventId }) => eventId)).size, 2);
  assert.deepEqual(readDecisionEvents(root, changeId).map(({ selectedOption }) => selectedOption), ['required', 'not-required']);

  const replay = run('record-lanes', changeId, inputRef);
  assert.equal(replay.status, 0, replay.stderr);
  assert.ok(JSON.parse(replay.stdout).events.every(({ duplicate }) => duplicate));
  assert.equal(readDecisionEvents(root, changeId).length, 2);

  fs.appendFileSync(requirementsPath, '\nchanged revision\n');
  const stale = run('record-lanes', changeId, inputRef);
  assert.equal(stale.status, 2);
  assert.match(stale.stderr, /EH-LANE-STALE-157/u);

  writeJson(inputRef, input({ requirementsDigest: sha256Artifact(root, requirementsRef) }));
  const rebound = run('record-lanes', changeId, inputRef);
  assert.equal(rebound.status, 0, rebound.stderr);
  assert.equal(readDecisionEvents(root, changeId).length, 4);

  const unsafe = run('record-lanes', changeId, '../escape.json');
  assert.equal(unsafe.status, 2);
  assert.match(unsafe.stderr, /EH-PATH-001/u);

  const invalid = input({ unexpected: true });
  writeJson(inputRef, invalid);
  const unknown = run('record-lanes', changeId, inputRef);
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /EH-LANE-INPUT-156/u);

  console.log(`PASS clarify-lane-cli ${mode}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
