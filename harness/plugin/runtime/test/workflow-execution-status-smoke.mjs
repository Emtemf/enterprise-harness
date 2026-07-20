import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const repoRoot = '/home/wula/IdeaProjects/sdd';
const workflowPath = path.join(repoRoot, 'harness', 'plugin', 'runtime', 'workflow.mjs');
const mode = process.argv[2];

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === '.codegraph') continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function setupTempRepo() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-execution-status-'));
  const repoCopy = path.join(tempRoot, 'repo');
  copyDir(repoRoot, repoCopy);
  const changeId = 'execution-status-smoke';
  const changeDir = path.join(repoCopy, 'harness', 'changes', changeId);
  fs.mkdirSync(path.join(changeDir, 'evidence'), { recursive: true });
  fs.mkdirSync(path.join(changeDir, 'reviews'), { recursive: true });
  fs.writeFileSync(path.join(repoCopy, 'harness', 'ACTIVE_CHANGE'), `${changeId}\n`, 'utf-8');
  fs.writeFileSync(path.join(changeDir, 'requirements.md'), '# Requirements\n', 'utf-8');
  fs.writeFileSync(path.join(changeDir, 'change.md'), '# Change\n', 'utf-8');
  fs.writeFileSync(path.join(changeDir, 'design.md'), '# Design\n', 'utf-8');
  fs.writeFileSync(path.join(changeDir, 'validation.md'), '# Validation\n', 'utf-8');
  fs.writeFileSync(path.join(changeDir, 'reviews', 'design-reviewer.json'), JSON.stringify({
    changeId,
    reviewerId: 'design-reviewer',
    verdict: 'advisory',
    findings: [],
    evidence: [],
    reviewedAt: '2026-07-20'
  }, null, 2) + '\n', 'utf-8');
  fs.writeFileSync(path.join(changeDir, 'state.json'), JSON.stringify({
    schemaVersion: 1,
    changeId,
    tier: 'L3',
    state: 'DISCOVERED',
    owner: 'harness-governance',
    impact: { api: 'no', data: 'no', architecture: 'yes', rule: 'yes' },
    tooling: { codegraph: { status: 'available', queries: [], fallbackReason: null }, documentation: { status: 'unknown', libraries: [] } },
    decisions: [],
    blockers: [],
    approvals: {
      design: {
        status: 'advisory',
        reviewerId: 'design-reviewer',
        reviewedAt: '2026-07-20'
      }
    },
    gates: {
      designApproved: false,
      redVerified: false,
      redTask: null,
      redEvidenceRef: null
    },
    currentTask: null,
    workflow: {
      stage: 'design',
      clarifyReady: true,
      userConfirmedScope: true,
      planReady: false,
      tddStatus: 'not-started',
      nextEntry: '/harness-design'
    },
    validation: { status: 'missing', digest: null, validatedAt: null }
  }, null, 2) + '\n', 'utf-8');
  return { tempRoot, repoCopy, changeId, changeDir };
}

function runWorkflow(cwd, args) {
  return spawnSync('node', [workflowPath, ...args], {
    cwd,
    encoding: 'utf-8',
  });
}

function parseJson(result) {
  try {
    return JSON.parse(result.stdout);
  } catch {
    return null;
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function pass(message) {
  console.log(message);
  process.exit(0);
}

if (!['red', 'green', 'verify'].includes(mode)) {
  console.error('Usage: node harness/plugin/runtime/test/workflow-execution-status-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const { tempRoot, repoCopy, changeId, changeDir } = setupTempRepo();
try {
  const workflowStatus = parseJson(runWorkflow(repoCopy, ['status', changeId, '--json']));
  const sessionStartPath = path.join(repoCopy, 'harness', 'plugin', 'runtime', 'hooks', 'session-start.mjs');
  const sessionStart = spawnSync('node', [sessionStartPath], { cwd: repoCopy, encoding: 'utf-8' });
  const sessionText = `${sessionStart.stdout || ''}${sessionStart.stderr || ''}`;
  const stopPath = path.join(repoCopy, 'harness', 'plugin', 'runtime', 'hooks', 'stop.mjs');
  const stopResult = spawnSync('node', [stopPath], { cwd: repoCopy, encoding: 'utf-8' });
  const stopText = `${stopResult.stdout || ''}${stopResult.stderr || ''}`;
  const statusCli = spawnSync('node', [path.join(repoCopy, 'harness', 'plugin', 'runtime', 'status.mjs')], { cwd: repoCopy, encoding: 'utf-8' });
  const statusCliText = `${statusCli.stdout || ''}${statusCli.stderr || ''}`;

  const ok =
    workflowStatus?.changeId === changeId &&
    workflowStatus?.stage === 'design' &&
    workflowStatus?.pendingDecision?.kind === 'execution-readiness' &&
    workflowStatus?.workflow?.nextEntry === '/harness-design' &&
    workflowStatus?.nextAction === `workflow decide ${changeId} freeze-slice` &&
    workflowStatus?.currentGap === 'execution deepening 第一批切片待冻结。' &&
    sessionText.includes('[Harness Workflow] 当前 stage: design') &&
    sessionText.includes('[Harness Workflow] 推荐恢复入口: /harness') &&
    sessionText.includes(`[Harness Workflow] 下一步动作: workflow decide ${changeId} freeze-slice`) &&
    statusCliText.includes('普通用户下一步命令') &&
    statusCliText.includes('- /harness') &&
    stopText.includes('- 当前 workflow stage：design') &&
    stopText.includes('- 建议下次从：/harness 恢复');

  if (mode === 'red') {
    if (!ok) {
      fail('Expected execution-phase status progression contract to fail before implementation');
    }
    pass('Red precondition no longer holds.');
  }

  if (!ok) {
    fail('Expected execution-phase status progression contract to pass');
  }

  pass(mode === 'green' ? 'Green workflow-execution-status smoke passed.' : 'Workflow-execution-status verify smoke passed.');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
