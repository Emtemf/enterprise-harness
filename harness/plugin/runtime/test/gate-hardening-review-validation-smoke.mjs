import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const cliPath = path.join(repoRoot, 'harness', 'plugin', 'runtime', 'cli.mjs');
const stopPath = path.join(repoRoot, 'harness', 'plugin', 'runtime', 'hooks', 'stop.mjs');
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
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-hardening-review-'));
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
  if (options.reviews) {
    for (const [reviewerId, verdict] of Object.entries(options.reviews)) {
      writeJson(path.join(changeDir, 'reviews', `${reviewerId}.json`), {
        changeId,
        reviewerId,
        verdict,
        findings: verdict === 'block' ? ['blocked in smoke fixture'] : [],
        evidence: ['review validation smoke fixture'],
        digest: null,
        reviewedAt: '2026-07-16',
      });
    }
  }
}

function ensureReview(repoCopy, changeId, reviewerId, verdict) {
  const reviewsDir = path.join(repoCopy, 'harness', 'changes', changeId, 'reviews');
  fs.mkdirSync(reviewsDir, { recursive: true });
  writeJson(path.join(reviewsDir, `${reviewerId}.json`), {
    changeId,
    reviewerId,
    verdict,
    findings: verdict === 'block' ? ['blocked in smoke fixture'] : [],
    evidence: ['review validation smoke fixture'],
    digest: null,
    reviewedAt: '2026-07-16',
  });
}

function runVerify(cwd) {
  return spawnSync('node', [cliPath, 'verify', '--json'], {
    cwd,
    encoding: 'utf-8',
  });
}

function runStop(cwd) {
  return spawnSync('node', [stopPath], {
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
  console.error('Usage: node harness/plugin/runtime/test/gate-hardening-review-validation-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const { tempRoot, repoCopy } = createTempRepo();
try {
  const staleFixture = readJson(path.join(fixturesRoot, 'review-validation-stale', 'state.json'));
  const skeletonStatePath = path.join(repoCopy, 'harness', 'changes', 'gate-tightening-skeleton', 'state.json');
  if (fs.existsSync(skeletonStatePath)) {
    const skeletonState = readJson(skeletonStatePath);
    delete skeletonState.gates;
    writeJson(skeletonStatePath, skeletonState);
  }

  const normalizedReviews = [
    ['intake-smoke-demo', 'verification-reviewer'],
    ['phase0-claude-governance-skeleton', 'verification-reviewer'],
    ['plugin-runtime-skeleton', 'verification-reviewer'],
    ['reference-service-boundary-realignment', 'api-consistency-reviewer'],
    ['reference-service-boundary-realignment', 'verification-reviewer'],
  ];
  for (const [changeId, reviewerId] of normalizedReviews) {
    ensureReview(repoCopy, changeId, reviewerId, 'pass');
  }

  createChange(repoCopy, staleFixture.changeId, staleFixture, {
    reviews: {
      'design-reviewer': 'pass',
      'verification-reviewer': 'pass',
    },
  });
  createChange(repoCopy, 'review-validation-reviewed-stale', {
    schemaVersion: 1,
    changeId: 'review-validation-reviewed-stale',
    tier: 'L2',
    state: 'REVIEWED',
    owner: 'harness-governance',
    impact: { api: 'no', data: 'no', architecture: 'yes', rule: 'yes' },
    tooling: {
      codegraph: { status: 'available', queries: [], fallbackReason: null },
      documentation: { status: 'not-needed', libraries: [] },
    },
    decisions: [],
    blockers: [],
    approvals: {},
    gates: { designApproved: true, redVerified: true },
    currentTask: 'Task 3 smoke',
    validation: { status: 'stale', digest: 'review-validation-reviewed-stale', validatedAt: '2026-07-16' },
  }, {
    reviews: {
      'design-reviewer': 'pass',
    },
  });
  createChange(repoCopy, 'review-validation-missing-api-review', {
    schemaVersion: 1,
    changeId: 'review-validation-missing-api-review',
    tier: 'L2',
    state: 'REVIEWED',
    owner: 'harness-governance',
    impact: { api: 'yes', data: 'no', architecture: 'yes', rule: 'yes' },
    tooling: {
      codegraph: { status: 'available', queries: [], fallbackReason: null },
      documentation: { status: 'not-needed', libraries: [] },
    },
    decisions: [],
    blockers: [],
    approvals: {},
    gates: { designApproved: true, redVerified: true },
    currentTask: 'Task 3 smoke',
    validation: { status: 'fresh', digest: 'review-validation-missing-api-review', validatedAt: '2026-07-16' },
  }, {
    reviews: {
      'design-reviewer': 'pass',
      'verification-reviewer': 'pass',
    },
  });

  const verifyResult = runVerify(repoCopy);
  const stopReviewerResult = runStop(repoCopy);
  fs.rmSync(path.join(repoCopy, 'harness', 'changes', 'review-validation-missing-api-review'), { recursive: true, force: true });
  const stopReviewedStaleResult = runStop(repoCopy);
  fs.rmSync(path.join(repoCopy, 'harness', 'changes', 'review-validation-reviewed-stale'), { recursive: true, force: true });
  const stopValidatedStaleResult = runStop(repoCopy);
  let parsed = null;
  try {
    parsed = JSON.parse(verifyResult.stdout);
  } catch {
    parsed = null;
  }
  const problems = parsed?.contractChecks?.problems ?? parsed?.problems ?? [];
  const stopReviewerOutput = `${stopReviewerResult.stdout || ''}${stopReviewerResult.stderr || ''}`;
  const stopReviewedStaleOutput = `${stopReviewedStaleResult.stdout || ''}${stopReviewedStaleResult.stderr || ''}`;
  const stopValidatedStaleOutput = `${stopValidatedStaleResult.stdout || ''}${stopValidatedStaleResult.stderr || ''}`;
  const hasReviewerFailure = problems.some((problem) => problem.includes('review-validation-missing-api-review') && problem.includes('api-consistency-reviewer'));
  const hasVerifyStaleFailure = problems.some((problem) => problem.includes('review-validation-reviewed-stale') && problem.includes('REVIEWED requires fresh validation'));
  const hasStopReviewerBlock = stopReviewerResult.status === 2 && stopReviewerOutput.includes('reviewer verdict 未满足完成态要求') && stopReviewerOutput.includes('review-validation-missing-api-review');
  const hasStopReviewedStaleBlock = stopReviewedStaleResult.status === 2 && stopReviewedStaleOutput.includes('review-validation-reviewed-stale') && stopReviewedStaleOutput.includes('validation.status=stale');
  const hasStopValidatedStaleBlock = stopValidatedStaleResult.status === 2 && stopValidatedStaleOutput.includes('review-validation-stale') && stopValidatedStaleOutput.includes('validation.status=stale');
  const ok = verifyResult.status !== 0 && parsed && hasReviewerFailure && hasVerifyStaleFailure && hasStopReviewerBlock && hasStopReviewedStaleBlock && hasStopValidatedStaleBlock;

  if (mode === 'red') {
    if (!ok) {
      fail('Expected blocking review verdict or stale validation to fail verification/stop contract');
    }
    pass('Red precondition no longer holds.');
  }

  if (!ok) {
    fail('Expected blocking review verdict or stale validation to fail verification/stop contract');
  }

  pass(mode === 'green' ? 'Green gate-hardening review-validation smoke passed.' : 'Gate-hardening review-validation verify smoke passed.');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
