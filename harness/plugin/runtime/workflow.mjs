import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { projectRoot } from './lib/checks.mjs';
import { loadActiveChange } from './lib/gates.mjs';
import { inferWorkflowStage, recommendNextEntry, recommendExplorationLane, inferCurrentGap } from './lib/workflow.mjs';

const root = projectRoot();
const changesDir = path.join(root, 'harness', 'changes');
const activeFile = path.join(root, 'harness', 'ACTIVE_CHANGE');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

function setActiveChange(changeId) {
  fs.writeFileSync(activeFile, `${changeId}\n`, 'utf-8');
}

function ensureChangeExists(changeId) {
  const statePath = path.join(changesDir, changeId, 'state.json');
  return fs.existsSync(statePath);
}

function createChange(changeId, owner, tier, topic) {
  const child = spawnSync('node', [path.join(root, 'harness', 'plugin', 'runtime', 'start-change.mjs'), changeId, owner, tier, topic], {
    cwd: root,
    encoding: 'utf-8',
  });
  if (child.status !== 0) {
    process.stderr.write(child.stderr || child.stdout || 'workflow run failed\n');
    process.exit(child.status ?? 1);
  }
}

function inferPendingDecision(changeId, data, stage, currentGap, nextEntry) {
  if (!stage || !data) return null;
  if (stage === 'clarify' && !data.workflow?.userConfirmedScope) {
    return {
      kind: 'scope-confirmation',
      message: '需要用户确认执行范围后才能继续 route。',
      options: ['confirm-scope', 'revise-scope'],
      evidence: [`harness/changes/${changeId}/requirements.md`],
    };
  }
  if (stage === 'clarify' && !data.workflow?.clarifyReady) {
    return {
      kind: 'requirement-clarification',
      message: currentGap,
      options: ['answer-next-question', 'narrow-scope', 'stop'],
      evidence: [`harness/changes/${changeId}/requirements.md`],
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
  const stage = inferWorkflowStage(changeId, data);
  const nextEntry = recommendNextEntry(stage, data);
  const recommendedLane = recommendExplorationLane(stage, data);
  const currentGap = inferCurrentGap(root, changeId, data, stage);
  const pendingDecision = inferPendingDecision(changeId, data, stage, currentGap, nextEntry);
  return {
    changeId,
    state: data.state ?? null,
    stage,
    status: inferRunnerStatus(stage, pendingDecision),
    nextAction: nextEntry,
    pendingDecision,
    recommendedLane,
    currentGap,
    blockers: data.blockers ?? [],
    approvals: data.approvals ?? {},
    workflow: data.workflow ?? null,
    validation: data.validation ?? null,
  };
}

function loadChange(changeId) {
  const statePath = path.join(changesDir, changeId, 'state.json');
  if (!fs.existsSync(statePath)) {
    console.error(`Unknown change: ${changeId}`);
    process.exit(1);
  }
  return readJson(statePath);
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

const [, , action, ...args] = process.argv;

if (!action || action === '--help' || action === '-h') {
  console.log('Enterprise Harness Workflow');
  console.log('Usage: node harness/plugin/runtime/workflow.mjs <run|resume|status> [args]');
  console.log('  run <change-id> [owner] [tier] [topic]');
  console.log('  resume [change-id]');
  console.log('  status [change-id] [--json]');
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
    const result = buildWorkflowResult(changeId, data);
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exit(0);
  }
  case 'resume': {
    const changeId = resolveChangeId(args[0]);
    setActiveChange(changeId);
    const data = loadChange(changeId);
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
  default:
    console.error(`Unknown workflow action: ${action}`);
    process.exit(1);
}
