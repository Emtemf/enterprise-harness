import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { normalizeDigestContent, normalizeDigestPath } from '../lib/checks.mjs';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const verifyPath = path.join(repoRoot, 'harness', 'plugin', 'runtime', 'verify.mjs');
const lifecyclePath = path.join(repoRoot, 'harness', 'plugin', 'runtime', 'lifecycle.mjs');
const postWritePath = path.join(repoRoot, 'harness', 'plugin', 'runtime', 'hooks', 'post-write.mjs');
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
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

function writeText(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, 'utf-8');
}

function createTempRepo() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-hardening-digest-'));
  const repoCopy = path.join(tempRoot, 'repo');
  copyDir(repoRoot, repoCopy);
  return { tempRoot, repoCopy };
}

function collectDigestFiles(changeDir, relDir) {
  const dir = path.join(changeDir, relDir);
  if (!fs.existsSync(dir)) return [];
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const digestPath = `${relDir}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...collectDigestFiles(changeDir, digestPath));
    } else {
      files.push(digestPath);
    }
  }
  return files.sort();
}

function computePortableDigest(repoCopy, changeId) {
  const changeDir = path.join(repoCopy, 'harness', 'changes', changeId);
  const hash = crypto.createHash('sha256');
  const statePath = path.join(changeDir, 'state.json');
  const state = readJson(statePath);
  const normalizedState = {
    ...state,
    validation: {
      status: null,
      digest: null,
      validatedAt: null,
    },
  };
  hash.update('state.json\n');
  hash.update(normalizeDigestContent(JSON.stringify(normalizedState)));
  hash.update('\n');

  const directFiles = ['requirements.md', 'change.md', 'design.md', 'tasks.md', 'validation.md'];
  const nestedFiles = [
    ...collectDigestFiles(changeDir, 'reviews'),
    ...collectDigestFiles(changeDir, 'evidence'),
    ...collectDigestFiles(changeDir, 'specs'),
  ];

  for (const relPath of [...directFiles, ...nestedFiles]) {
    const fullPath = path.join(changeDir, ...relPath.split('/'));
    if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) continue;
    hash.update(`${relPath}\n`);
    hash.update(normalizeDigestContent(fs.readFileSync(fullPath, 'utf-8')));
    hash.update('\n');
  }

  return hash.digest('hex');
}

function createChange(repoCopy) {
  const changeId = 'validation-digest-smoke';
  const changeDir = path.join(repoCopy, 'harness', 'changes', changeId);
  fs.mkdirSync(path.join(changeDir, 'evidence'), { recursive: true });
  fs.mkdirSync(path.join(changeDir, 'reviews'), { recursive: true });
  fs.mkdirSync(path.join(changeDir, 'specs'), { recursive: true });
  writeJson(path.join(changeDir, 'state.json'), {
    schemaVersion: 1,
    changeId,
    tier: 'L3',
    state: 'REVIEWED',
    owner: 'harness-governance',
    impact: { api: 'no', data: 'no', architecture: 'yes', rule: 'yes' },
    tooling: {
      codegraph: { status: 'available', queries: [], fallbackReason: null },
      documentation: { status: 'not-needed', libraries: [] },
    },
    decisions: [],
    blockers: [],
    approvals: {
      design: { status: 'pass', reviewerId: 'design-reviewer', reviewedAt: '2026-07-16' },
      plan: { status: 'pass', reviewerId: 'plan-critic', reviewedAt: '2026-07-16' },
    },
    gates: {
      designApproved: true,
      redVerified: true,
      redTask: 'Task 5 smoke',
      redEvidenceRef: 'task-5-red-proof',
    },
    currentTask: 'Task 5 smoke',
    validation: { status: 'missing', digest: null, validatedAt: null },
  });
  writeText(path.join(changeDir, 'change.md'), '# Change\n\nInitial change body.\n');
  writeText(path.join(changeDir, 'design.md'), '# Design\n');
  writeText(path.join(changeDir, 'tasks.md'), '# Tasks\n');
  writeText(path.join(changeDir, 'validation.md'), '# Validation\n');
  writeText(path.join(changeDir, 'evidence', 'tooling.md'), '# Tooling Evidence\n');
  writeText(path.join(changeDir, 'evidence', 'nested', 'tooling-extra.md'), '# Extra Tooling Evidence\n');
  writeText(path.join(changeDir, 'specs', 'nested', 'digest-contract.md'), '# Digest Contract\n');
  for (const [reviewerId, verdict] of [['design-reviewer', 'pass'], ['plan-critic', 'pass'], ['verification-reviewer', 'pass']]) {
    writeJson(path.join(changeDir, 'reviews', `${reviewerId}.json`), {
      changeId,
      reviewerId,
      verdict,
      findings: [],
      evidence: ['validation digest smoke'],
      digest: null,
      reviewedAt: '2026-07-16',
    });
  }
  fs.writeFileSync(path.join(repoCopy, 'harness', 'ACTIVE_CHANGE'), `${changeId}\n`, 'utf-8');
  return { changeId, changeDir, statePath: path.join(changeDir, 'state.json'), changePath: path.join(changeDir, 'change.md') };
}

function run(command, args, cwd, input) {
  return spawnSync(command, args, {
    cwd,
    encoding: 'utf-8',
    input,
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
  console.error('Usage: node harness/plugin/runtime/test/gate-hardening-validation-digest-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const { tempRoot, repoCopy } = createTempRepo();
try {
  fs.rmSync(path.join(repoCopy, 'harness', 'changes'), { recursive: true, force: true });

  const { changeId, statePath, changePath } = createChange(repoCopy);
  const callerDigest = 'caller-supplied-digest';
  const validated = run('node', [lifecyclePath, 'validated', changeId, callerDigest, '2026-07-16'], repoCopy);
  const afterValidated = readJson(statePath);
  const portableDigest = computePortableDigest(repoCopy, changeId);
  fs.appendFileSync(changePath, 'Mutated after validation.\n', 'utf-8');
  const verifyAfterMutation = run('node', [verifyPath, '--json'], repoCopy);
  const postWrite = run('node', [postWritePath], repoCopy, JSON.stringify({ tool_input: { file_path: changePath } }));
  const afterPostWrite = readJson(statePath);

  let parsed = null;
  try {
    parsed = JSON.parse(verifyAfterMutation.stdout);
  } catch {
    parsed = null;
  }
  const problems = parsed?.problems ?? parsed?.contractChecks?.problems ?? [];
  const hasComputedDigest = afterValidated.validation?.status === 'fresh'
    && afterValidated.validation?.digest
    && afterValidated.validation.digest !== callerDigest;
  const hasPortableDigest = afterValidated.validation?.digest === portableDigest;
  const hasVerifyDigestFailure = problems.some((problem) => problem.includes('validation-digest-smoke') && problem.includes('validation digest mismatch'));
  const hasPostWriteStale = afterPostWrite.validation?.status === 'stale' && afterPostWrite.validation?.digest === null;
  const hasNormalizedWindowsPath = normalizeDigestPath('reviews\\nested\\advisory-reviewer.json') === 'reviews/nested/advisory-reviewer.json';
  const ok = validated.status === 0
    && hasComputedDigest
    && hasPortableDigest
    && verifyAfterMutation.status !== 0
    && hasVerifyDigestFailure
    && hasPostWriteStale
    && hasNormalizedWindowsPath;

  if (mode === 'red') {
    if (!ok) {
      fail('Expected validated lifecycle to reject caller-supplied or stale validation digest semantics');
    }
    pass('Red precondition no longer holds.');
  }

  if (!ok) {
    fail('Expected validated lifecycle to reject caller-supplied or stale validation digest semantics');
  }

  pass(mode === 'green' ? 'Green gate-hardening validation-digest smoke passed.' : 'Gate-hardening validation-digest verify smoke passed.');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
