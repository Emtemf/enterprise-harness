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
    if (entry.isDirectory()) copyDir(srcPath, destPath);
    else fs.copyFileSync(srcPath, destPath);
  }
}

function setupTempRepo() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-progression-decision-'));
  const repoCopy = path.join(tempRoot, 'repo');
  copyDir(repoRoot, repoCopy);
  const changeId = 'execution-decision-smoke';
  const changeDir = path.join(repoCopy, 'harness', 'changes', changeId);
  fs.mkdirSync(path.join(changeDir, 'evidence'), { recursive: true });
  fs.mkdirSync(path.join(changeDir, 'reviews'), { recursive: true });
  fs.writeFileSync(path.join(repoCopy, 'harness', 'ACTIVE_CHANGE'), `${changeId}\n`, 'utf-8');
  fs.writeFileSync(path.join(changeDir, 'requirements.md'), '# Requirements\n', 'utf-8');
  fs.writeFileSync(path.join(changeDir, 'change.md'), '# Change\n', 'utf-8');
  fs.writeFileSync(path.join(changeDir, 'design.md'), '# Design\n', 'utf-8');
  fs.writeFileSync(path.join(changeDir, 'validation.md'), '# Validation\n', 'utf-8');
  const reviewProjection = {
    status: 'advisory',
    reviewerId: 'design-reviewer',
    reviewedAt: '2026-07-20'
  };
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
    approvals: { design: reviewProjection },
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
  return { tempRoot, repoCopy, changeId, changeDir, reviewProjection };
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
  console.error('Usage: node harness/plugin/runtime/test/workflow-progression-decision-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const { tempRoot, repoCopy, changeId, changeDir, reviewProjection } = setupTempRepo();
try {
  const beforeStatus = parseJson(runWorkflow(repoCopy, ['status', changeId, '--json']));
  const freezeResult = runWorkflow(repoCopy, ['decide', changeId, 'freeze-slice', 'freeze in smoke']);
  const freezeJson = parseJson(freezeResult);
  const afterFreeze = JSON.parse(fs.readFileSync(path.join(changeDir, 'state.json'), 'utf-8'));
  const eventLogPath = path.join(changeDir, 'evidence', 'workflow-events.jsonl');
  const eventLogText = fs.existsSync(eventLogPath) ? fs.readFileSync(eventLogPath, 'utf-8') : '';

  // Reset to initial fixture for revise path
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
    approvals: { design: reviewProjection },
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

  const reviseResult = runWorkflow(repoCopy, ['decide', changeId, 'revise-slice', 'revise in smoke']);
  const reviseJson = parseJson(reviseResult);
  const afterRevise = JSON.parse(fs.readFileSync(path.join(changeDir, 'state.json'), 'utf-8'));
  const eventLogTextAfterRevise = fs.existsSync(eventLogPath) ? fs.readFileSync(eventLogPath, 'utf-8') : '';

  const ok =
    beforeStatus?.pendingDecision?.kind === 'execution-readiness' &&
    freezeResult.status === 0 &&
    freezeJson?.state === 'DESIGN_APPROVED' &&
    freezeJson?.stage === 'plan' &&
    freezeJson?.workflow?.nextEntry === '/harness-plan' &&
    freezeJson?.pendingDecision === null &&
    afterFreeze.gates?.designApproved === true &&
    afterFreeze.state === 'DESIGN_APPROVED' &&
    eventLogText.includes('"type":"decision"') &&
    reviseResult.status === 0 &&
    reviseJson?.state === 'DISCOVERED' &&
    reviseJson?.stage === 'design' &&
    reviseJson?.workflow?.nextEntry === '/harness-design' &&
    reviseJson?.pendingDecision === null &&
    reviseJson?.currentGap === 'execution deepening 切片仍需修订。' &&
    JSON.stringify(afterRevise.approvals.design) === JSON.stringify(reviewProjection) &&
    eventLogTextAfterRevise.includes('"type":"decision"');

  if (mode === 'red') {
    if (!ok) {
      fail('Expected execution-readiness workflow decisions to remain unsupported before implementation');
    }
    pass('Red precondition no longer holds.');
  }

  if (!ok) {
    fail('Expected workflow progression decision contract to pass');
  }

  pass(mode === 'green' ? 'Green workflow-progression-decision smoke passed.' : 'Workflow-progression-decision verify smoke passed.');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
