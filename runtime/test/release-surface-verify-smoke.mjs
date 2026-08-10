import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const verifyPath = path.join(repoRoot, 'runtime', 'verify.mjs');
const mode = process.argv[2];

if (!['red', 'green', 'verify'].includes(mode)) {
  console.error('Usage: node runtime/test/release-surface-verify-smoke.mjs <red|green|verify>');
  process.exit(1);
}

// Copy the repo into a temp fixture so we can inject an invalid active change
// without mutating the real workspace. This keeps the test deterministic:
// development verify must block the injected invalid change, release-surface
// verify must ignore development-only change assets.
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.codegraph' || entry.name === '.bun' || entry.name === '.cache') continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(srcPath, destPath);
    else fs.copyFileSync(srcPath, destPath);
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

function invalidState(changeId) {
  return {
    schemaVersion: 4,
    revision: 1,
    changeId,
    tier: 'L3',
    state: 'PLANNED',
    owner: 'fixture',
    impact: { api: 'yes', data: 'yes', architecture: 'yes', rule: 'yes' },
    tooling: { codegraph: { status: 'unknown', queries: [], fallbackReason: null }, documentation: { status: 'unknown', libraries: [] } },
    decisions: [],
    blockers: [],
    approvals: {},
    gates: { designApproved: true, redVerified: false, redTask: null, redEvidenceRef: null },
    currentTask: null,
    workflow: { stage: 'tdd', clarifyReady: true, userConfirmedScope: true, routeReady: true, planReady: true, tddStatus: 'not-started', nextEntry: '/harness-tdd' },
    validation: { status: 'stale', digest: null, validatedAt: null },
  };
}

function setupFixture() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'release-surface-verify-'));
  const repoCopy = path.join(tempRoot, 'repo');
  copyDir(repoRoot, repoCopy);
  // Wipe any real changes so the fixture's injected invalid change is the only
  // tracked change and the result is deterministic.
  fs.rmSync(path.join(repoCopy, 'harness', 'changes'), { recursive: true, force: true });
  const changeId = 'invalid-fixture-change';
  const changeDir = path.join(repoCopy, 'harness', 'changes', changeId);
  writeJson(path.join(changeDir, 'state.json'), invalidState(changeId));
  fs.writeFileSync(path.join(changeDir, 'change.md'), '# Change\n', 'utf-8');
  fs.writeFileSync(path.join(changeDir, 'requirements.md'), '# Requirements\n', 'utf-8');
  fs.writeFileSync(path.join(changeDir, 'validation.md'), '# Validation\n', 'utf-8');
  fs.writeFileSync(path.join(repoCopy, 'harness', 'ACTIVE_CHANGE'), `${changeId}\n`, 'utf-8');
  return { tempRoot, repoCopy };
}

const { tempRoot, repoCopy } = setupFixture();
try {
  const normal = spawnSync(process.execPath, [verifyPath, '--json'], {
    cwd: repoCopy,
    encoding: 'utf-8',
  });
  assert.notEqual(normal.status, 0, 'development verification must block invalid active change assets');
  const normalResult = JSON.parse(normal.stdout);
  assert.equal(normalResult.scope, 'development');
  assert.equal(normalResult['consumed-evidence-summary'].developmentChangeValidationSkipped, false);

  const releaseSurface = spawnSync(process.execPath, [verifyPath, '--release-surface', '--json'], {
    cwd: repoCopy,
    encoding: 'utf-8',
  });

  assert.equal(
    releaseSurface.status,
    0,
    `release-surface verification must ignore development-only active change assets: ${releaseSurface.stderr || releaseSurface.stdout}`,
  );

  const parsed = JSON.parse(releaseSurface.stdout);
  assert.equal(parsed.ok, true, 'release-surface verification must report a passing contract');
  assert.equal(parsed.scope, 'release-surface');
  assert.equal(
    parsed['consumed-evidence-summary'].developmentChangeValidationSkipped,
    true,
    'release-surface verification must report that it excluded development-only change assets',
  );

  console.log(`PASS release-surface-verify ${mode}`);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
