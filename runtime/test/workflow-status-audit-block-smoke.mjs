import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { buildWorkflowResult } from '../lib/workflow.mjs';
import { buildStatusSummary } from '../lib/status-summary.mjs';
import { bindSession } from '../lib/sessions.mjs';
import { renderTECPCCard } from '../lib/tecp-card.mjs';

const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) {
  console.error('Usage: node runtime/test/workflow-status-audit-block-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const sourceRoot = path.resolve(import.meta.dirname, '../..');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-status-audit-block-'));
const changeId = 'audit-blocked-resume';
const changeDir = path.join(root, 'harness', 'changes', changeId);

try {
  fs.mkdirSync(changeDir, { recursive: true });
  fs.mkdirSync(path.join(root, 'harness'), { recursive: true });
  fs.copyFileSync(
    path.join(sourceRoot, 'harness', 'behavior-checks.json'),
    path.join(root, 'harness', 'behavior-checks.json'),
  );
  fs.writeFileSync(path.join(root, 'harness', 'ACTIVE_CHANGE'), `${changeId}\n`);
  for (const name of ['requirements.md', 'change.md', 'design.md', 'tasks.md', 'validation.md']) {
    fs.writeFileSync(path.join(changeDir, name), `# ${name}\n`);
  }

  const state = {
    schemaVersion: 4,
    revision: 1,
    changeId,
    state: 'PLANNED',
    gates: { designApproved: true },
    blockers: [],
    workflow: {
      stage: 'tdd',
      clarifyReady: true,
      userConfirmedScope: true,
      routeReady: true,
      planReady: true,
      tddStatus: 'not-started',
      nextEntry: '/harness-tdd',
    },
    validation: { status: 'stale' },
  };
  fs.writeFileSync(path.join(changeDir, 'state.json'), JSON.stringify(state, null, 2));
  const commonDir = path.join(root, '.git');
  bindSession(root, {
    sessionId: 'audit-block-smoke',
    changeId,
    worktreePath: root,
    controllerRevision: '0.4.0-dev',
  }, { commonDir });

  const workflow = buildWorkflowResult(root, changeId, state);
  const summary = buildStatusSummary(root, { sessionId: 'audit-block-smoke' });
  const card = renderTECPCCard(root, changeId, state, { workflowResult: workflow });
  const sessionStart = spawnSync(process.execPath, [path.join(sourceRoot, 'hooks', 'scripts', 'session-start.mjs')], {
    cwd: root,
    encoding: 'utf-8',
    input: JSON.stringify({ hook_event_name: 'SessionStart', session_id: 'audit-block-smoke', cwd: root }),
    env: { ...process.env, CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH: '3' },
  });
  const stop = spawnSync(process.execPath, [path.join(sourceRoot, 'hooks', 'scripts', 'stop.mjs')], {
    cwd: root,
    encoding: 'utf-8',
    input: JSON.stringify({ hook_event_name: 'Stop', session_id: 'audit-block-smoke', cwd: root }),
  });
  const ok =
    workflow.status === 'blocked' &&
    workflow.audit?.verdict === 'block' &&
    workflow.nextEntry === '/harness' &&
    workflow.workflow?.nextEntry === '/harness' &&
    workflow.workflow?.projectedNextEntry === '/harness-tdd' &&
    workflow.nextAction === `workflow audit ${changeId} --json` &&
    workflow.pendingDecision === null &&
    workflow.currentGap.includes('EH-AUDIT-HANDOFF-001') &&
    summary.status === 'blocked' &&
    summary.blockers?.[0]?.code === 'EH-AUDIT-HANDOFF-001' &&
    summary.activeChange.workflowStatus === 'blocked' &&
    summary.activeChange.blockers?.[0]?.code === 'EH-AUDIT-HANDOFF-001' &&
    summary.activeChange.audit?.verdict === 'block' &&
    summary.nextStage === null &&
    summary.projectedStage === 'tdd' &&
    summary.recommendedEntry === '/harness' &&
    summary.nextAction === `workflow audit ${changeId} --json` &&
    card.includes('✗ clarify') &&
    card.includes('audit BLOCK') &&
    !card.includes('│ E 证据    ▸ design approved') &&
    card.includes(`workflow audit ${changeId} --json`) &&
    !card.includes('│ C 纠正    ▸ /harness-tdd') &&
    sessionStart.status === 0 &&
    sessionStart.stdout.includes(`下一步动作: workflow audit ${changeId} --json`) &&
    !sessionStart.stdout.includes('下一步动作: /harness-tdd') &&
    stop.stderr.includes(`下一步动作：workflow audit ${changeId} --json`) &&
    !stop.stderr.includes('下一步动作：/harness-tdd');

  if (mode === 'red') {
    if (ok) {
      console.error('Expected status to ignore completed-stage audit blockers before implementation');
      process.exit(1);
    }
    console.log('Red precondition observed: status recommends the projected stage despite strict audit blockers.');
    process.exit(0);
  }

  assert.equal(ok, true, JSON.stringify({ workflow, summary }, null, 2));
  console.log(mode === 'green'
    ? 'Green workflow status audit-block smoke passed.'
    : 'Workflow status audit-block verify smoke passed.');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
