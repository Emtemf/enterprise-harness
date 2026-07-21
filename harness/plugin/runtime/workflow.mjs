import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { randomUUID, createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { projectRoot } from './lib/checks.mjs';
import { loadActiveChange } from './lib/gates.mjs';
import { inferWorkflowStage, recommendNextEntry, recommendExplorationLane, inferCurrentGap } from './lib/workflow.mjs';

const root = projectRoot();
// 兄弟 runtime 脚本相对本文件自身目录定位，不依赖调用方 cwd（企业目标项目里 cwd 是用户项目根）。
const runtimeDir = path.dirname(fileURLToPath(import.meta.url));
const changesDir = path.join(root, 'harness', 'changes');
const activeFile = path.join(root, 'harness', 'ACTIVE_CHANGE');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

function setActiveChange(changeId) {
  fs.writeFileSync(activeFile, `${changeId}\n`, 'utf-8');
}

function computeFileSha256(file) {
  return createHash('sha256').update(fs.readFileSync(file, 'utf-8')).digest('hex');
}

function designReviewArtifactPath(changeId) {
  return path.join(changeDir(changeId), 'reviews', 'design-reviewer.json');
}

function designFilePath(changeId) {
  return path.join(changeDir(changeId), 'design.md');
}

function designProjectionMatchesArtifact(changeId, data) {
  const reviewPath = designReviewArtifactPath(changeId);
  if (!fs.existsSync(reviewPath)) {
    return { ok: false, reason: 'missing-reviewer-artifact' };
  }
  let review;
  try {
    review = JSON.parse(fs.readFileSync(reviewPath, 'utf-8'));
  } catch {
    return { ok: false, reason: 'invalid-reviewer-artifact' };
  }
  const projection = data.approvals?.design;
  if (!projection) {
    return { ok: false, reason: 'missing-design-projection' };
  }
  const matches =
    review.changeId === changeId &&
    review.reviewerId === projection.reviewerId &&
    review.reviewedAt === projection.reviewedAt &&
    review.verdict === projection.status;
  return { ok: matches, reason: matches ? null : 'projection-drift' };
}

function shouldSuppressExecutionReadiness(changeId, data) {
  const baseline = data.workflow?.suppressionBaseline?.designMdSha256;
  if (!baseline) return false;
  const file = designFilePath(changeId);
  if (!fs.existsSync(file)) return false;
  return computeFileSha256(file) === baseline;
}


function ensureChangeExists(changeId) {
  const statePath = path.join(changesDir, changeId, 'state.json');
  return fs.existsSync(statePath);
}

function createChange(changeId, owner, tier, topic) {
  const child = spawnSync('node', [path.join(runtimeDir, 'start-change.mjs'), changeId, owner, tier, topic], {
    cwd: root,
    encoding: 'utf-8',
  });
  if (child.status !== 0) {
    process.stderr.write(child.stderr || child.stdout || 'workflow run failed\n');
    process.exit(child.status ?? 1);
  }
}

function ensureWorkflowShape(data) {
  data.revision = Number.isInteger(data.revision) ? data.revision : 1;
  data.lastEventId = data.lastEventId ?? null;
  data.workflow = data.workflow || {};
  data.workflow.stage = data.workflow.stage || 'clarify';
  data.workflow.clarifyReady = Boolean(data.workflow.clarifyReady);
  data.workflow.userConfirmedScope = Boolean(data.workflow.userConfirmedScope);
  data.workflow.planReady = Boolean(data.workflow.planReady);
  data.workflow.tddStatus = data.workflow.tddStatus || 'not-started';
  data.workflow.nextEntry = data.workflow.nextEntry || '/harness';
  return data;
}

function changeDir(changeId) {
  return path.join(changesDir, changeId);
}

function statePathFor(changeId) {
  return path.join(changeDir(changeId), 'state.json');
}

function eventLogPathFor(changeId) {
  return path.join(changeDir(changeId), 'evidence', 'workflow-events.jsonl');
}

function appendEvent(changeId, event) {
  const file = eventLogPathFor(changeId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, JSON.stringify(event) + '\n', 'utf-8');
}

function recordEvent(changeId, data, type, payload = {}) {
  const eventId = `wf_${randomUUID()}`;
  const event = {
    eventId,
    type,
    changeId,
    actor: 'workflow-runner',
    timestamp: new Date().toISOString(),
    state: data.state ?? null,
    workflowStage: data.workflow?.stage ?? null,
    payload,
  };
  data.lastEventId = eventId;
  data.revision = (data.revision ?? 1) + 1;
  appendEvent(changeId, event);
  return event;
}

function inferPendingDecision(changeId, data, stage, currentGap) {
  if (!stage || !data) return null;
  if (stage === 'clarify' && !data.workflow?.clarifyReady) {
    return {
      kind: 'requirement-clarification',
      message: currentGap,
      options: ['answer-next-question', 'narrow-scope', 'stop'],
      evidence: [`harness/changes/${changeId}/requirements.md`],
    };
  }
  if (stage === 'clarify' && !data.workflow?.userConfirmedScope) {
    return {
      kind: 'scope-confirmation',
      message: '需要用户确认执行范围后才能继续 route。',
      options: ['confirm-scope', 'revise-scope'],
      evidence: [`harness/changes/${changeId}/requirements.md`],
    };
  }
  if (stage === 'design' && data.approvals?.design?.status && data.approvals?.design?.status !== 'block' && !data.gates?.designApproved) {
    if (shouldSuppressExecutionReadiness(changeId, data)) {
      return null;
    }
    return {
      kind: 'execution-readiness',
      message: '需要确认 execution deepening 第一批切片是否已冻结，可以进入 plan。',
      options: ['freeze-slice', 'revise-slice'],
      defaultDecision: 'freeze-slice',
      evidence: [`harness/changes/${changeId}/design.md`],
    };
  }
  if (stage === 'design' && !(data.approvals?.design?.status === 'pass' || data.gates?.designApproved)) {
    return {
      kind: 'design-approval',
      message: '需要 design approval 后才能进入 plan。',
      options: ['approve', 'request-changes', 'reject'],
      evidence: [`harness/changes/${changeId}/design.md`],
    };
  }
  return null;
}

function inferRunnerStatus(stage, pendingDecision) {
  if (stage === 'archive') return 'complete';
  if (pendingDecision) return 'paused';
  return 'ready';
}

function buildWorkflowResult(changeId, data) {
  ensureWorkflowShape(data);
  const stage = inferWorkflowStage(changeId, data);
  const nextEntry = recommendNextEntry(stage, data);
  const recommendedLane = recommendExplorationLane(stage, data);
  const currentGap = inferCurrentGap(root, changeId, data, stage);
  const pendingDecision = inferPendingDecision(changeId, data, stage, currentGap);
  const nextAction = pendingDecision
    ? (pendingDecision.defaultDecision
      ? `workflow decide ${changeId} ${pendingDecision.defaultDecision}`
      : `workflow decide ${changeId} <${pendingDecision.options.join('|')}>`)
    : nextEntry;
  return {
    changeId,
    state: data.state ?? null,
    stage,
    status: inferRunnerStatus(stage, pendingDecision),
    nextAction,
    pendingDecision,
    recommendedLane,
    currentGap,
    blockers: data.blockers ?? [],
    approvals: data.approvals ?? {},
    revision: data.revision ?? 1,
    lastEventId: data.lastEventId ?? null,
    workflow: data.workflow ?? null,
    validation: data.validation ?? null,
  };
}

function loadChange(changeId) {
  const statePath = statePathFor(changeId);
  if (!fs.existsSync(statePath)) {
    console.error(`Unknown change: ${changeId}`);
    process.exit(1);
  }
  const data = ensureWorkflowShape(readJson(statePath));
  return data;
}

function saveChange(changeId, data) {
  writeJson(statePathFor(changeId), data);
}

function resolveChangeId(candidate) {
  if (candidate) return candidate;
  const active = loadActiveChange(root);
  if (!active.ok) {
    console.error('No active change');
    process.exit(1);
  }
  return active.changeId;
}

function applyDecision(changeId, decision, reason = null) {
  const data = loadChange(changeId);
  const result = buildWorkflowResult(changeId, data);
  const pending = result.pendingDecision;
  if (!pending) {
    console.error('No pending decision for this change');
    process.exit(1);
  }
  if (!pending.options.includes(decision)) {
    console.error(`Unsupported decision: ${decision}`);
    process.exit(1);
  }

  if (pending.kind === 'scope-confirmation') {
    if (decision === 'confirm-scope') {
      data.workflow.userConfirmedScope = true;
      if (data.workflow.clarifyReady) {
        data.workflow.stage = 'route';
        data.workflow.nextEntry = '/harness';
      }
    }
    if (decision === 'revise-scope') {
      data.workflow.userConfirmedScope = false;
      data.workflow.stage = 'clarify';
      data.workflow.nextEntry = '/harness';
    }
  }

  if (pending.kind === 'execution-readiness') {
    const consistency = designProjectionMatchesArtifact(changeId, data);
    if (decision === 'freeze-slice') {
      if (!consistency.ok) {
        console.error(`Execution readiness gate failed: ${consistency.reason}`);
        process.exit(2);
      }
      data.gates = data.gates || {};
      data.gates.designApproved = true;
      data.state = 'DESIGN_APPROVED';
      data.workflow.stage = 'plan';
      data.workflow.nextEntry = '/harness-plan';
      data.workflow.planReady = false;
      delete data.workflow.suppressionBaseline;
    }
    if (decision === 'revise-slice') {
      data.gates = data.gates || {};
      data.gates.designApproved = false;
      data.state = 'DISCOVERED';
      data.workflow.stage = 'design';
      data.workflow.nextEntry = '/harness-design';
      data.workflow.planReady = false;
      const designPath = designFilePath(changeId);
      data.workflow.suppressionBaseline = {
        designMdSha256: fs.existsSync(designPath) ? computeFileSha256(designPath) : null,
      };
    }
  }

  recordEvent(changeId, data, 'decision', { decision, reason, kind: pending.kind });
  saveChange(changeId, data);
  return buildWorkflowResult(changeId, data);
}

const [, , action, ...args] = process.argv;

if (!action || action === '--help' || action === '-h') {
  console.log('Enterprise Harness Workflow');
  console.log('Usage: node harness/plugin/runtime/workflow.mjs <run|resume|status|decide|note|session-log> [args]');
  console.log('  run <change-id> [owner] [tier] [topic]');
  console.log('  resume [change-id]');
  console.log('  status [change-id] [--json]');
  console.log('  decide <change-id> <decision> [reason]');
  console.log('  note <change-id> <clarify-qa|route-decided> <text>');
  console.log('  session-log [change-id]');
  process.exit(0);
}

switch (action) {
  case 'run': {
    const [changeId, owner = 'harness-governance', tier = 'L3', topic = 'workflow-run'] = args;
    if (!changeId) {
      console.error('Usage: workflow run <change-id> [owner] [tier] [topic]');
      process.exit(1);
    }
    if (!ensureChangeExists(changeId)) {
      createChange(changeId, owner, tier, topic);
    } else {
      setActiveChange(changeId);
    }
    const data = loadChange(changeId);
    recordEvent(changeId, data, 'run', { owner, tier, topic });
    saveChange(changeId, data);
    const result = buildWorkflowResult(changeId, data);
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exit(0);
  }
  case 'resume': {
    const changeId = resolveChangeId(args[0]);
    setActiveChange(changeId);
    const data = loadChange(changeId);
    recordEvent(changeId, data, 'resume');
    saveChange(changeId, data);
    const result = buildWorkflowResult(changeId, data);
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exit(0);
  }
  case 'status': {
    const json = args.includes('--json');
    const changeId = resolveChangeId(args.find((arg) => !arg.startsWith('--')) || null);
    const data = loadChange(changeId);
    const result = buildWorkflowResult(changeId, data);
    if (json) {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    } else {
      console.log('Enterprise Harness Workflow Status');
      console.log(`changeId: ${result.changeId}`);
      console.log(`state: ${result.state}`);
      console.log(`stage: ${result.stage}`);
      console.log(`status: ${result.status}`);
      console.log(`nextAction: ${result.nextAction}`);
      console.log(`currentGap: ${result.currentGap}`);
      if (result.recommendedLane) console.log(`recommendedLane: ${result.recommendedLane}`);
      if (result.pendingDecision) {
        console.log(`pendingDecision.kind: ${result.pendingDecision.kind}`);
        console.log(`pendingDecision.message: ${result.pendingDecision.message}`);
      }
    }
    process.exit(0);
  }
  case 'decide': {
    const [changeIdRaw, decision, ...reasonParts] = args;
    const changeId = resolveChangeId(changeIdRaw);
    if (!decision) {
      console.error('Usage: workflow decide <change-id> <decision> [reason]');
      process.exit(1);
    }
    const result = applyDecision(changeId, decision, reasonParts.join(' ') || null);
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exit(0);
  }
  case 'note': {
    // 记录决策级事件（如 clarify-qa / route-decided），用于后续可复盘的 session log。
    const [changeIdRaw, noteType, ...noteParts] = args;
    const changeId = resolveChangeId(changeIdRaw);
    const allowed = ['clarify-qa', 'route-decided'];
    if (!allowed.includes(noteType)) {
      console.error(`Usage: workflow note <change-id> <${allowed.join('|')}> <text>`);
      process.exit(1);
    }
    if (!ensureChangeExists(changeId)) {
      console.error(`BLOCK: change 不存在：${changeId}`);
      process.exit(2);
    }
    const data = loadChange(changeId);
    recordEvent(changeId, data, noteType, { note: noteParts.join(' ') });
    saveChange(changeId, data);
    console.log(`Noted ${noteType} on ${changeId}`);
    process.exit(0);
  }
  case 'session-log': {
    // 把事件流渲染成人可读的决策时间线，供复盘/优化使用。
    const changeId = resolveChangeId(args[0]);
    const logPath = eventLogPathFor(changeId);
    if (!fs.existsSync(logPath)) {
      console.log(`（${changeId} 暂无事件记录）`);
      process.exit(0);
    }
    const events = fs.readFileSync(logPath, 'utf-8')
      .split('\n')
      .filter(Boolean)
      .map((line) => { try { return JSON.parse(line); } catch { return null; } })
      .filter(Boolean);
    console.log(`# Session Log — ${changeId}`);
    console.log('');
    for (const ev of events) {
      const detail = ev.payload?.note || ev.payload?.decision || ev.payload?.topic || '';
      const suffix = detail ? ` — ${detail}` : '';
      console.log(`- ${ev.timestamp} [${ev.type}] stage=${ev.workflowStage ?? '-'}${suffix}`);
    }
    process.exit(0);
  }
  default:
    console.error(`Unknown workflow action: ${action}`);
    process.exit(1);
}
