import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHandoffV2, persistHandoffV2Result, v2ResultPath } from '../core/handoff-v2.mjs';
import { bindLatestPromptReceipt, recordPromptReceipt } from '../lib/prompt-receipts.mjs';
import { appendCompletedHandoffBinding } from './handoff-binding-fixture.mjs';

const mode = process.argv[2] || 'verify';
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);
const cli = fileURLToPath(new URL('../cli.mjs', import.meta.url));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-clarify-research-close-'));
const changeId = 'research-close';
const changeDir = path.join(root, 'harness', 'changes', changeId);
const requirementsRef = `harness/changes/${changeId}/requirements.md`;
const briefRef = `harness/changes/${changeId}/research/code-brief.md`;

function run(...args) {
  return spawnSync(process.execPath, [cli, 'clarify', ...args], { cwd: root, encoding: 'utf-8', shell: false });
}

try {
  spawnSync('git', ['init', '--quiet'], { cwd: root, shell: false });
  fs.mkdirSync(path.join(root, path.dirname(briefRef)), { recursive: true });
  fs.writeFileSync(path.join(root, briefRef), '# Code brief\n\n确认订单取消涉及的代码边界。\n');
  fs.mkdirSync(changeDir, { recursive: true });
  fs.writeFileSync(path.join(changeDir, 'state.json'), `${JSON.stringify({
    schemaVersion: 6, revision: 1, changeId, lifecycle: 'active', stage: 'clarify',
    artifacts: { classification: null }, validation: { status: 'missing', digest: null, validatedAt: null },
  }, null, 2)}\n`);
  fs.writeFileSync(path.join(root, requirementsRef), [
    '# Requirements（research seed）', '', '## 目标与验收', '', '### 原始需求',
    '给现有订单服务增加取消能力。', '', '### 澄清后的目标',
    '> fact gate pending；等待 ResearchPacket 后建立 topology、评分与验收。', '',
    '## 事实探索门禁', '',
    '| Lane | Required | Brief ref | RunId | Packet ref | Status | Authority / fallback |',
    '|---|---|---|---|---|---|---|',
    `| code | yes | ${briefRef} | | | pending | codegraph-first |`,
    '| docs | no | none | none | none | not-required | 不涉及外部版本化契约。 |', '',
    '- fact gate complete：false', '- remaining fact uncertainty：pending', '',
  ].join('\n'));
  recordPromptReceipt(root, { session_id: 'research-close-session', prompt: '给现有订单服务增加取消能力。' });
  bindLatestPromptReceipt(root, changeId, 'research-close-session');

  const laneSync = run('sync-lanes', changeId);
  assert.equal(laneSync.status, 0, laneSync.stderr);
  const prematureSources = run('synthesis-sources', changeId);
  assert.equal(prematureSources.status, 2);
  assert.match(prematureSources.stderr, /EH-CLARIFY-SOURCES-169/u);
  const handoff = createHandoffV2(root, {
    changeId, stage: 'clarify', behavior: 'clarify.explore-code',
    agent: { type: 'enterprise-harness:code-explore', skill: 'explore-code' }, inputRefs: [briefRef],
    tecpc: { target: '确认代码边界', evidence: [briefRef], context: [briefRef], path: briefRef, correction: null },
  });
  persistHandoffV2Result(root, changeId, handoff.runId, {
    packetVersion: 1, type: 'research-packet', changeId, source: 'code-explore',
    question: '哪些代码负责订单取消？', scope: ['src/main/java/com/acme/OrderService.java'],
    facts: [{ claim: 'OrderService 是当前订单行为入口。', sources: [briefRef] }],
    uncertainties: [], authority: 'codegraph-first', fallback: null, degraded: false,
    recommendedDecision: null, inputRefs: [...handoff.input.inputRefs],
    inputDigests: { ...handoff.input.inputDigests }, collectedAt: '2026-09-08T00:00:00.000Z',
  });
  appendCompletedHandoffBinding(root, changeId, handoff.input, { agentId: 'code-researcher' });

  const closed = run('close-research', changeId, handoff.runId);
  assert.equal(closed.status, 0, closed.stderr);
  const output = JSON.parse(closed.stdout);
  assert.deepEqual(output.runIds, [handoff.runId]);
  const requirements = fs.readFileSync(path.join(root, requirementsRef), 'utf-8');
  const packetRef = path.relative(root, v2ResultPath(root, changeId, handoff.runId)).split(path.sep).join('/');
  assert.match(requirements, new RegExp(`\\| code \\| yes \\| ${briefRef.replaceAll('/', '\\/')} \\| ${handoff.runId} \\| ${packetRef.replaceAll('/', '\\/')} \\| complete \\|`, 'u'));
  assert.match(requirements, /## 组件拓扑/u, 'close-research must expand the seed into the full requirements template');
  assert.match(requirements, /fact gate complete：true/iu);
  assert.match(requirements, /remaining fact uncertainty： none/iu);

  const sources = run('synthesis-sources', changeId, '--json');
  assert.equal(sources.status, 0, sources.stderr);
  assert.deepEqual(JSON.parse(sources.stdout).sources.map(({ kind, locator, claim }) => ({ kind, locator, claim })), [
    { kind: 'raw-request', locator: 'original-request', claim: '给现有订单服务增加取消能力' },
    { kind: 'research-packet', locator: 'fact:code', claim: 'OrderService 是当前订单行为入口。' },
  ]);
  fs.appendFileSync(path.join(root, requirementsRef), '\n<!-- Phase 2 synthesis changed downstream requirements only. -->\n');
  const sourcesAfterSynthesis = run('synthesis-sources', changeId, '--json');
  assert.equal(
    sourcesAfterSynthesis.status,
    0,
    `downstream synthesis must not stale the closed Phase 1 research authority: ${sourcesAfterSynthesis.stderr}`,
  );
  const stableLaneReplay = run('sync-lanes', changeId, '--json');
  assert.equal(stableLaneReplay.status, 0, stableLaneReplay.stderr);
  assert.ok(JSON.parse(stableLaneReplay.stdout).events.every(({ duplicate }) => duplicate === true));
  const unsafeSources = run('synthesis-sources', '../escape');
  assert.equal(unsafeSources.status, 2);
  assert.match(unsafeSources.stderr, /EH-PATH-001/u);

  const replay = run('close-research', changeId, handoff.runId);
  assert.equal(replay.status, 0, replay.stderr);
  console.log(`PASS clarify-research-close ${mode}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
