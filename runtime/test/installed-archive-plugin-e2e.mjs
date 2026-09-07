import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { archiveManifestInputRefs, validateArchivedManifest, validateArchiveManifest } from '../api/archive.mjs';
import { createHandoffV2, v2ResultPath } from '../core/handoff-v2.mjs';
import { sha256Artifact } from '../lib/result-contract.mjs';
import { packInstalledPlugin } from './installed-plugin-fixture.mjs';
import { writeCanonicalCompoundDesignFixture } from './design-proof-fixture.mjs';
import { writeCanonicalVerifyCompletionFixture } from './verify-completion-fixture.mjs';

const mode = process.argv[2];
if (!['verify', 'e2e'].includes(mode)) process.exit(2);
const pluginRoot = fileURLToPath(new URL('../../', import.meta.url));
const installed = packInstalledPlugin(pluginRoot);
const { packedRoot } = installed;
const packedSkill = fs.readFileSync(path.join(packedRoot, 'skills', 'archive', 'SKILL.md'), 'utf-8');
assert.match(packedSkill, /^context: fork$/mu);
assert.match(packedSkill, /^agent: enterprise-harness:artifact-worker$/mu);
assert.match(packedSkill, /^model: inherit$/mu);
assert.doesNotMatch(packedSkill, /^background:/mu);
for (const relative of [
  'skills/archive/scripts/prepare-input.mjs',
  'skills/archive/scripts/finalize-result.mjs',
  'skills/archive/references/method.md',
  'skills/archive/references/artifact-contract.md',
  'skills/archive/references/self-check.md',
  'skills/archive/references/examples.md',
  'skills/review/references/archive.md',
]) assert.ok(fs.existsSync(path.join(packedRoot, relative)), `packed Archive asset missing: ${relative}`);

if (mode !== 'e2e' || process.env.EH_RUN_CLAUDE_ARCHIVE_E2E !== 'true') {
  fs.rmSync(installed.packDir, { recursive: true, force: true });
  console.log('SKIP installed Archive Claude E2E (packaged fork and lineage wiring verified; run with: EH_RUN_CLAUDE_ARCHIVE_E2E=true node runtime/test/installed-archive-plugin-e2e.mjs e2e)');
  process.exit(0);
}

const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-installed-archive-e2e-'));
const keepFixture = process.env.EH_KEEP_CLAUDE_E2E === 'true';
let output = '';

try {
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: fixture, shell: false }).status, 0);
  fs.writeFileSync(path.join(fixture, 'CLAUDE.md'), [
    '# Fixture contract', '',
    '- 只处理当前 Archive handoff，不修改产品文件。',
    '- 必须运行 Archive prepare/finalizer，StageResult 后停止并等待独立 review。', '',
  ].join('\n'));
  const changeId = 'archive-standard-sample';
  const base = `harness/changes/${changeId}`;
  writeCanonicalCompoundDesignFixture(fixture, changeId, { stateStage: 'verify' });
  const verify = writeCanonicalVerifyCompletionFixture(fixture, changeId);
  const statePath = path.join(fixture, base, 'state.json');
  const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
  fs.writeFileSync(statePath, `${JSON.stringify({
    ...state,
    revision: state.revision + 1,
    stage: 'archive',
    validation: { status: 'fresh', digest: sha256Artifact(fixture, verify.validationRef), validatedAt: '2026-09-06T00:00:00.000Z' },
  }, null, 2)}\n`);
  fs.writeFileSync(path.join(fixture, 'harness', 'ACTIVE_CHANGE'), `${changeId}\n`);
  const inputRefs = Object.values(archiveManifestInputRefs(changeId));
  const archiveHandoff = createHandoffV2(fixture, {
    changeId, stage: 'archive', behavior: 'archive',
    agent: { type: 'enterprise-harness:artifact-worker', skill: 'archive' }, inputRefs,
    tecpc: {
      target: '封存标准样例从 Clarify 决策到 Verify 的完整证据链',
      evidence: [verify.validationRef, verify.verifyProofRef], context: inputRefs,
      path: `${verify.verifyProofRef} -> archive manifest and attestation`, correction: null,
    },
  });
  const modelArgs = process.env.EH_CLAUDE_E2E_MODEL ? ['--model', process.env.EH_CLAUDE_E2E_MODEL] : [];
  const projectRef = (target) => path.relative(fixture, target).split(path.sep).join('/');

  function runForkedSkill(skill, handoff, instruction, budget = '4') {
    const marker = `HANDOFF_INPUT=${projectRef(handoff.path)}`;
    const child = spawnSync('claude', [
      '--plugin-dir', packedRoot, ...modelArgs,
      '--max-budget-usd', process.env.EH_CLAUDE_ARCHIVE_E2E_BUDGET || budget,
      '--permission-mode', 'bypassPermissions', '--output-format', 'json', '--print',
      `先用 Bash 原样运行 node "${packedRoot}/runtime/cli.mjs" sessions bind "$ENTERPRISE_HARNESS_SESSION_ID" ${changeId} "$PWD" installed-e2e 绑定当前真实 session，不做其他诊断。成功后调用 enterprise-harness:${skill} Skill，参数必须原样且只有 ${marker}。${instruction}`,
    ], { cwd: fixture, encoding: 'utf-8', shell: false, timeout: 900_000 });
    const text = `${child.stdout || ''}\n${child.stderr || ''}`.trim();
    output = `${output}\n${text}`.trim();
    assert.equal(child.status, 0, text);
  }

  runForkedSkill('archive', archiveHandoff,
    '严格运行 marker prepare；只用 Read 读取全部 Archive references 和 frozen inputs，禁止用 Bash cat/ls/find 探查；prepare 成功后必须运行 exact finalizer 原子持久化 StageResult，不能手工拼结果。成功后停止，不调用 handoff persist、review 或 archive-finalize。');
  const archiveResultPath = v2ResultPath(fixture, changeId, archiveHandoff.runId);
  assert.ok(fs.existsSync(archiveResultPath), `Archive Skill must persist StageResult\nfixture=${fixture}\n${output}`);
  const archiveResult = JSON.parse(fs.readFileSync(archiveResultPath, 'utf-8'));
  assert.equal(archiveResult.status, 'pass');
  assert.deepEqual(archiveResult.producer, { agentType: 'enterprise-harness:artifact-worker', skill: 'archive' });
  assert.deepEqual(validateArchiveManifest(fixture, changeId, {
    expectedArchiveRunId: archiveHandoff.runId,
    expectedInputDigests: archiveHandoff.input.inputDigests,
  }), []);

  const resultRef = projectRef(archiveResultPath);
  const reviewHandoff = createHandoffV2(fixture, {
    changeId, stage: 'archive', behavior: 'review', role: 'check', parentRunId: archiveHandoff.runId,
    agent: { type: 'enterprise-harness:reviewer', skill: 'review' },
    inputRefs: [...archiveResult.artifacts.map(({ path: ref }) => ref), resultRef], rubricIds: ['archive'],
    tecpc: {
      target: '独立审查归档 lineage、runtime provenance 与物理移动前置条件',
      evidence: [resultRef, `${base}/evidence/archive-manifest.json`, `${base}/evidence/archive-manifest-attestation.json`],
      context: inputRefs, path: `${resultRef} -> independent archive review`, correction: null,
    },
  });
  runForkedSkill('review', reviewHandoff,
    '只读冻结输入并执行 archive rubric；确认 lineage 和 runtime provenance 完整后运行 Review finalizer 持久化 pass，不能编辑制品或执行 archive-finalize。');
  const review = JSON.parse(fs.readFileSync(v2ResultPath(fixture, changeId, reviewHandoff.runId, 'check'), 'utf-8'));
  assert.equal(review.verdict, 'pass');
  assert.deepEqual(review.rubricIds, ['archive']);

  const runtimeEnv = { ...process.env };
  delete runtimeEnv.ENTERPRISE_HARNESS_SESSION_ID;
  delete runtimeEnv.CLAUDE_SESSION_ID;
  const finalized = spawnSync(process.execPath, [path.join(packedRoot, 'runtime', 'cli.mjs'), 'lifecycle', 'archive-finalize', changeId], {
    cwd: fixture, encoding: 'utf-8', shell: false, env: runtimeEnv,
  });
  assert.equal(finalized.status, 0, `${finalized.stdout || ''}\n${finalized.stderr || ''}`);
  assert.equal(fs.existsSync(path.join(fixture, base)), false);
  const archivedBase = `harness/archive/${changeId}`;
  assert.equal(JSON.parse(fs.readFileSync(path.join(fixture, archivedBase, 'state.json'), 'utf-8')).lifecycle, 'archived');
  assert.ok(fs.existsSync(path.join(fixture, archivedBase, 'evidence', 'completion', 'archive.json')));
  assert.deepEqual(validateArchivedManifest(fixture, changeId), [],
    'installed Archive output must verify from the moved directory without source or .git receipts');
  assert.equal(fs.existsSync(path.join(fixture, 'harness', 'ACTIVE_CHANGE')), false);

  const events = fs.readFileSync(path.join(fixture, '.git', 'enterprise-harness', 'receipts', changeId, 'agent-events.jsonl'), 'utf-8')
    .trim().split(/\r?\n/u).map(JSON.parse);
  for (const [runId, skill, agentType] of [
    [archiveHandoff.runId, 'archive', 'enterprise-harness:artifact-worker'],
    [reviewHandoff.runId, 'review', 'enterprise-harness:reviewer'],
  ]) {
    assert.ok(events.some((event) => event.kind === 'dispatch' && event.runId === runId && event.preloadedSkill === skill));
    assert.ok(events.some((event) => event.kind === 'stop' && event.runId === runId && event.observedAgentType === agentType));
    assert.ok(events.some((event) => event.kind === 'dispatch-binding' && event.runId === runId));
  }
  console.log('PASS installed Archive Claude E2E');
} finally {
  fs.rmSync(installed.packDir, { recursive: true, force: true });
  if (keepFixture) console.error(`PRESERVE installed Archive E2E fixture: ${fixture}`);
  else fs.rmSync(fixture, { recursive: true, force: true });
}
