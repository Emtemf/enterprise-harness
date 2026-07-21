import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const repoRoot = '/home/wula/IdeaProjects/sdd';
const statusPath = path.join(repoRoot, 'harness', 'plugin', 'runtime', 'status.mjs');
const sessionStartPath = path.join(repoRoot, 'harness', 'plugin', 'runtime', 'hooks', 'session-start.mjs');
const mode = process.argv[2];
const reminderLine = 'GUIDE.md 导航卡';
const expectedGap = '缺少 design.md。';

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
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'guide-reminder-smoke-'));
  const repoCopy = path.join(tempRoot, 'repo');
  copyDir(repoRoot, repoCopy);
  return { tempRoot, repoCopy };
}

function writeChange(repoCopy, changeId, withGuide) {
  const changeDir = path.join(repoCopy, 'harness', 'changes', changeId);
  fs.mkdirSync(path.join(changeDir, 'evidence'), { recursive: true });
  fs.mkdirSync(path.join(changeDir, 'reviews'), { recursive: true });
  fs.writeFileSync(path.join(changeDir, 'change.md'), '# Change\n', 'utf-8');
  fs.writeFileSync(path.join(changeDir, 'requirements.md'), '# Requirements\n', 'utf-8');
  fs.writeFileSync(path.join(changeDir, 'validation.md'), '# Validation\n', 'utf-8');
  if (withGuide) {
    fs.writeFileSync(path.join(changeDir, 'GUIDE.md'), '# GUIDE\n', 'utf-8');
  }
  fs.writeFileSync(
    path.join(changeDir, 'state.json'),
    JSON.stringify({
      schemaVersion: 1,
      changeId,
      tier: 'L2',
      state: 'DISCOVERED',
      owner: 'harness-governance',
      impact: { api: 'no', data: 'no', architecture: 'no', rule: 'yes' },
      tooling: { codegraph: { status: 'not-needed', queries: [], fallbackReason: null }, documentation: { status: 'not-needed', libraries: [] } },
      decisions: [],
      blockers: [],
      approvals: {},
      gates: { designApproved: false, redVerified: false, redTask: null, redEvidenceRef: null },
      currentTask: null,
      workflow: {
        stage: 'design',
        clarifyReady: true,
        userConfirmedScope: true,
        planReady: false,
        tddStatus: 'not-started',
        nextEntry: '/harness-design',
      },
      validation: { status: 'missing', digest: null, validatedAt: null },
    }, null, 2) + '\n',
    'utf-8',
  );
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
  console.error('Usage: node harness/plugin/runtime/test/guide-reminder-contract-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const { tempRoot, repoCopy } = setupTempRepo();
try {
  const changeId = 'guide-reminder-change';
  writeChange(repoCopy, changeId, false);
  fs.writeFileSync(path.join(repoCopy, 'harness', 'ACTIVE_CHANGE'), `${changeId}\n`, 'utf-8');

  const statusJson = spawnSync('node', [path.join(repoCopy, 'harness', 'plugin', 'runtime', 'status.mjs'), '--json'], {
    cwd: repoCopy,
    encoding: 'utf-8',
  });
  const sessionStart = spawnSync('node', [sessionStartPath], {
    cwd: repoCopy,
    encoding: 'utf-8',
  });

  let parsed = null;
  try { parsed = JSON.parse(statusJson.stdout); } catch {}

  const missingGuideOk =
    statusJson.status === 0 &&
    parsed?.currentGap === expectedGap &&
    parsed?.activeChange?.guideReminder &&
    String(sessionStart.stdout || '').includes(reminderLine) &&
    String(sessionStart.stdout || '').includes(expectedGap);

  writeChange(repoCopy, changeId, true);
  const statusJsonWithGuide = spawnSync('node', [path.join(repoCopy, 'harness', 'plugin', 'runtime', 'status.mjs'), '--json'], {
    cwd: repoCopy,
    encoding: 'utf-8',
  });
  let parsedWithGuide = null;
  try { parsedWithGuide = JSON.parse(statusJsonWithGuide.stdout); } catch {}
  const withGuideOk =
    statusJsonWithGuide.status === 0 &&
    parsedWithGuide?.currentGap === expectedGap &&
    !parsedWithGuide?.activeChange?.guideReminder;

  const ok = missingGuideOk && withGuideOk;

  if (mode === 'red') {
    if (!ok) {
      fail('Expected guide-reminder contract to fail before implementation');
    }
    pass('Red precondition no longer holds.');
  }

  if (!ok) {
    const failures = [];
    if (statusJson.status !== 0) failures.push('status --json failed for missing-guide scenario');
    if (parsed?.currentGap !== expectedGap) failures.push(`currentGap changed: expected ${expectedGap}, got ${parsed?.currentGap}`);
    if (!parsed?.activeChange?.guideReminder) failures.push('missing-guide scenario did not expose activeChange.guideReminder');
    if (!String(sessionStart.stdout || '').includes(reminderLine)) failures.push('SessionStart output is missing GUIDE reminder line');
    if (!String(sessionStart.stdout || '').includes(expectedGap)) failures.push('SessionStart output no longer includes original currentGap line');
    if (statusJsonWithGuide.status !== 0) failures.push('status --json failed for with-guide scenario');
    if (parsedWithGuide?.currentGap !== expectedGap) failures.push(`currentGap changed with GUIDE present: expected ${expectedGap}, got ${parsedWithGuide?.currentGap}`);
    if (parsedWithGuide?.activeChange?.guideReminder) failures.push('with-guide scenario should not expose guideReminder');
    fail(`Expected guide-reminder contract to pass:\n${failures.join('\n')}`);
  }

  pass(mode === 'green' ? 'Green guide-reminder contract smoke passed.' : 'Guide-reminder contract verify smoke passed.');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
