import fs from 'node:fs';
import path from 'node:path';
import { validateCompletionPredicate } from './lib/checks.mjs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { computeValidationDigest } from './lib/checks.mjs';
import { renderTECPCCard } from './lib/tecp-card.mjs';
import { buildWorkflowResult } from './lib/workflow.mjs';
import { assertSafeId, resolveChild, safeSlug } from './lib/safe-paths.mjs';
import { listSessions, readSession, sessionIdFromEnv, unbindSession } from './lib/sessions.mjs';
import { loadActiveChange } from './lib/gates.mjs';
import { evaluateHookHealth } from './lib/hook-health.mjs';
import { updateChangeState } from './core/change-state.mjs';
import {
  requiredStageResultArtifacts,
  resolveStageCompletionProof,
} from './lib/stage-results.mjs';
import { atomicWriteJson } from './lib/state-store.mjs';
import { assertForwardTransition } from './core/stage-transition.mjs';
import { saveChangeState, statePath as statePathFor } from './core/lifecycle-state.mjs';
import {
  readClassificationArtifact,
  replaceClassificationArtifact,
  writeClassificationArtifact,
} from './core/classification-artifact.mjs';

const repoRoot = process.cwd();
const runtimeDir = path.dirname(fileURLToPath(import.meta.url));
const templatesDir = path.join(runtimeDir, '..', 'harness', 'templates');
const changesDir = path.join(repoRoot, 'harness', 'changes');
const activeFile = path.join(repoRoot, 'harness', 'ACTIVE_CHANGE');

function printTECPCCard(root, changeId) {
  const statePath = path.join(changePath(changeId), 'state.json');
  if (!fs.existsSync(statePath)) return;
  try {
    const data = readJson(statePath);
    console.log(renderTECPCCard(root, changeId, data, {
      workflowResult: buildWorkflowResult(root, changeId, data),
    }));
  } catch (error) {
    console.error(`WARN EH-LIFECYCLE-TECP-019 ${error.message}`);
  }
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

function ensureChangeDir(changeId) {
  const changeDir = changePath(changeId);
  fs.mkdirSync(path.join(changeDir, 'evidence'), { recursive: true });
  fs.mkdirSync(path.join(changeDir, 'specs'), { recursive: true });
  fs.mkdirSync(path.join(changeDir, 'reviews'), { recursive: true });
  return changeDir;
}

function changePath(changeId) {
  assertSafeId(changeId, 'changeId');
  return resolveChild(changesDir, changeId, 'changeId');
}

function cmdScaffold(changeId, owner = 'harness-governance', tier = 'L1', topic = '') {
  const changeDir = ensureChangeDir(changeId);
  const statePath = path.join(changeDir, 'state.json');
  if (!fs.existsSync(statePath)) {
    const data = readJson(path.join(templatesDir, 'state.json'));
    data.changeId = changeId;
    data.owner = owner;
    if (topic && topic !== '-' && topic !== 'none') {
      data.goal = topic;
    }
    data.artifacts = {
      ...data.artifacts,
      classification: writeClassificationArtifact(repoRoot, changeId, {
        tier,
        impact: {
          api: 'unknown',
          data: 'unknown',
          architecture: 'unknown',
          rule: 'unknown',
          security: 'unknown',
        },
        requiredReviews: ['requirements'],
      }),
    };
    writeJson(statePath, data);
  }
  const files = [
    ['change.md', 'change.md'],
    ['tooling-evidence.md', path.join('evidence', 'tooling.md')],
  ];
  for (const [template, rel] of files) {
    const target = path.join(changeDir, rel);
    if (!fs.existsSync(target)) {
      fs.copyFileSync(path.join(templatesDir, template), target);
    }
  }
  // validation.md moved to skill assets; scaffold from there
  const validationTarget = path.join(changeDir, 'validation.md');
  if (!fs.existsSync(validationTarget)) {
    const validationTemplate = path.join(runtimeDir, '..', 'skills', 'verify', 'assets', 'validation.md.tmpl');
    if (fs.existsSync(validationTemplate)) {
      fs.copyFileSync(validationTemplate, validationTarget);
    }
  }

  const guideTarget = path.join(changeDir, 'GUIDE.md');
  if (fs.existsSync(guideTarget)) fs.rmSync(guideTarget);

  console.log(`Scaffold ready: ${changeDir}`);
}

function cmdExploration(changeId, topic) {
  assertCurrentSessionChange(changeId);
  const topicSlug = safeSlug(topic, 'topic');
  const changeDir = ensureChangeDir(changeId);
  const target = path.join(changeDir, 'evidence', `${topicSlug}-exploration.md`);
  if (!fs.existsSync(target)) {
    fs.copyFileSync(path.join(templatesDir, 'exploration.md'), target);
  }
  console.log(`Exploration ready: ${target}`);
}

function assertFreshHookHealth(action) {
  const sessionId = sessionIdFromEnv();
  if (!sessionId || !readSession(repoRoot, sessionId)) {
    console.error(`ADVISORY EH-HOOK-HEALTH-002: ${action} 未绑定可校验的 session；本次不能声明 hook enforcement。`);
    return;
  }
  const health = evaluateHookHealth(repoRoot, sessionId);
  if (!health.ok) {
    console.error(`BLOCK EH-HOOK-HEALTH-002: ${action} requires fresh hook health (${health.reason})`);
    process.exit(2);
  }
}

function assertCurrentSessionChange(changeId) {
  const sessionId = sessionIdFromEnv();
  if (!sessionId) return;
  const active = loadActiveChange(repoRoot, { sessionId });
  if (!active.ok) {
    console.error(`BLOCK EH-SESSION-CHANGE-001: 当前 session 无法解析 active change（${active.reason}）。`);
    process.exit(2);
  }
  if (active.changeId !== changeId) {
    console.error(`BLOCK EH-SESSION-CHANGE-001: 当前 session 绑定 ${active.changeId}，不能修改 ${changeId}。`);
    process.exit(2);
  }
}

function persistStageCompletionProof(changeId, stage) {
  const requiredArtifactPaths = requiredStageResultArtifacts(changeId, stage);
  const { proof, problems } = resolveStageCompletionProof(repoRoot, changeId, stage, { requiredArtifactPaths });
  if (!proof) return { proof: null, problems };
  const target = path.join(changePath(changeId), 'evidence', 'completion', `${stage}.json`);
  atomicWriteJson(target, proof);
  return { proof, problems: [] };
}

function cmdStageAdvance(changeId, stage, tier) {
  const current = readJson(statePathFor(repoRoot, changeId));
  assertCurrentSessionChange(changeId);
  if (current.schemaVersion === 6) {
    assertFreshHookHealth(`${current.stage}→${stage}`);
    if (stage === 'archive') {
      console.error('BLOCK: verify→archive 必须通过 archive 命令；不能直接使用 state advance。');
      process.exit(2);
    }
    try {
      assertForwardTransition(current.stage, stage);
    } catch (error) {
      console.error(`BLOCK: ${error.message}`);
      process.exit(2);
    }
    if (stage === 'implement' && (!current.currentTask || !String(current.currentTask).trim())) {
      console.error('BLOCK: 进入 implement 前必须先设置非空 currentTask。');
      process.exit(2);
    }
    if (current.stage === 'clarify') {
      try {
        readClassificationArtifact(repoRoot, changeId, current.artifacts?.classification);
      } catch (error) {
        console.error(`BLOCK: clarify→design requires a fresh classification artifact (${error.message})`);
        process.exit(2);
      }
    }
    const completion = persistStageCompletionProof(changeId, current.stage);
    if (!completion.proof) {
      console.error(`BLOCK: ${current.stage}→${stage} 需要 fresh StageResult、self-check、独立 ReviewResult 与 runtime CompletionProof。`);
      for (const problem of completion.problems) console.error(`- ${problem}`);
      process.exit(2);
    }
    updateChangeState(repoRoot, changeId, (data) => ({ ...data, stage }), {
      expectedRevision: current.revision,
      type: 'stage-advance',
    });
    console.log(`Stage advanced: ${changeId} -> ${stage}`);
  } else {
    if (stage === 'EXECUTING' && (!current.currentTask || !String(current.currentTask).trim())) {
      console.error('BLOCK: 进入 EXECUTING 前必须先设置非空 currentTask。');
      process.exit(2);
    }
    saveChangeState(repoRoot, changeId, (data) => ({ ...data, state: stage, ...(tier ? { tier } : {}) }), { type: 'state-change' });
    console.log(`State updated: ${changeId} -> ${stage}${tier ? ` (${tier})` : ''}`);
  }
  printTECPCCard(repoRoot, changeId);
}

function cmdCurrentTask(changeId, currentTask) {
  assertCurrentSessionChange(changeId);
  if (currentTask && currentTask.trim().length > 0) assertSafeId(currentTask, 'currentTask');
  const nextTask = currentTask?.trim() || null;
  const current = readJson(statePathFor(repoRoot, changeId));
  if (current.schemaVersion === 6) {
    updateChangeState(repoRoot, changeId, (data) => ({ ...data, currentTask: nextTask }), {
      expectedRevision: current.revision,
      type: 'current-task-change',
    });
  } else {
    saveChangeState(repoRoot, changeId, (data) => ({ ...data, currentTask: nextTask }), { type: 'current-task-change' });
  }
  console.log(`Current task updated: ${changeId}`);
}

function cmdActive(changeId) {
  assertSafeId(changeId, 'changeId');
  const sessionId = sessionIdFromEnv();
  if (sessionId) {
    const active = loadActiveChange(repoRoot, { sessionId });
    if (!active.ok) {
      console.error(`BLOCK EH-SESSION-INPUT-001: 当前 session 尚未绑定 change，不能通过 active 命令设置 repo-wide 状态（${active.reason}）。`);
      process.exit(2);
    }
    if (active.changeId !== changeId) {
      console.error(`BLOCK EH-SESSION-CHANGE-001: 当前 session 绑定 ${active.changeId}，不能激活 ${changeId}。`);
      process.exit(2);
    }
    console.log(`Active change already bound to session: ${changeId}`);
    return;
  }
  // 无 session 时保留 ACTIVE_CHANGE 作为旧 CLI/fixture 的 compatibility fallback；
  // 一旦进入 session-first 模式，动态真相由 common-dir binding 提供。
  fs.writeFileSync(activeFile, changeId + '\n', 'utf-8');
  console.log(`Active change set: ${changeId}`);
}

function cmdShowActive() {
  const sessionId = sessionIdFromEnv();
  if (sessionId) {
    const active = loadActiveChange(repoRoot, { sessionId });
    if (!active.ok) {
      console.error(`BLOCK EH-SESSION-INPUT-001: 当前 session 没有可解析的 active change（${active.reason}）。`);
      process.exit(2);
    }
    process.stdout.write(`${active.changeId}\n`);
    return;
  }
  if (!fs.existsSync(activeFile)) {
    console.error('No active change');
    process.exit(1);
  }
  process.stdout.write(fs.readFileSync(activeFile, 'utf-8'));
}

function cmdImpact(changeId, api, dataImpact, architecture, rule, security = 'unknown') {
  assertCurrentSessionChange(changeId);
  const current = readJson(statePathFor(repoRoot, changeId));
  if (current.schemaVersion !== 6) {
    const impact = { ...current.impact, api, data: dataImpact, architecture, rule, security };
    saveChangeState(repoRoot, changeId, (data) => ({ ...data, impact }), { type: 'impact-change' });
    console.log(`Impact updated: ${changeId}`);
    return;
  }
  const prior = current.artifacts?.classification
    ? readClassificationArtifact(repoRoot, changeId, current.artifacts.classification)
    : {};
  const classification = {
    ...prior,
    impact: { api, data: dataImpact, architecture, rule, security },
  };
  replaceClassificationArtifact(repoRoot, changeId, classification, (reference) => (
    updateChangeState(repoRoot, changeId, (data) => ({
      ...data,
      artifacts: { ...data.artifacts, classification: reference },
    }), {
      expectedRevision: current.revision,
      type: 'classification-artifact-updated',
    })
  ));
  console.log(`Classification artifact updated: ${changeId}`);
}

function cmdReviewVerdict(changeId, reviewerId, verdict) {
  assertCurrentSessionChange(changeId);
  assertSafeId(reviewerId, 'reviewerId');
  const reviewDir = path.join(changePath(changeId), 'reviews');
  fs.mkdirSync(reviewDir, { recursive: true });
  const template = readJson(path.join(templatesDir, 'review-verdict.json'));
  template.changeId = changeId;
  template.reviewerId = reviewerId;
  template.verdict = verdict;
  writeJson(path.join(reviewDir, `${reviewerId}.json`), template);
  console.log(`Review verdict recorded: ${changeId}/${reviewerId}`);
}

function cmdMarkGate(changeId, gate, value, extra = null) {
  assertCurrentSessionChange(changeId);
  const current = readJson(statePathFor(repoRoot, changeId));
  if (current.schemaVersion === 6) {
    console.error(`BLOCK: ${gate} 是 v5 派生投影；v6 请通过 self-check/review/receipt 更新 durable evidence。`);
    process.exit(2);
  }
  saveChangeState(repoRoot, changeId, (data) => {
    if (!data.gates) data.gates = {};
    data.gates[gate] = value;
    if (gate === 'redVerified' && value) {
      data.gates.redTask = data.currentTask || null;
      data.gates.redEvidenceRef = extra || null;
    }
    if (!data.workflow) data.workflow = {};
    if (gate === 'redVerified' && value) data.workflow.tddStatus = 'red-verified';
    return data;
  }, { type: 'gate-update' });
  console.log(`Gate updated: ${changeId} -> ${gate}=${value}${extra ? ` (${extra})` : ''}`);
  printTECPCCard(repoRoot, changeId);
}

function cmdMarkValidated(changeId, _digest, date) {
  assertCurrentSessionChange(changeId);
  const current = readJson(statePathFor(repoRoot, changeId));
  if (current.schemaVersion === 6) {
    const computedDigest = computeValidationDigest(repoRoot, changeId);
    if (!computedDigest) {
      console.error(`BLOCK: 无法为 ${changeId} 计算 validation digest。`);
      process.exit(2);
    }
    updateChangeState(repoRoot, changeId, (data) => ({
      ...data,
      validation: { status: 'fresh', digest: computedDigest, validatedAt: date || new Date().toISOString() },
    }), {
      expectedRevision: current.revision,
      type: 'mark-validated',
    });
  } else {
    // v5 compat: two-step CAS so digest computation sees VALIDATED on disk
    saveChangeState(repoRoot, changeId, (data) => {
      data.state = 'VALIDATED';
      return data;
    }, { type: 'state-validated' });
    const computedDigest = computeValidationDigest(repoRoot, changeId);
    if (!computedDigest) {
      console.error(`BLOCK: 无法为 ${changeId} 计算 validation digest。`);
      process.exit(2);
    }
    saveChangeState(repoRoot, changeId, (data) => {
      data.validation = {
        status: 'fresh',
        digest: computedDigest,
        validatedAt: date || new Date().toISOString().slice(0, 10),
      };
      return data;
    }, { type: 'validated' });
  }
  console.log(`Validated: ${changeId}`);
  printTECPCCard(repoRoot, changeId);
}

function cmdMarkValidationStale(changeId) {
  assertCurrentSessionChange(changeId);
  const current = readJson(statePathFor(repoRoot, changeId));
  const validation = { status: 'stale', digest: null, validatedAt: null };
  if (current.schemaVersion === 6) {
    updateChangeState(repoRoot, changeId, (data) => ({ ...data, validation }), {
      expectedRevision: current.revision,
      type: 'validation-stale',
    });
  } else {
    saveChangeState(repoRoot, changeId, (data) => ({ ...data, validation }), { type: 'validation-stale' });
  }
  console.log(`Validation marked stale: ${changeId}`);
}

const archiveDir = path.join(repoRoot, 'harness', 'archive');
const testDir = path.join(repoRoot, 'runtime', 'test');

function clearSessionBindings(changeId) {
  for (const binding of listSessions(repoRoot)) {
    if (binding.changeId === changeId) unbindSession(repoRoot, binding.sessionId);
  }
}

function assertArchiveTargetAvailable(changeId) {
  if (isReferencedByTests(changeId)) {
    console.error(`BLOCK: ${changeId} 仍被 runtime/test 引用，归档会破坏 smoke，先解除引用。`);
    process.exit(2);
  }
  const destination = resolveChild(archiveDir, changeId, 'changeId');
  if (fs.existsSync(destination)) {
    console.error(`BLOCK: 归档目标已存在：harness/archive/${changeId}`);
    process.exit(2);
  }
  return destination;
}

function moveArchivedChange(changeId, data, { isV6 }) {
  const source = changePath(changeId);
  const destination = assertArchiveTargetAvailable(changeId);
  if (isV6) {
    updateChangeState(repoRoot, changeId, (state) => ({ ...state, lifecycle: 'archived' }), {
      expectedRevision: data.revision,
      type: 'archive-finalized',
    });
  } else {
    saveChangeState(repoRoot, changeId, (state) => ({ ...state, state: 'ARCHIVED' }), { type: 'archive' });
  }
  try {
    fs.mkdirSync(archiveDir, { recursive: true });
    fs.renameSync(source, destination);
  } catch (error) {
    if (isV6 && fs.existsSync(path.join(source, 'state.json'))) {
      const archivedState = readJson(path.join(source, 'state.json'));
      try {
        updateChangeState(repoRoot, changeId, (state) => ({ ...state, lifecycle: 'active' }), {
          expectedRevision: archivedState.revision,
          type: 'archive-move-rollback',
        });
      } catch (rollbackError) {
        console.error(`BLOCK EH-ARCHIVE-TRANSACTION-002: 归档移动失败且状态回滚失败：${rollbackError.message}`);
        process.exit(2);
      }
    }
    console.error(`BLOCK EH-ARCHIVE-TRANSACTION-002: 无法移动 change 到归档目录：${error.message}`);
    process.exit(2);
  }
  clearSessionBindings(changeId);
  if (fs.existsSync(activeFile) && fs.readFileSync(activeFile, 'utf-8').trim() === changeId) {
    fs.rmSync(activeFile);
  }
  console.log(`Archived: ${changeId} -> harness/archive/${changeId}`);
}

// v6 的 archive 命令只关闭 verify 并进入可执行的 Archive 阶段；v5 保留一次性物理归档兼容行为。
function cmdArchive(changeId, force = false) {
  if (!changeId) {
    console.error('BLOCK: archive 需要 <changeId>。');
    process.exit(2);
  }
  assertCurrentSessionChange(changeId);
  if (force) {
    console.error('BLOCK EH-ARCHIVE-FORCE-001: archive --force 已移除；未完成 change 请使用 abandon <changeId> <reason>。');
    process.exit(2);
  }
  const source = changePath(changeId);
  const statePath = path.join(source, 'state.json');
  if (!fs.existsSync(statePath)) {
    console.error(`BLOCK: change 不存在或缺少 state.json：${changeId}`);
    process.exit(2);
  }
  const data = readJson(statePath);
  if (data.schemaVersion !== 6) {
    const completionProblems = validateCompletionPredicate(repoRoot, changeId, data);
    if (completionProblems.length) {
      console.error(`BLOCK: ${changeId} 未满足统一完成态条件。`);
      for (const problem of completionProblems) console.error(`- ${problem}`);
      process.exit(2);
    }
    moveArchivedChange(changeId, data, { isV6: false });
    return;
  }

  assertFreshHookHealth('verify→archive');
  try {
    assertForwardTransition(data.stage, 'archive');
  } catch (error) {
    console.error(`BLOCK: ${error.message}`);
    process.exit(2);
  }
  if (data.validation?.status !== 'fresh') {
    console.error('BLOCK: validation.status must be fresh before archive');
    process.exit(2);
  }
  const completion = persistStageCompletionProof(changeId, 'verify');
  if (!completion.proof) {
    console.error('BLOCK: verify→archive requires fresh StageResult, self-check, independent review, and runtime CompletionProof');
    for (const problem of completion.problems) console.error(`- ${problem}`);
    process.exit(2);
  }
  updateChangeState(repoRoot, changeId, (state) => ({ ...state, stage: 'archive' }), {
    expectedRevision: data.revision,
    type: 'stage-advance',
  });
  console.log(`Stage advanced: ${changeId} -> archive`);
}

// Archive worker 和独立 reviewer 完成后，finalize 才会生成 archive proof 并执行物理移动。
function cmdArchiveFinalize(changeId) {
  if (!changeId) {
    console.error('BLOCK: archive-finalize 需要 <changeId>。');
    process.exit(2);
  }
  assertCurrentSessionChange(changeId);
  const source = changePath(changeId);
  const statePath = path.join(source, 'state.json');
  if (!fs.existsSync(statePath)) {
    console.error(`BLOCK: change 不存在或缺少 state.json：${changeId}`);
    process.exit(2);
  }
  const data = readJson(statePath);
  if (data.schemaVersion !== 6) {
    console.error('BLOCK: archive-finalize 仅适用于 State v6；v5 请使用 archive。');
    process.exit(2);
  }
  if (data.stage !== 'archive' || data.lifecycle !== 'active') {
    console.error('BLOCK: archive-finalize requires an active change in the archive stage');
    process.exit(2);
  }
  if (data.validation?.status !== 'fresh') {
    console.error('BLOCK: validation.status must remain fresh through archive-finalize');
    process.exit(2);
  }
  const completion = persistStageCompletionProof(changeId, 'archive');
  if (!completion.proof) {
    console.error('BLOCK: archive-finalize requires a fresh archive StageResult, self-check, independent review, and runtime CompletionProof');
    for (const problem of completion.problems) console.error(`- ${problem}`);
    process.exit(2);
  }
  const current = readJson(statePath);
  moveArchivedChange(changeId, current, { isV6: true });
}

function cmdAbandon(changeId, reason = '') {
  assertCurrentSessionChange(changeId);
  if (!changeId || !reason.trim()) {
    console.error('BLOCK EH-ABANDON-001: abandon 需要 <changeId> <reason>。');
    process.exit(2);
  }
  const srcDir = changePath(changeId);
  const statePath = path.join(srcDir, 'state.json');
  if (!fs.existsSync(statePath)) {
    console.error(`BLOCK EH-ABANDON-001: change 不存在或缺少 state.json：${changeId}`);
    process.exit(2);
  }
  const data = readJson(statePath);
  if (data.lifecycle === 'archived' || data.state === 'ARCHIVED') {
    console.error(`BLOCK EH-ABANDON-001: 已归档 change 不能 abandon：${changeId}`);
    process.exit(2);
  }
  const date = new Date().toISOString().slice(0, 10);
  const destination = resolveChild(archiveDir, `${date}-${changeId}`, 'archiveId');
  if (fs.existsSync(destination)) {
    console.error(`BLOCK EH-ABANDON-001: abandon 目标已存在：${destination}`);
    process.exit(2);
  }
  const current = readJson(statePath);
  if (current.schemaVersion === 6) {
    updateChangeState(repoRoot, changeId, (d) => ({
      ...d,
      lifecycle: 'abandoned',
      blocker: { code: 'EH-ABANDON-001', reason: reason.trim(), abandonedAt: new Date().toISOString() },
    }), {
      expectedRevision: current.revision,
      type: 'abandon',
    });
  } else {
    saveChangeState(repoRoot, changeId, (d) => ({
      ...d,
      state: 'ABANDONED',
      status: 'abandoned',
      lifecycle: 'abandoned',
      abandonReason: reason.trim(),
      abandonedAt: new Date().toISOString(),
    }), { type: 'abandon' });
  }
  try {
    fs.mkdirSync(archiveDir, { recursive: true });
    fs.renameSync(srcDir, destination);
  } catch (error) {
    try {
      if (current.schemaVersion === 6 && fs.existsSync(statePath)) {
        const abandoned = readJson(statePath);
        updateChangeState(repoRoot, changeId, (state) => {
          const restored = {
            ...state,
            lifecycle: current.lifecycle,
            ...(current.blocker === undefined ? {} : { blocker: current.blocker }),
          };
          if (current.blocker !== undefined) return restored;
          const { blocker: _removedBlocker, ...withoutBlocker } = restored;
          return withoutBlocker;
        }, {
          expectedRevision: abandoned.revision,
          type: 'abandon-move-rollback',
        });
      } else if (fs.existsSync(statePath)) {
        saveChangeState(repoRoot, changeId, () => ({ ...current }), {
          type: 'abandon-move-rollback',
        });
      }
    } catch (rollbackError) {
      console.error(`BLOCK EH-ABANDON-TRANSACTION-002: abandon 移动失败且状态回滚失败：${rollbackError.message}`);
      process.exit(2);
    }
    console.error(`BLOCK EH-ABANDON-TRANSACTION-002: 无法移动 change 到归档目录：${error.message}`);
    process.exit(2);
  }
  clearSessionBindings(changeId);
  if (fs.existsSync(activeFile) && fs.readFileSync(activeFile, 'utf-8').trim() === changeId) {
    fs.rmSync(activeFile);
  }
  console.log(`Abandoned: ${changeId} -> harness/archive/${date}-${changeId}`);
}

function isReferencedByTests(changeId) {
  if (!fs.existsSync(testDir)) return false;
  for (const entry of fs.readdirSync(testDir)) {
    if (!entry.endsWith('.mjs')) continue;
    const text = fs.readFileSync(path.join(testDir, entry), 'utf-8');
    if (text.includes(changeId)) return true;
  }
  return false;
}

const lessonsDir = path.join(repoRoot, 'harness', 'lessons');
const lessonsIndex = path.join(lessonsDir, 'INDEX.md');

// 跨 change 教训库：记录一条 lesson 并同步索引，供后续 clarify 阶段先行检索、避免同样问题重复发生。
function cmdLessonAdd(slug, severity = 'medium', tags = '', sourceChange = '', date) {
  if (!slug) {
    console.error('BLOCK: lesson-add 需要 <slug>。');
    process.exit(2);
  }
  assertSafeId(slug, 'lesson slug');
  if (sourceChange) assertSafeId(sourceChange, 'sourceChange');
  fs.mkdirSync(lessonsDir, { recursive: true });
  const recordedAt = date || new Date().toISOString().slice(0, 10);
  const normalizedTags = tags
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  const lessonPath = path.join(lessonsDir, `${slug}.md`);
  // 1. 幂等：已存在则不覆盖正文，只保证索引里有该条。
  if (!fs.existsSync(lessonPath)) {
    const body = [
      '---',
      `id: ${slug}`,
      `severity: ${severity}`,
      `tags: [${normalizedTags.join(', ')}]`,
      `sourceChange: ${sourceChange}`,
      `recordedAt: ${recordedAt}`,
      '---',
      '',
      `# ${slug}`,
      '',
      '## 症状',
      '',
      '（待补充：可观察到的错误现象）',
      '',
      '## 根因',
      '',
      '（待补充：为什么会发生）',
      '',
      '## 规避',
      '',
      '（待补充：下次如何避免）',
      '',
    ].join('\n');
    fs.writeFileSync(lessonPath, body, 'utf-8');
  }
  // 2. 更新索引：确保 INDEX.md 的 marker 区间内包含该条。
  ensureLessonsIndex();
  const indexLine = `- ${slug} — ${severity} — ${normalizedTags.join(', ')}`;
  const raw = fs.readFileSync(lessonsIndex, 'utf-8');
  const begin = '<!-- LESSONS:BEGIN -->';
  const end = '<!-- LESSONS:END -->';
  const before = raw.slice(0, raw.indexOf(begin) + begin.length);
  const after = raw.slice(raw.indexOf(end));
  const middle = raw.slice(raw.indexOf(begin) + begin.length, raw.indexOf(end));
  const lines = middle.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('- '));
  const existing = lines.filter((l) => !l.startsWith(`- ${slug} `));
  existing.push(indexLine);
  existing.sort();
  fs.writeFileSync(lessonsIndex, `${before}\n${existing.join('\n')}\n${after}`, 'utf-8');
  console.log(`Lesson recorded: ${slug}`);
}

function ensureLessonsIndex() {
  fs.mkdirSync(lessonsDir, { recursive: true });
  if (fs.existsSync(lessonsIndex)) return;
  const seed = [
    '# Lessons Index',
    '',
    '本文件是跨 change 的经验/教训索引。每行一条：`id — severity — tags`。',
    '',
    '<!-- LESSONS:BEGIN -->',
    '<!-- LESSONS:END -->',
    '',
  ].join('\n');
  fs.writeFileSync(lessonsIndex, seed, 'utf-8');
}

function cmdLessonList(tagFilter) {
  if (!fs.existsSync(lessonsIndex)) {
    console.log('（暂无 lessons）');
    return;
  }
  const raw = fs.readFileSync(lessonsIndex, 'utf-8');
  const begin = '<!-- LESSONS:BEGIN -->';
  const end = '<!-- LESSONS:END -->';
  const middle = raw.slice(raw.indexOf(begin) + begin.length, raw.indexOf(end));
  const lines = middle.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('- '));
  const filtered = tagFilter ? lines.filter((l) => l.includes(tagFilter)) : lines;
  if (filtered.length === 0) {
    console.log(tagFilter ? `（无匹配 tag=${tagFilter} 的 lesson）` : '（暂无 lessons）');
    return;
  }
  for (const line of filtered) console.log(line);
}

const [, , action, ...args] = process.argv;
switch (action) {
  case 'scaffold': cmdScaffold(args[0], args[1], args[2], args[3]); break;
  case 'exploration': cmdExploration(args[0], args[1]); break;
  case 'state': cmdStageAdvance(args[0], args[1], args[2]); break;
  case 'active': cmdActive(args[0]); break;
  case 'show-active': cmdShowActive(); break;
  case 'impact': cmdImpact(args[0], args[1], args[2], args[3], args[4], args[5]); break;
  case 'current-task': cmdCurrentTask(args[0], args.slice(1).join(' ')); break;
  case 'review-verdict': cmdReviewVerdict(args[0], args[1], args[2]); break;
  case 'design-approved': cmdMarkGate(args[0], 'designApproved', true); break;
  case 'red-verified': cmdMarkGate(args[0], 'redVerified', true, args[1] || null); break;
  case 'reviewed': cmdStageAdvance(args[0], 'REVIEWED', args[1]); break;
  case 'validated': cmdMarkValidated(args[0], args[1], args[2]); break;
  case 'validation-stale': cmdMarkValidationStale(args[0]); break;
  case 'archive': cmdArchive(args[0], args.includes('--force')); break;
  case 'archive-finalize': cmdArchiveFinalize(args[0]); break;
  case 'abandon': cmdAbandon(args[0], args.slice(1).join(' ')); break;
  case 'lesson-add': cmdLessonAdd(args[0], args[1], args[2], args[3], args[4]); break;
  case 'lesson-list': cmdLessonList(args[0]); break;
  default:
    console.log('Usage: node runtime/lifecycle.mjs <action> ...');
    console.log('Actions: scaffold, exploration, state, active, show-active, impact, current-task, review-verdict, design-approved, red-verified, reviewed, validated, validation-stale, archive, archive-finalize, abandon, lesson-add, lesson-list');
    process.exit(1);
}
