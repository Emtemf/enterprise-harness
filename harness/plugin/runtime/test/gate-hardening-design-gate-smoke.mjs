import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const cliPath = path.join(repoRoot, 'harness', 'plugin', 'runtime', 'cli.mjs');
const fixturesRoot = path.join(repoRoot, 'harness', 'plugin', 'runtime', 'test', 'fixtures');
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

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

function writeText(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, 'utf-8');
}

function createTempRepo() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-hardening-design-'));
  const repoCopy = path.join(tempRoot, 'repo');
  copyDir(repoRoot, repoCopy);
  return { tempRoot, repoCopy };
}

function createChange(repoCopy, changeId, state, options = {}) {
  const changeDir = path.join(repoCopy, 'harness', 'changes', changeId);
  fs.mkdirSync(path.join(changeDir, 'evidence'), { recursive: true });
  fs.mkdirSync(path.join(changeDir, 'reviews'), { recursive: true });
  writeJson(path.join(changeDir, 'state.json'), state);
  writeText(path.join(changeDir, 'change.md'), '# Change\n');
  writeText(path.join(changeDir, 'design.md'), '# Design\n');
  writeText(path.join(changeDir, 'validation.md'), '# Validation\n');
  writeText(path.join(changeDir, 'evidence', 'tooling.md'), '# Tooling Evidence\n');
  if (options.designReviewVerdict) {
    writeJson(path.join(changeDir, 'reviews', 'design-reviewer.json'), {
      changeId,
      reviewerId: 'design-reviewer',
      verdict: options.designReviewVerdict,
      findings: options.designReviewVerdict === 'block' ? ['blocked in smoke fixture'] : [],
      evidence: ['design gate smoke fixture'],
      digest: null,
      reviewedAt: '2026-07-16',
    });
  }
}

function runVerify(cwd) {
  return spawnSync('node', [cliPath, 'verify', '--json'], {
    cwd,
    encoding: 'utf-8',
  });
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
  console.error('Usage: node harness/plugin/runtime/test/gate-hardening-design-gate-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const { tempRoot, repoCopy } = createTempRepo();
try {
  const skeletonStatePath = path.join(repoCopy, 'harness', 'changes', 'gate-tightening-skeleton', 'state.json');
  if (fs.existsSync(skeletonStatePath)) {
    const skeletonState = readJson(skeletonStatePath);
    delete skeletonState.gates;
    writeJson(skeletonStatePath, skeletonState);
  }

  const baseState = readJson(path.join(fixturesRoot, 'design-gate-missing-review', 'state.json'));
  createChange(repoCopy, baseState.changeId, baseState);

  const missingApprovalState = {
    ...baseState,
    changeId: 'design-gate-missing-approval',
    state: 'TASKED',
    gates: {
      ...baseState.gates,
      designApproved: false,
    },
  };
  createChange(repoCopy, missingApprovalState.changeId, missingApprovalState, { designReviewVerdict: 'pass' });

  const blockedReviewState = {
    ...baseState,
    changeId: 'design-gate-blocked-review',
  };
  createChange(repoCopy, blockedReviewState.changeId, blockedReviewState, { designReviewVerdict: 'block' });

  const result = runVerify(repoCopy);
  let parsed = null;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    parsed = null;
  }

  const problems = parsed?.contractChecks?.problems ?? parsed?.problems ?? [];
  const hasMissingReviewFailure = problems.some((problem) => problem.includes('design-gate-missing-review') && problem.includes('design-reviewer'));
  const hasMissingApprovalFailure = problems.some((problem) => problem.includes('design-gate-missing-approval') && problem.includes('designApproved'));
  const hasBlockedReviewFailure = problems.some((problem) => problem.includes('design-gate-blocked-review') && problem.includes('block verdict'));
  const ok = result.status !== 0 && parsed && hasMissingReviewFailure && hasMissingApprovalFailure && hasBlockedReviewFailure;

  if (mode === 'red') {
    if (!ok) {
      fail('Expected DESIGN_APPROVED transition to be blocked when design reviewer verdict is missing or block');
    }
    pass('Red precondition no longer holds.');
  }

  if (!ok) {
    fail('Expected DESIGN_APPROVED transition to be blocked when design reviewer verdict is missing or block');
  }

  pass(mode === 'green' ? 'Green gate-hardening design gate smoke passed.' : 'Gate-hardening design gate verify smoke passed.');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
